"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const AWS = require("aws-sdk");
const Consumer_1 = require("./Consumer");
const randomID = require('random-id');
class ConsumerManager {
    constructor(options) {
        this.consumers = [];
        AWS.config.update(options);
        this.sqs = new AWS.SQS();
    }
    setUpRetryTopology(retryTopologyOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const retryConsumerOptions = {
                queueName: retryTopologyOptions.queueName,
                isFifo: true,
                resultHandler: ConsumerManager.retryResultHandler,
                delayOptions: {
                    standard: retryTopologyOptions.delay
                }
            };
            const retryConsumer = new Consumer_1.default(this.sqs, ConsumerManager.retryConsumerFunction, retryConsumerOptions);
            yield retryConsumer.startConsumption();
            this.retryQueueDetails = {
                queueUrl: retryConsumer.queueUrl
            };
            this.consumers.push(retryConsumer);
        });
    }
    consume(consumerFunction, options) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const consumer = new Consumer_1.default(this.sqs, consumerFunction, options);
            //TODO: we need to add in an archive details and set it up if its configured
            if (this.retryQueueDetails) {
                consumer.setUpRetryTopology(this.retryQueueDetails);
            }
            else {
            }
            yield consumer.startConsumption();
            this.consumers.push(consumer);
        });
    }
    stopAllConsumers() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            for (const consumer of this.consumers) {
                if (!consumer.isStopped) {
                    yield consumer.stop();
                }
            }
        });
    }
    resumeAllConsumers() {
        for (const consumer of this.consumers) {
            if (consumer.isStopped) {
                consumer.resume();
            }
        }
    }
}
ConsumerManager.retryConsumerFunction = function (message) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const originalQueueUrl = message.MessageAttributes.originalQueueUrl.StringValue;
        const isFifo = originalQueueUrl.match(/\.fifo$/);
        const messageParams = {
            MessageBody: message.Body,
            QueueUrl: originalQueueUrl,
        };
        if (isFifo) {
            messageParams.MessageGroupId = 'retry';
            messageParams.MessageDeduplicationId = randomID(20, 'aA');
        }
        try {
            //Send it back to the original queue
            yield this.sqs.sendMessage(messageParams).promise();
        }
        catch (e) {
            throw e;
        }
    });
};
ConsumerManager.retryResultHandler = function (context, error, result) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        if (error) {
            context.reject();
        }
        else {
            context.ack();
        }
    });
};
exports.default = ConsumerManager;
