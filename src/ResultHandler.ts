import Consumer, {Message} from "./Consumer";

export interface ResultContextOptions {
    retryQueueUrl?: string,
    archiveBucketUrl?: string,
    rejectDelay?: number
}

export class ResultContext {

    static defaultOptions: ResultContextOptions = {
        rejectDelay: 0
    };

    public message: AWS.SQS.Types.Message;
    public consumer: Consumer;

    constructor (private sqs: AWS.SQS, private options: ResultContextOptions) {
        if(!options.rejectDelay) {
            this.options = ResultContext.defaultOptions;
        }
    }

    async ack() {
        try{
            await this.sqs.deleteMessage({
                QueueUrl: this.consumer.queueUrl,
                ReceiptHandle: this.message.ReceiptHandle
            }).promise();
            //TODO: do we really need to pass the message back here?
            this.consumer.emit('consumed', this.message);
        }catch(e){
            this.consumer.emit('error', e);
        }
    }

    async archive(modifiedMessage?: Message) {
        this.consumer.emit('archive_started');

        this.consumer.emit('archive_complete');
    }

    async reject() {
        try{
            //TODO: make sure this works as expected for fifo (all messages still consumed sync)
            await this.sqs.changeMessageVisibility({
                QueueUrl: this.consumer.queueUrl,
                ReceiptHandle: this.message.ReceiptHandle,
                VisibilityTimeout: this.options.rejectDelay
            }).promise();
            this.consumer.emit('rejected', this.message)
        }catch(e){
            this.consumer.emit('error', e);
        }
    }

    async relay(modifiedMessage?: Message) {
        this.consumer.emit('relay_started');

        this.consumer.emit('relay_complete')
    }

    async retry(modifiedMessage?: Message) {
        this.consumer.emit('retry_started');

        this.consumer.emit('retry_complete');
    }
}

export type ResultHandler = (context: ResultContext, error: any, result?: any) => void;