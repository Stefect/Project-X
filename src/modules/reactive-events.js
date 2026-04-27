

const { session } = require('electron');
const EventEmitter = require('events');

const REACTIVE_EVENT_LIMIT = 50;
const reactiveEventBus = new EventEmitter();
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

  reactiveEventBus.emit('event', event);

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

module.exports = {
  setupReactiveNetworkEvents,
  emitReactiveEvent,
  subscribeReactiveEvents,
  unsubscribeReactiveEvents,
  getReactiveEventBuffer,
  formatUrlLabel
};
