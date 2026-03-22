const BiDirectionalPriorityQueue = require('../utils/priority-queue');

class AITaskScheduler {
    constructor() {
        this.taskQueue = new BiDirectionalPriorityQueue();
        this.isProcessing = false;
        this.maxQueueSize = 100;
        this.stats = {
            processed: 0,
            dropped: 0,
            errors: 0
        };
    }

    addTask(task, priority) {
        if (this.taskQueue.size() >= this.maxQueueSize) {
            const droppedTask = this.taskQueue.dequeue('lowest');
            this.stats.dropped++;
        }

        this.taskQueue.enqueue(task, priority);

        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing) return;

        this.isProcessing = true;

        while (!this.taskQueue.isEmpty()) {
            const currentTask = this.taskQueue.dequeue('highest');
            if (!currentTask) break;

            try {
                if (typeof currentTask.execute === 'function') {
                    await currentTask.execute();
                }
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
    }
}

module.exports = new AITaskScheduler();
