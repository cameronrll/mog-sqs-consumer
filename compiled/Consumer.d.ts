/// <reference types="node" />
import * as AWS from 'aws-sdk';
import { EventEmitter } from 'events';
import { ResultHandler } from "./ResultHandler";
export interface ConsumerOptions {
    queueName?: string;
    isFifo?: boolean;
    resultHandler?: ResultHandler;
    delayOptions?: {
        standard: number;
        reject: number;
        relay: number;
    };
}
export interface RetryTopologyDetails {
    queueUrl: string;
}
export interface ArchiveTopologyDetails {
    bucketUrl: string;
}
export declare type QueueOptions = AWS.SQS.Types.CreateQueueRequest;
export declare type PollOptions = AWS.SQS.Types.ReceiveMessageRequest;
export declare type Message = AWS.SQS.Types.Message;
export declare type Messages = AWS.SQS.Types.ReceiveMessageResult;
export declare type ConsumerFunction = (m: Message) => any | Promise<any>;
export default class Consumer extends EventEmitter {
    private sqs;
    private consumerFunction;
    static defaultResultHandler: ResultHandler;
    currentReceiveRequest: AWS.Request<AWS.SQS.Types.ReceiveMessageResult, AWS.AWSError>;
    private consumerOptions;
    private queueOptions;
    private pollOptions;
    private currentQueueUrl;
    private currentQueueName;
    private retryTopology;
    private archiveTopology;
    private stopped;
    private inRelay;
    private inRetry;
    private inArchive;
    private ongoingConsumption;
    constructor(sqs: AWS.SQS, consumerFunction: ConsumerFunction, options: ConsumerOptions);
    readonly queueUrl: string;
    readonly queueName: string;
    readonly queueInfo: QueueOptions;
    readonly isStopped: boolean;
    /**
     * makes sure default options are returned if none are supplied
     * FIFO QUEUES: checks for suffix, if not appends it
     */
    private mergeQueueOptions(options);
    setUpRetryTopology(retryTopologyDetails: RetryTopologyDetails): void;
    setUpArchiveTopology(archiveTopologyDetails: ArchiveTopologyDetails): void;
    stop(): Promise<void>;
    resume(): void;
    startConsumption(): Promise<void>;
    private createQueue();
    private poll();
    private consume(response);
    private incrementCounter();
    private decreaseCounter();
}
