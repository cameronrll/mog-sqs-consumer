"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const randomID = require('random-id');
class ResultContext {
    constructor(sqs, options) {
        this.sqs = sqs;
        this.options = options;
        if (!options.rejectDelay) {
            this.options.rejectDelay = ResultContext.defaultOptions.rejectDelay;
        }
        if (!options.relayDelay) {
            this.options.relayDelay = ResultContext.defaultOptions.relayDelay;
        }
    }
    ack() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                yield this.sqs.deleteMessage({
                    QueueUrl: this.consumer.queueUrl,
                    ReceiptHandle: this.message.ReceiptHandle
                }).promise();
                //TODO: do we really need to pass the message back here?
                this.consumer.emit('consumed', this.message);
            }
            catch (e) {
                this.consumer.emit('error', e);
            }
        });
    }
    archive(modifiedMessage) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.consumer.emit('archive_started');
            const message = modifiedMessage ? modifiedMessage : this.message;
            //TODO: finish this off
            this.consumer.emit('archive_complete');
        });
    }
    reject() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                //TODO: make sure this works as expected for fifo (all messages still consumed sync)
                yield this.sqs.changeMessageVisibility({
                    QueueUrl: this.consumer.queueUrl,
                    ReceiptHandle: this.message.ReceiptHandle,
                    VisibilityTimeout: this.options.rejectDelay
                }).promise();
                this.consumer.emit('rejected', this.message);
            }
            catch (e) {
                this.consumer.emit('error', e);
            }
        });
    }
    relay(modifiedMessage) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.consumer.emit('relay_started');
            const messageToSend = modifiedMessage ? modifiedMessage : this.message;
            try {
                yield this.sqs.deleteMessage({
                    QueueUrl: this.consumer.queueUrl,
                    ReceiptHandle: this.message.ReceiptHandle
                }).promise();
                //TODO: check if this is the case or if im just doing it wrong
                //Strip all of the values sqs wont let us send
                Object.keys(messageToSend.MessageAttributes).map((key, index) => {
                    delete messageToSend.MessageAttributes[key].BinaryListValues;
                    delete messageToSend.MessageAttributes[key].StringListValues;
                });
                yield this.sqs.sendMessage({
                    MessageBody: messageToSend.Body,
                    QueueUrl: this.consumer.queueUrl,
                    MessageAttributes: messageToSend.MessageAttributes,
                    DelaySeconds: this.options.relayDelay
                }).promise();
            }
            catch (e) {
                this.consumer.emit('error', e);
            }
            this.consumer.emit('relay_complete');
        });
    }
    retry(modifiedMessage) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this.options.retryQueueUrl) {
                throw new Error('Please setup retry queue topology on the consumer manager first');
            }
            this.consumer.emit('retry_started');
            const messageToSend = modifiedMessage ? modifiedMessage : this.message;
            try {
                yield this.sqs.deleteMessage({
                    QueueUrl: this.consumer.queueUrl,
                    ReceiptHandle: this.message.ReceiptHandle
                }).promise();
                //TODO: check if this is the case or if im just doing it wrong
                //Strip all of the values sqs wont let us send
                Object.keys(messageToSend.MessageAttributes).map((key, index) => {
                    delete messageToSend.MessageAttributes[key].BinaryListValues;
                    delete messageToSend.MessageAttributes[key].StringListValues;
                });
                //TODO: figure out if we need these to be FIFO (think we want them to be)
                //TODO: figure out if we can send standard messages into the retry queue and get them out okay
                yield this.sqs.sendMessage({
                    MessageBody: messageToSend.Body,
                    QueueUrl: this.options.retryQueueUrl,
                    MessageGroupId: 'retries',
                    MessageDeduplicationId: randomID(20, 'aA'),
                    MessageAttributes: messageToSend.MessageAttributes
                }).promise();
            }
            catch (e) {
                this.consumer.emit('error', e);
            }
            this.consumer.emit('retry_complete');
        });
    }
}
ResultContext.defaultOptions = {
    rejectDelay: 0,
    relayDelay: 60
};
exports.ResultContext = ResultContext;
