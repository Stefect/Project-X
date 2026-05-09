import EventEmitter from 'events';

const ERROR_CHANNEL = 'reactive-error';

class ReactiveEventBus {
  constructor() {
    this._emitter = new EventEmitter();
    this._buffer = [];
    this._limit = 50;

    this._emitter.on(ERROR_CHANNEL, () => {});
  }

  emit(payload) {
    const event = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      time: Date.now(),
      ...payload
    };

    this._buffer.unshift(event);
    if (this._buffer.length > this._limit) {
      this._buffer.length = this._limit;
    }

    for (const listener of this._emitter.rawListeners('event')) {
      try {
        listener(event);
      } catch (err) {
        this._emitter.emit(ERROR_CHANNEL, { error: err.message, listener: listener.name || 'anonymous' });
      }
    }

    return event;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this._emitter.on('event', listener);
    return () => this.unsubscribe(listener);
  }

  subscribeErrors(handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    this._emitter.on(ERROR_CHANNEL, handler);
    return () => this._emitter.off(ERROR_CHANNEL, handler);
  }

  unsubscribe(listener) {
    this._emitter.off('event', listener);
  }

  getBuffer() {
    return [...this._buffer];
  }
}

const bus = new ReactiveEventBus();

function loggerListener(event) {
  console.log(`[logger]   ${event.type.padEnd(18)} id=${event.id}`);
}

function uiListener(event) {
  if (event.type === 'tracker-blocked') {
    console.log(`[ui]       tracker blocked: ${event.detail}`);
  }
}

function analyticsListener(event) {
  console.log(`[analytics] counted event type="${event.type}"`);
}

function faultyListener() {
  throw new Error('listener intentionally broken');
}

const unsubErrors = bus.subscribeErrors((info) => {
  console.log(`[error-ch]  listener "${info.listener}" threw: ${info.error}`);
});

const unsubLogger    = bus.subscribe(loggerListener);
const unsubUi        = bus.subscribe(uiListener);
const unsubAnalytics = bus.subscribe(analyticsListener);
const unsubFaulty    = bus.subscribe(faultyListener);

console.log('Task 7 demo: reactive communication with EventEmitter\n');

bus.emit({ type: 'tracker-blocked',   detail: 'google-analytics.com' });
bus.emit({ type: 'download-start',    detail: 'report.pdf' });
bus.emit({ type: 'tracker-blocked',   detail: 'facebook.net' });
bus.emit({ type: 'download-complete', detail: 'report.pdf' });

// unsubscribe ui and analytics mid-stream
console.log('\n-- unsubscribing ui + analytics listeners --\n');
unsubUi();
unsubAnalytics();

bus.emit({ type: 'tracker-blocked', detail: 'doubleclick.net' });

// unsubscribe the faulty one too
console.log('\n-- unsubscribing faulty listener --\n');
unsubFaulty();

bus.emit({ type: 'network-offline', detail: null });

unsubLogger();
unsubErrors();

console.log('\n-- all listeners removed, final emit is silent --\n');
bus.emit({ type: 'tracker-blocked', detail: 'silent.example.com' });

console.log('buffer size:', bus.getBuffer().length);
console.log('last buffered:', bus.getBuffer()[0].type);
