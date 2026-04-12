const BrowserXTaskQueue = require('../utils/priority-queue');

const PRIORITY = {
    LOW: 1,
    NORMAL: 5,
    HIGH: 10
};

function toPriorityOrDefault(priority) {
    if (!Number.isFinite(priority)) {
        return PRIORITY.NORMAL;
    }

    return Math.max(PRIORITY.LOW, Math.floor(priority));
}

class AITaskScheduler {
    constructor() {
        this.taskQueue = new BrowserXTaskQueue();
        this.isProcessing = false;
        this.maxQueueSize = 100;
        this.stats = {
            processed: 0,
            dropped: 0,
            errors: 0
        };
    }

    addTask(task, priority = PRIORITY.NORMAL) {
        if (!task || typeof task !== 'object') {
            throw new TypeError('Task must be an object');
        }

        if (typeof task.execute !== 'function') {
            throw new TypeError('Task.execute must be a function');
        }

        const normalizedPriority = toPriorityOrDefault(priority);

        if (this.taskQueue.size() >= this.maxQueueSize) {
            this.taskQueue.dequeue('lowest');
            this.stats.dropped++;
        }

        this.taskQueue.enqueue(task, normalizedPriority);

        if (!this.isProcessing) {
            Promise.resolve().then(() => this.processQueue());
        }

        return this.taskQueue.size();
    }

    async processQueue() {
        if (this.isProcessing) return;

        this.isProcessing = true;

        while (!this.taskQueue.isEmpty()) {
            const currentTask = this.taskQueue.dequeue('highest');
            if (!currentTask) break;

            try {
                await currentTask.execute();
                this.stats.processed++;
            } catch (error) {
                this.stats.errors++;
            }
        }

        this.isProcessing = false;
    }

    getStatus() {
        return {
            queueSize: this.taskQueue.size(),
            isProcessing: this.isProcessing,
            stats: { ...this.stats }
        };
    }

    clearQueue() {
        this.taskQueue.clear();
        return true;
    }
}

module.exports = new AITaskScheduler();
