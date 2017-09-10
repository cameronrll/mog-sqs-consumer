import Consumer from "./Consumer";

export interface ResultContextOptions {
    retryQueueUrl?: string,
    archiveBucketUrl?: string,
    rejectDelay?: number
}

export class ResultContext {
    public message: AWS.SQS.Types.Message;
    public consumer: Consumer;

    constructor (private sqs: AWS.SQS, private options: ResultContextOptions) {

    }
}

export type ResultHandler = (context: ResultContext, error: any, result?: any) => void;