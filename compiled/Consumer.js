"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const events_1 = require("events");
const ResultHandler_1 = require("./ResultHandler");
const randomID = require('random-id');
//TODO: add in handler for the error event (make sure consumer doesnt hang or misbehave)
//TODO: we want a way to configure redrive polices for deadletter queues
class Consumer extends events_1.EventEmitter {
    constructor(sqs, consumerFunction, options) {
        super();
        this.sqs = sqs;
        this.consumerFunction = consumerFunction;
        this.stopped = true;
        this.inRelay = false;
        this.inRetry = false;
        this.inArchive = false;
        this.ongoingConsumption = 0;
        this.consumerOptions = options;
        this.consumerOptions.resultHandler = options.resultHandler ? options.resultHandler : Consumer.defaultResultHandler;
        this.queueOptions = this.mergeQueueOptions(options);
        this.on('consumed', () => this.decreaseCounter());
        this.on('rejected', () => this.decreaseCounter());
        this.on('archive_started', () => this.inArchive = true);
        this.on('archive_complete', () => {
            this.inArchive = false;
            this.decreaseCounter();
        });
        this.on('relay_started', () => this.inRelay = true);
        //TODO: think we will need to decrease the counter for this aswell (as the message is no longer being consumer)
        this.on('relay_complete', () => {
            this.inRelay = false;
            this.decreaseCounter();
        });
        this.on('retry_started', () => this.inRetry = true);
        this.on('retry_complete', () => {
            this.inRetry = false;
            this.decreaseCounter();
        });
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
    get isStopped() {
        return this.stopped;
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
                //TODO: can we make deduping an option easily?
                'FifoQueue': `${options.isFifo}`,
                "ContentBasedDeduplication": 'true'
            };
        }
        if (options.delayOptions.standard) {
            queueOptions.Attributes = {
                'DelaySeconds': `${options.delayOptions.standard}`
            };
        }
        return queueOptions;
    }
    setUpRetryTopology(retryTopologyDetails) {
        this.retryTopology = retryTopologyDetails;
    }
    setUpArchiveTopology(archiveTopologyDetails) {
        //TODO: add this in later
        this.archiveTopology = archiveTopologyDetails;
    }
    stop() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            //TODO: double check that this will never lose us a message with ack() and reject() (shouldn't do)
            if (this.stopped) {
                throw new Error('Conumption is already stopped');
            }
            if (this.inRelay) {
                //Await for the current relay request to complete
                yield new Promise((resolve, reject) => {
                    this.on('relay_complete', () => {
                        resolve();
                    });
                });
            }
            if (this.inRetry) {
                //Await for the current retry to finish
                yield new Promise((resolve, reject) => {
                    this.on('retry_complete', () => {
                        resolve();
                    });
                });
            }
            if (this.inArchive) {
                //Await for the current upload to s3 to finish
                yield new Promise((resolve, reject) => {
                    this.on('archive_complete', () => {
                        resolve();
                    });
                });
            }
            this.stopped = true;
        });
    }
    resume() {
        if (!this.stopped) {
            throw new Error('Consumption is already running');
        }
        this.stopped = false;
        try {
            this.poll();
        }
        catch (e) {
            throw e;
        }
    }
    startConsumption() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            /**
             * Create the queue with specified name
             * will return a url even if the queue already exists, will not re-create it though
             */
            this.stopped = false;
            this.currentQueueUrl = yield this.createQueue();
            if (!this.stopped) {
                this.poll();
            }
        });
    }
    createQueue() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const queueInfo = yield this.sqs.createQueue(this.queueOptions).promise();
            return queueInfo.QueueUrl;
        });
    }
    poll() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this.stopped) {
                return;
            }
            this.pollOptions = {
                QueueUrl: this.currentQueueUrl,
                WaitTimeSeconds: 20,
                MessageAttributeNames: ['All']
            };
            this.currentReceiveRequest = this.sqs.receiveMessage(this.pollOptions);
            try {
                const result = yield this.currentReceiveRequest.promise();
                this.consume(result);
            }
            catch (e) {
                this.emit('error', e);
            }
        });
    }
    consume(response) {
        if (response && response.Messages && response.Messages.length > 0) {
            const resultHandler = this.consumerOptions.resultHandler;
            const promises = response.Messages.map((message) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                this.incrementCounter();
                let context;
                let resultContextOptions = {
                    rejectDelay: this.consumerOptions.delayOptions.reject,
                    relayDelay: this.consumerOptions.delayOptions.relay
                };
                if (this.retryTopology) {
                    resultContextOptions.retryQueueUrl = this.retryTopology.queueUrl;
                }
                if (this.archiveTopology) {
                    resultContextOptions.archiveBucketUrl = this.archiveTopology.bucketUrl;
                }
                context = new ResultHandler_1.ResultContext(this.sqs, resultContextOptions);
                context.message = message;
                context.consumer = this;
                try {
                    const result = this.consumerFunction(message);
                    if (result instanceof Object && 'then' in result) {
                        const consumerResult = yield result;
                        yield resultHandler(context, undefined, consumerResult);
                    }
                    else {
                        yield resultHandler(context, undefined, result);
                    }
                }
                catch (e) {
                    yield resultHandler(context, e);
                }
            }));
            Promise.all(promises)
                .then(() => {
                this.poll();
            })
                .catch(e => {
                this.emit('error', e);
                this.poll();
            });
        }
        else {
            this.poll();
        }
    }
    incrementCounter() {
        this.ongoingConsumption++;
    }
    decreaseCounter() {
        this.ongoingConsumption--;
        if (this.ongoingConsumption === 0) {
            this.emit('all-consumed');
        }
    }
}
Consumer.defaultResultHandler = function (context, err, result) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        context.ack();
    });
};
exports.default = Consumer;
