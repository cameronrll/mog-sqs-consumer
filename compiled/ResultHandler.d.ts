import Consumer, { Message } from "./Consumer";
export interface ResultContextOptions {
    retryQueueUrl?: string;
    archiveBucketUrl?: string;
    rejectDelay?: number;
    relayDelay?: number;
}
export declare class ResultContext {
    private sqs;
    private options;
    static defaultOptions: ResultContextOptions;
    message: AWS.SQS.Types.Message;
    consumer: Consumer;
    constructor(sqs: AWS.SQS, options: ResultContextOptions);
    ack(): Promise<void>;
    archive(modifiedMessage?: Message): Promise<void>;
    reject(): Promise<void>;
    relay(modifiedMessage?: Message): Promise<void>;
    retry(modifiedMessage?: Message): Promise<void>;
}
export declare type ResultHandler = (context: ResultContext, error: any, result?: any) => void;
