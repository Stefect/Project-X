class BiDirectionalPriorityQueue {
    static MODES = {
        HIGHEST: 'highest',
        LOWEST: 'lowest',
        OLDEST: 'oldest',
        NEWEST: 'newest'
    };

    constructor() {
        this.items = [];
        this.insertCounter = 0;
    }

    enqueue(item, priority) {
        if (!Number.isFinite(priority)) {
            throw new TypeError('Priority must be a finite number');
        }

        this.items.push({
            item,
            priority,
            order: this.insertCounter++
        });

        return this.items.length;
    }

    _normalizeMode(type) {
        const value = String(type || '').toLowerCase();
        const validModes = Object.values(BiDirectionalPriorityQueue.MODES);
        return validModes.includes(value) ? value : BiDirectionalPriorityQueue.MODES.HIGHEST;
    }

    _isBetterCandidate(current, candidate, mode) {
        if (mode === BiDirectionalPriorityQueue.MODES.HIGHEST) {
            if (candidate.priority !== current.priority) {
                return candidate.priority > current.priority;
            }
            return candidate.order < current.order;
        }

        if (mode === BiDirectionalPriorityQueue.MODES.LOWEST) {
            if (candidate.priority !== current.priority) {
                return candidate.priority < current.priority;
            }
            return candidate.order < current.order;
        }

        if (mode === BiDirectionalPriorityQueue.MODES.OLDEST) {
            return candidate.order < current.order;
        }

        if (mode === BiDirectionalPriorityQueue.MODES.NEWEST) {
            return candidate.order > current.order;
        }

        return false;
    }

    _findIndex(type) {
        if (this.items.length === 0) {
            return -1;
        }

        const mode = this._normalizeMode(type);

        let targetIndex = 0;
        for (let i = 1; i < this.items.length; i++) {
            if (this._isBetterCandidate(this.items[targetIndex], this.items[i], mode)) {
                targetIndex = i;
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

    toArray() {
        return this.items.map(entry => ({
            item: entry.item,
            priority: entry.priority,
            order: entry.order
        }));
    }
}

module.exports = BiDirectionalPriorityQueue;
