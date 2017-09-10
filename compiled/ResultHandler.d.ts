import Consumer from "./Consumer";
export interface ResultContextOptions {
    retryQueueUrl?: string;
    archiveBucketUrl?: string;
    rejectDelay?: number;
}
export declare class ResultContext {
    private sqs;
    private options;
    message: AWS.SQS.Types.Message;
    consumer: Consumer;
    constructor(sqs: AWS.SQS, options: ResultContextOptions);
}
export declare type ResultHandler = (context: ResultContext, error: any, result?: any) => void;
