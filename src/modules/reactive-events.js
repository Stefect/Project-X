

import { session } from 'electron';
import EventEmitter from 'events';

const REACTIVE_EVENT_LIMIT = 50;
const REACTIVE_ERROR_CHANNEL = 'reactive-error';
const reactiveEventBus = new EventEmitter();
// Default no-op handler prevents EventEmitter from throwing when no consumer
// has subscribed to the error channel yet.
reactiveEventBus.on(REACTIVE_ERROR_CHANNEL, () => {});
const reactiveEventBuffer = [];
const trackerHostMarkers = [
  'doubleclick.net',
  'google-analytics.com',
  'googletagmanager.com',
  'adservice.google.com',
  'adsystem.com',
  'facebook.net',
  'connect.facebook.net',
  'pixel.facebook.com',
  'stats.g.doubleclick.net',
  'analytics.twitter.com',
  'static.ads-twitter.com',
  'snap.licdn.com'
];

const trackerPathMarkers = ['/collect', '/g/collect', '/tr', '/pixel', '/adsct'];
const trackerEmitCooldownMs = 5000;
const trackerLastEmitted = new Map();


function getHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return '';
  }
}


function isLikelyTrackerUrl(url) {
  const host = getHostFromUrl(url);
  if (!host) return false;

  const matchesHost = trackerHostMarkers.some(marker => host === marker || host.endsWith(`.${marker}`));
  if (matchesHost) return true;

  const lowerUrl = url.toLowerCase();
  return trackerPathMarkers.some(marker => lowerUrl.includes(marker));
}


function shouldEmitTrackerEvent(host) {
  if (!host) return false;
  const lastTime = trackerLastEmitted.get(host) || 0;
  const now = Date.now();
  if (now - lastTime < trackerEmitCooldownMs) return false;
  trackerLastEmitted.set(host, now);
  return true;
}


function formatUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch (error) {
    return url;
  }
}


function emitReactiveEvent(payload, mainWindow) {
  const event = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    ...payload
  };

  reactiveEventBuffer.unshift(event);
  if (reactiveEventBuffer.length > REACTIVE_EVENT_LIMIT) {
    reactiveEventBuffer.length = REACTIVE_EVENT_LIMIT;
  }

  // Call each subscriber individually so a throwing listener does not prevent
  // subsequent ones from receiving the event.
  const listeners = reactiveEventBus.rawListeners('event');
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      reactiveEventBus.emit(REACTIVE_ERROR_CHANNEL, {
        error: err.message,
        listener: listener.name || 'anonymous'
      });
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reactive-event', event);
  }

  return event;
}

function subscribeReactiveEvents(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('listener must be a function');
  }

  reactiveEventBus.on('event', listener);

  return () => unsubscribeReactiveEvents(listener);
}

function subscribeErrorChannel(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('handler must be a function');
  }
  reactiveEventBus.on(REACTIVE_ERROR_CHANNEL, handler);
  return () => reactiveEventBus.off(REACTIVE_ERROR_CHANNEL, handler);
}

function unsubscribeReactiveEvents(listener) {
  if (typeof listener !== 'function') {
    return false;
  }

  reactiveEventBus.off('event', listener);
  return true;
}


function setupReactiveNetworkEvents(mainWindow) {
  if (!session || !session.defaultSession) return;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    const isMainFrame = details.resourceType === 'mainFrame';
    const isLocal = url.startsWith('file://') || url.startsWith('devtools://');

    if (!isLocal && !isMainFrame && isLikelyTrackerUrl(url)) {
      const host = getHostFromUrl(url);
      if (shouldEmitTrackerEvent(host)) {
        emitReactiveEvent({
          type: 'tracker-blocked',
          title: 'Заблоковано трекер',
          detail: host || 'Невідомий домен'
        }, mainWindow);
      }
      callback({ cancel: true });
      return;
    }

    callback({});
  });
  session.defaultSession.on('will-download', (event, item) => {
    const filename = item.getFilename();

    emitReactiveEvent({
      type: 'download-start',
      title: 'Download started',
      detail: filename
    }, mainWindow);

    item.once('done', (_event, state) => {
      if (state === 'completed') {
        emitReactiveEvent({
          type: 'download-complete',
          title: 'Download completed',
          detail: filename
        }, mainWindow);
      } else {
        emitReactiveEvent({
          type: 'download-failed',
          title: 'Download interrupted',
          detail: filename
        }, mainWindow);
      }
    });
  });
}


function getReactiveEventBuffer() {
  return reactiveEventBuffer.slice(0, 20);
}

export {
  setupReactiveNetworkEvents,
  emitReactiveEvent,
  subscribeReactiveEvents,
  subscribeErrorChannel,
  unsubscribeReactiveEvents,
  getReactiveEventBuffer,
  formatUrlLabel
};
