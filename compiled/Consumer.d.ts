/// <reference types="node" />
import * as AWS from 'aws-sdk';
import { EventEmitter } from 'events';
import { ResultHandler } from "./ResultHandler";
export interface ConsumerOptions {
    queueName?: string;
    isFifo?: boolean;
    resultHandler?: ResultHandler;
    delayOptions: {
        reject: number;
        relay: number;
    };
}
export declare type QueueOptions = AWS.SQS.Types.CreateQueueRequest;
export declare type Message = AWS.SQS.Types.Message;
export declare type ConsumerFunction = (m: Message) => any | Promise<any>;
export default class Consumer extends EventEmitter {
    private sqs;
    private consumerFunction;
    static defaultResultHandler: ResultHandler;
    private consumerOptions;
    private queueOptions;
    private currentQueueUrl;
    private currentQueueName;
    constructor(sqs: AWS.SQS, consumerFunction: ConsumerFunction, options: ConsumerOptions);
    readonly queueUrl: string;
    readonly queueName: string;
    readonly queueInfo: QueueOptions;
    /**
     * makes sure default options are returned if none are supplied
     * FIFO QUEUES: checks for suffix, if not appends it
     */
    private mergeQueueOptions(options);
}
