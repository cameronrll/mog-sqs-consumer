import * as AWS from 'aws-sdk';
import { EventEmitter } from 'events';
import {ResultContext, ResultContextOptions, ResultHandler} from "./ResultHandler";
const randomID = require('random-id');

export interface ConsumerOptions {
    queueName?: string,
    isFifo?: boolean,
    resultHandler?: ResultHandler,
    delayOptions?: {
        standard: number,
        reject: number,
        relay: number
    }
}

export interface RetryTopologyDetails {
    queueUrl: string,
    delay?: number
}

export interface ArchiveTopologyDetails {
    bucketUrl: string
}

export type QueueOptions = AWS.SQS.Types.CreateQueueRequest;
export type PollOptions = AWS.SQS.Types.ReceiveMessageRequest;
export type Message = AWS.SQS.Types.Message;
export type Messages = AWS.SQS.Types.ReceiveMessageResult;
export type ConsumerFunction = (m: Message) => any | Promise<any>;

export default class Consumer extends EventEmitter {

    static defaultResultHandler: ResultHandler = async function (context: ResultContext, err?: any, result?: any) {
        //TODO: context.ack()
    };

    //TODO: does this need to be public or can we have a getter? (dont want it set outside of call)
    public currentReceiveRequest: AWS.Request<AWS.SQS.Types.ReceiveMessageResult, AWS.AWSError>;

    private consumerOptions: ConsumerOptions;
    private queueOptions: QueueOptions;
    private pollOptions: PollOptions;

    private currentQueueUrl: string;
    private currentQueueName: string;

    private retryTopology: RetryTopologyDetails;
    private archiveTopology: ArchiveTopologyDetails;

    private stopped: boolean = true;
    private inRelay: boolean = false;
    private inRetry: boolean = false;

    private ongoingConsumption: number = 0;

    constructor (
        private sqs: AWS.SQS,
        private consumerFunction: ConsumerFunction,
        options: ConsumerOptions
    ) {
        super();

        this.consumerOptions = options;
        this.consumerOptions.resultHandler = options.resultHandler ? options.resultHandler : Consumer.defaultResultHandler;
        this.queueOptions = this.mergeQueueOptions(options);

        //TODO: add events in here
        this.on('relay_started', () => this.inRelay = true);
        //TODO: think we will need to decrease the counter for this aswell (as the message is no longer being consumer)
        this.on('relay_complete', () => {
            this.inRelay = false;
            this.decreaseCounter();
        });
        this.on('retry_started', () => this.inRetry = true);
        this.on('retry_complete', () => {
            this.inRetry = false;
            this.decreaseCounter();
        });
    }

    get queueUrl(): string {
        return this.currentQueueUrl;
    }

    get queueName(): string {
        return this.currentQueueName;
    }

    get queueInfo(): QueueOptions {
        return this.queueOptions;
    }

    get isStopped(): boolean {
        return this.stopped;
    }
    /**
     * makes sure default options are returned if none are supplied
     * FIFO QUEUES: checks for suffix, if not appends it
     */
    private mergeQueueOptions(options: ConsumerOptions): QueueOptions {
        if (!options || !options.queueName){
            return {QueueName: randomID(20, 'aA')}
        } else {
            if (options.isFifo && !options.queueName.match(/\.fifo$/)) {
                options.queueName += '.fifo';
            }
        }
        this.currentQueueName = options.queueName;
        const queueOptions: QueueOptions = {
            QueueName: options.queueName
        };
        //TODO: change the way retry delay works. Add an option for a base delay into consumerOptions, and have the queue created with baseDelay
        if (options.isFifo) {
            queueOptions.Attributes = {
                'FifoQueue': `${options.isFifo}`,
                "ContentBasedDeduplication": 'true'
            }
        }
        if (options.delayOptions.standard) {
            queueOptions.Attributes = {
                'DelaySeconds': `${options.delayOptions.standard}`
            }
        }
        if (options.delayOptions.reject) {
            queueOptions.Attributes = {
                'DelaySeconds': `${options.delayOptions.reject}`
            }
        }
        return queueOptions;
    }

    setUpRetryTopology(retryTopologyDetails: RetryTopologyDetails) {
        this.retryTopology = retryTopologyDetails;
    }

    setUpArchiveTopology(archiveTopologyDetails: ArchiveTopologyDetails) {
        //TODO: add this in later
        this.archiveTopology = archiveTopologyDetails;
    }

    async stop() {
        if (this.stopped) {
            throw new Error('Conumption is already stopped');
        }
        if (this.inRelay) {
            //Await for the current relay request to complete
            await new Promise((resolve, reject) => {
                this.on('relay_complete', () => {
                    resolve();
                });
            });
        }
        if (this.inRetry) {
            //Await for the current retry to finish
            await new Promise((resolve, reject) => {
                this.on('retry_complete', () => {
                    resolve();
                });
            })
        }
        this.stopped = true;
    }

    resume() {
        if(!this.stopped) {
            throw new Error('Consumption is already running');
        }
        this.stopped = false;
        try{
            this.poll();
        } catch(e) {
            throw e;
        }
    }

    async startConsumption(): Promise<void> {
        /**
         * Create the queue with specified name
         * will return a url even if the queue already exists, will not re-create it though
         */
        this.stopped = false;
        this.currentQueueUrl = await this.createQueue();

        if(!this.stopped){
            this.poll();
        }
    }

    private async createQueue(): Promise<string> {
        const queueInfo = await this.sqs.createQueue(this.queueOptions).promise();
        return queueInfo.QueueUrl;
    }

    private async poll() {
        if (this.stopped) {
            return;
        }
        this.pollOptions = {
            QueueUrl: this.currentQueueUrl,
            WaitTimeSeconds: 20,
            MessageAttributeNames: ['All']
        };
        this.currentReceiveRequest = this.sqs.receiveMessage(this.pollOptions);
        try {
            const result = await this.currentReceiveRequest.promise();
            this.consume(result);
        } catch (e) {
            this.emit('error', e);
        }
    }

    private consume(response: Messages) {
        if(response && response.Messages && response.Messages.length > 0){
            const resultHandler = this.consumerOptions.resultHandler;
            const promises = response.Messages.map(async (message: Message) => {
                this.incrementCounter();
                let context: ResultContext;
                let resultContextOptions:ResultContextOptions = {
                    rejectDelay: this.consumerOptions.delayOptions.reject
                };
                if(this.retryTopology) {
                    resultContextOptions.retryQueueUrl = this.retryTopology.queueUrl;
                }
                if(this.archiveTopology) {
                    resultContextOptions.archiveBucketUrl = this.archiveTopology.bucketUrl;
                }
                context = new ResultContext(this.sqs, resultContextOptions);
                context.message = message;
                context.consumer = this;
                try{
                    const result = this.consumerFunction(message);
                    if(result instanceof Object && 'then' in result){
                        const consumerResult = await result;
                        await resultHandler(context, undefined, consumerResult);
                    }else{
                        await resultHandler(context, undefined, result);
                    }
                }catch(e){
                    await resultHandler(context, e);
                }
            });

            Promise.all(promises)
                .then(() => {
                    this.poll();
                })
                .catch(e => {
                    this.emit('error', e);
                    this.poll();
                })
        }else {
            this.poll();
        }
    }

    private incrementCounter() {
        this.ongoingConsumption++;
    }

    private decreaseCounter() {
        this.ongoingConsumption--;

        if(this.ongoingConsumption === 0) {
            this.emit('all-consumed');
        }
    }
}
