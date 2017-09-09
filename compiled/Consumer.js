"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const events_1 = require("events");
const randomID = require('random-id');
class Consumer extends events_1.EventEmitter {
    constructor(sqs, consumerFunction, options) {
        super();
        this.sqs = sqs;
        this.consumerFunction = consumerFunction;
        this.consumerOptions = options;
        this.consumerOptions.resultHandler = options.resultHandler ? options.resultHandler : Consumer.defaultResultHandler;
        this.queueOptions = this.mergeQueueOptions(options);
    }
    get queueUrl() {
        return this.currentQueueUrl;
    }
    get queueName() {
        return this.currentQueueName;
    }
    get queueInfo() {
        return this.queueOptions;
    }
    /**
     * makes sure default options are returned if none are supplied
     * FIFO QUEUES: checks for suffix, if not appends it
     */
    mergeQueueOptions(options) {
        if (!options || !options.queueName) {
            return { QueueName: randomID(20, 'aA') };
        }
        else {
            if (options.isFifo && !options.queueName.match(/\.fifo$/)) {
                options.queueName += '.fifo';
            }
        }
        this.currentQueueName = options.queueName;
        const queueOptions = {
            QueueName: options.queueName
        };
        if (options.isFifo) {
            queueOptions.Attributes = {
                'FifoQueue': `${options.isFifo}`,
                "ContentBasedDeduplication": 'true'
            };
        }
        return queueOptions;
    }
}
Consumer.defaultResultHandler = function (context, err, result) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        //TODO: context.ack()
    });
};
exports.default = Consumer;
