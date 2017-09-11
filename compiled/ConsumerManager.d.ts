import Consumer, { ConsumerFunction, ConsumerOptions } from "./Consumer";
import { ResultHandler } from "./ResultHandler";
export interface ConsumerManagerOptions {
    accessKey?: string;
    secretKey?: string;
    region: string;
}
export interface RetryTopologyOptions {
    queueName: string;
    delay?: number;
}
export default class ConsumerManager {
    static retryConsumerFunction: ConsumerFunction;
    static retryResultHandler: ResultHandler;
    consumers: Consumer[];
    private sqs;
    private retryQueueDetails;
    constructor(options: ConsumerManagerOptions);
    setUpRetryTopology(retryTopologyOptions: RetryTopologyOptions): Promise<void>;
    consume(consumerFunction: ConsumerFunction, options?: ConsumerOptions): Promise<void>;
    stopAllConsumers(): Promise<void>;
    resumeAllConsumers(): void;
}
