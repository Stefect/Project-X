class BrowserXTaskQueue {
    static MODES = Object.freeze({
        HIGHEST: 'highest',
        LOWEST: 'lowest',
        OLDEST: 'oldest',
        NEWEST: 'newest'
    });

    constructor(seed = []) {
        this.items = [];
        this.insertCounter = 0;

        if (Array.isArray(seed)) {
            seed.forEach((entry) => {
                if (!entry || typeof entry !== 'object') return;
                if (!Object.prototype.hasOwnProperty.call(entry, 'priority')) return;
                this.enqueue(entry.item, entry.priority);
            });
        }
    }

    enqueue(item, priority = 0) {
        const numericPriority = Number(priority);
        if (!Number.isFinite(numericPriority)) {
            throw new TypeError('Priority must be a finite number');
        }

        this.items.push({
            item,
            priority: numericPriority,
            order: this.insertCounter++
        });

        return this.items.length;
    }

    _normalizeMode(mode) {
        const raw = String(mode || '').toLowerCase();
        return Object.values(BrowserXTaskQueue.MODES).includes(raw)
            ? raw
            : BrowserXTaskQueue.MODES.HIGHEST;
    }

    _isCandidateBetter(current, candidate, mode) {
        if (mode === BrowserXTaskQueue.MODES.HIGHEST) {
            if (candidate.priority !== current.priority) {
                return candidate.priority > current.priority;
            }
            return candidate.order < current.order;
        }

        if (mode === BrowserXTaskQueue.MODES.LOWEST) {
            if (candidate.priority !== current.priority) {
                return candidate.priority < current.priority;
            }
            return candidate.order < current.order;
        }

        if (mode === BrowserXTaskQueue.MODES.OLDEST) {
            return candidate.order < current.order;
        }

        if (mode === BrowserXTaskQueue.MODES.NEWEST) {
            return candidate.order > current.order;
        }

        return false;
    }

    _findIndex(mode) {
        if (this.items.length === 0) {
            return -1;
        }

        const normalized = this._normalizeMode(mode);
        let selectedIndex = 0;

        for (let i = 1; i < this.items.length; i += 1) {
            if (this._isCandidateBetter(this.items[selectedIndex], this.items[i], normalized)) {
                selectedIndex = i;
            }
        }

        return selectedIndex;
    }

    _pickEntry(mode) {
        const index = this._findIndex(mode);
        if (index === -1) {
            return null;
        }

        return {
            index,
            entry: this.items[index]
        };
    }

    peek(mode) {
        const picked = this._pickEntry(mode);
        return picked ? picked.entry.item : null;
    }

    dequeue(mode) {
        const picked = this._pickEntry(mode);
        if (!picked) {
            return null;
        }

        const [removed] = this.items.splice(picked.index, 1);
        return removed.item;
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
        return this.items.map((entry) => ({
            item: entry.item,
            priority: entry.priority,
            order: entry.order
        }));
    }
}

module.exports = BrowserXTaskQueue;
