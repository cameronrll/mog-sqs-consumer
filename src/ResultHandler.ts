import Consumer, {Message} from "./Consumer";
const randomID = require('random-id');

export interface ResultContextOptions {
    retryQueueUrl?: string,
    archiveBucketUrl?: string,
    rejectDelay?: number,
    relayDelay?: number
}

export class ResultContext {

    static defaultOptions: ResultContextOptions = {
        rejectDelay: 0,
        relayDelay: 60
    };

    public message: AWS.SQS.Types.Message;
    public consumer: Consumer;

    constructor (private sqs: AWS.SQS, private options: ResultContextOptions) {
        if (!options.rejectDelay) {
            this.options.rejectDelay = ResultContext.defaultOptions.rejectDelay;
        }
        if (!options.relayDelay) {
           this.options.relayDelay = ResultContext.defaultOptions.relayDelay;
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
        const message = modifiedMessage ? modifiedMessage : this.message;

        //TODO: finish this off

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
        const messageToSend = modifiedMessage ? modifiedMessage : this.message;
        try{
            await this.sqs.deleteMessage({
                QueueUrl: this.consumer.queueUrl,
                ReceiptHandle: this.message.ReceiptHandle
            }).promise();

            //TODO: check if this is the case or if im just doing it wrong
            //Strip all of the values sqs wont let us send
            Object.keys(messageToSend.MessageAttributes).map((key: string, index: number) => {
                delete messageToSend.MessageAttributes[key].BinaryListValues;
                delete messageToSend.MessageAttributes[key].StringListValues;
            });

            await this.sqs.sendMessage({
                MessageBody: messageToSend.Body,
                QueueUrl: this.consumer.queueUrl,
                MessageAttributes: messageToSend.MessageAttributes,
                DelaySeconds: this.options.relayDelay
            }).promise();
        } catch(e) {
            this.consumer.emit('error', e);
        }

        this.consumer.emit('relay_complete')
    }

    async retry(modifiedMessage?: Message) {
        if (!this.options.retryQueueUrl) {
            throw new Error('Please setup retry queue topology on the consumer manager first');
        }
        this.consumer.emit('retry_started');
        const messageToSend = modifiedMessage ? modifiedMessage: this.message;
        try{
            await this.sqs.deleteMessage({
                QueueUrl: this.consumer.queueUrl,
                ReceiptHandle: this.message.ReceiptHandle
            }).promise();

            //TODO: check if this is the case or if im just doing it wrong
            //Strip all of the values sqs wont let us send
            Object.keys(messageToSend.MessageAttributes).map((key: string, index:number) => {
                delete messageToSend.MessageAttributes[key].BinaryListValues;
                delete messageToSend.MessageAttributes[key].StringListValues;
            });

            //TODO: figure out if we need these to be FIFO (think we want them to be)
            //TODO: figure out if we can send standard messages into the retry queue and get them out okay
            await this.sqs.sendMessage({
                MessageBody: messageToSend.Body,
                QueueUrl: this.options.retryQueueUrl,
                MessageGroupId: 'retries',
                MessageDeduplicationId: randomID(20, 'aA'),
                MessageAttributes: messageToSend.MessageAttributes
            }).promise();
        } catch(e) {
            this.consumer.emit('error', e);
        }

        this.consumer.emit('retry_complete');
    }
}

export type ResultHandler = (context: ResultContext, error: any, result?: any) => void;