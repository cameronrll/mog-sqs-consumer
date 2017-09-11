import * as AWS from 'aws-sdk';
import Consumer, {ConsumerFunction, ConsumerOptions, Message, RetryTopologyDetails} from "./Consumer";
import {ResultHandler} from "./ResultHandler";
const randomID = require('random-id');

export interface  ConsumerManagerOptions {
    accessKey?: string,
    secretKey?: string,
    region: string
}

export interface RetryTopologyOptions {
    queueName: string,
    delay?: number
}

export default class ConsumerManager {

    static retryConsumerFunction: ConsumerFunction = async function(message: Message) {
        const originalQueueUrl = message.MessageAttributes.originalQueueUrl.StringValue;
        const isFifo = originalQueueUrl.match(/\.fifo$/);
        const messageParams : AWS.SQS.Types.SendMessageRequest = {
            MessageBody: message.Body,
            QueueUrl: originalQueueUrl,
        };
        if(isFifo){
            messageParams.MessageGroupId = 'retry';
            messageParams.MessageDeduplicationId = randomID(20, 'aA');
        }
        try {
            //Send it back to the original queue
            await this.sqs.sendMessage(messageParams).promise();
        } catch(e) {
            throw e;
        }
    };

    static retryResultHandler: ResultHandler = async function(context: any, error?: any, result?: any) {
        if (error) {
            context.reject();
        } else {
            context.ack();
        }
    };

    public consumers: Consumer[] = [];
    private sqs: AWS.SQS;
    private retryQueueDetails: RetryTopologyDetails;

    constructor(options: ConsumerManagerOptions) {
        AWS.config.update(options);
        this.sqs = new AWS.SQS();
    }

    async setUpRetryTopology(retryTopologyOptions: RetryTopologyOptions) {
        const retryConsumerOptions: ConsumerOptions = {
            queueName: retryTopologyOptions.queueName,
            isFifo: true,
            resultHandler: ConsumerManager.retryResultHandler,
            delayOptions: {
                standard: retryTopologyOptions.delay
            }
        };
        const retryConsumer = new Consumer(this.sqs, ConsumerManager.retryConsumerFunction, retryConsumerOptions);
        await retryConsumer.startConsumption();
        this.retryQueueDetails = {
            queueUrl: retryConsumer.queueUrl
        };
        this.consumers.push(retryConsumer);
    }

    async consume(consumerFunction: ConsumerFunction, options?: ConsumerOptions) {
        const consumer = new Consumer(this.sqs, consumerFunction, options);
        //TODO: we need to add in an archive details and set it up if its configured
        if(this.retryQueueDetails){
            consumer.setUpRetryTopology(this.retryQueueDetails);
        }else{

        }
        await consumer.startConsumption();
        this.consumers.push(consumer);
    }

    async stopAllConsumers() {
        for (const consumer of this.consumers){
            if(!consumer.isStopped){
                await consumer.stop();
            }
        }
    }

    resumeAllConsumers() {
        for(const consumer of this.consumers){
            if(consumer.isStopped){
                consumer.resume();
            }
        }
    }
}