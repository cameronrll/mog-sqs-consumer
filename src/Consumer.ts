import * as AWS from 'aws-sdk';
import { EventEmitter } from 'events';
import {ResultContext, ResultHandler} from "./ResultHandler";
const randomID = require('random-id');

export interface ConsumerOptions {
    queueName?: string,
    isFifo?: boolean,
    resultHandler?: ResultHandler,
    delayOptions: {
        reject: number,
        relay: number
    }
}

export type QueueOptions = AWS.SQS.Types.CreateQueueRequest;
export type Message = AWS.SQS.Types.Message;
export type ConsumerFunction = (m: Message) => any | Promise<any>;

export default class Consumer extends EventEmitter {

    static defaultResultHandler: ResultHandler = async function (context: ResultContext, err?: any, result?: any) {
        //TODO: context.ack()
    };

    private consumerOptions: ConsumerOptions;
    private queueOptions: QueueOptions;

    private currentQueueUrl: string;
    private currentQueueName: string;

    constructor (
        private sqs: AWS.SQS,
        private consumerFunction: ConsumerFunction,
        options: ConsumerOptions
    ) {
        super();

        this.consumerOptions = options;
        this.consumerOptions.resultHandler = options.resultHandler ? options.resultHandler : Consumer.defaultResultHandler;
        this.queueOptions = this.mergeQueueOptions(options);
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
    /**
     * makes sure default options are returned if none are supplied
     * FIFO QUEUES: checks for suffix, if not appends it
     */
    private mergeQueueOptions (options: ConsumerOptions): QueueOptions {
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
        if (options.isFifo) {
            queueOptions.Attributes = {
                'FifoQueue': `${options.isFifo}`,
                "ContentBasedDeduplication": 'true'
            }
        }
        return queueOptions;
    }
}
