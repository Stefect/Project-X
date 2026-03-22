class BiDirectionalPriorityQueue {
    constructor() {
        this.items = [];
        this.insertCounter = 0;
    }

    enqueue(item, priority) {
        this.items.push({
            item,
            priority,
            order: this.insertCounter++
        });
    }

    _findIndex(type) {
        if (this.items.length === 0) return -1;

        let targetIndex = 0;
        for (let i = 1; i < this.items.length; i++) {
            switch (type) {
                case 'highest':
                    if (this.items[i].priority > this.items[targetIndex].priority) {
                        targetIndex = i;
                    }
                    break;

                case 'lowest':
                    if (this.items[i].priority < this.items[targetIndex].priority) {
                        targetIndex = i;
                    }
                    break;

                case 'oldest':
                    if (this.items[i].order < this.items[targetIndex].order) {
                        targetIndex = i;
                    }
                    break;

                case 'newest':
                    if (this.items[i].order > this.items[targetIndex].order) {
                        targetIndex = i;
                    }
                    break;
            }
        }

        return targetIndex;
    }

    peek(type) {
        const index = this._findIndex(type);
        return index !== -1 ? this.items[index].item : null;
    }

    dequeue(type) {
        const index = this._findIndex(type);
        if (index !== -1) {
            return this.items.splice(index, 1)[0].item;
        }
        return null;
    }

    isEmpty() {
        return this.items.length === 0;
    }

    size() {
        return this.items.length;
    }

    clear() {
        this.items = [];
        this.insertCounter = 0;
    }
}

module.exports = BiDirectionalPriorityQueue;
