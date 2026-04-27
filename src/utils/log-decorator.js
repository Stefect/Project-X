const LEVELS = { DEBUG: 10, INFO: 20, ERROR: 40 };

function trySerialize(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

function levelRank(level) {
  return LEVELS[String(level || 'INFO').toUpperCase()] || LEVELS.INFO;
}

function createLogDecorator(options = {}) {
  const globalLevel = String(options.level || 'INFO').toUpperCase();
  const threshold = levelRank(globalLevel);
  const formatter = options.formatter || ((entry) => JSON.stringify(entry));
  const sink = options.sink || console;

  function emit(entry) {
    const formatted = formatter(entry);

    if (typeof sink === 'function') {
      sink(formatted, entry);
      return;
    }

    if (entry.level === 'ERROR' && sink.error) {
      sink.error(formatted, entry);
    } else if (entry.level === 'DEBUG' && sink.debug) {
      sink.debug(formatted, entry);
    } else {
      (sink.info || console.log).call(sink, formatted, entry);
    }
  }

  function shouldLog(level) {
    return levelRank(level) >= threshold;
  }

  return function decorate(fn, config = {}) {
    if (typeof fn !== 'function') {
      throw new Error('createLogDecorator expects a function');
    }

    const label = config.label || fn.name || 'anonymous';
    const localThreshold = levelRank(String(config.level || globalLevel).toUpperCase());

    function canLog(level) {
      return levelRank(level) >= localThreshold && shouldLog(level);
    }

    return function loggedFunction(...args) {
      const startedAt = Date.now();

      if (canLog('DEBUG')) {
        emit({ timestamp: new Date().toISOString(), level: 'DEBUG', event: 'call', label, args: trySerialize(args) });
      }

      let result;
      try {
        result = fn.apply(this, args);
      } catch (error) {
        emit({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          event: 'error',
          label,
          durationMs: Date.now() - startedAt,
          error: { name: error.name, message: error.message }
        });
        throw error;
      }

      if (result && typeof result.then === 'function') {
        return result.then((value) => {
          if (canLog('INFO')) {
            emit({
              timestamp: new Date().toISOString(),
              level: 'INFO',
              event: 'return',
              label,
              durationMs: Date.now() - startedAt,
              result: trySerialize(value)
            });
          }
          return value;
        }).catch((error) => {
          emit({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            event: 'error',
            label,
            durationMs: Date.now() - startedAt,
            error: { name: error.name, message: error.message }
          });
          throw error;
        });
      }

      if (canLog('INFO')) {
        emit({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          event: 'return',
          label,
          durationMs: Date.now() - startedAt,
          result: trySerialize(result)
        });
      }

      return result;
    };
  };
}

module.exports = { createLogDecorator, levelRank };