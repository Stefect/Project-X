// Рівні логування: DEBUG (10) < INFO (20) < ERROR (40)
const LEVELS = { DEBUG: 10, INFO: 20, ERROR: 40 };

// Безпечна серіалізація: JSON.stringify + фолбек до String для несеріалізованих значень
function trySerialize(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

// Повертає числовий ранг рівня логування для порівняння
function levelRank(level) {
  return LEVELS[String(level || 'INFO').toUpperCase()] || LEVELS.INFO;
}

// Фабрика декоратора: повертає функцію decorate, яка обгортовує будь-яку fn логуванням
function createLogDecorator(options = {}) {
  const globalLevel = String(options.level || 'INFO').toUpperCase();
  const threshold = levelRank(globalLevel);
  const formatter = options.formatter || ((entry) => JSON.stringify(entry));
  const sink = options.sink || console;

  // Виводить запис логу в синк з автоматичним додаванням timestamp
  function emit(entry) {
    const stamped = { ...entry, timestamp: new Date().toISOString() };
    const formatted = formatter(stamped);

    if (typeof sink === 'function') {
      sink(formatted, stamped);
      return;
    }

    if (stamped.level === 'ERROR' && sink.error) {
      sink.error(formatted, stamped);
    } else if (stamped.level === 'DEBUG' && sink.debug) {
      sink.debug(formatted, stamped);
    } else {
      (sink.info || console.log).call(sink, formatted, stamped);
    }
  }

  // Перевіряє, чи поточний рівень вищий або рівний глобальному порогу
  function shouldLog(level) {
    return levelRank(level) >= threshold;
  }

  // Повертає функцію-декоратор: обгортовує fn логуванням викликів, повернень та помилок
  return function decorate(fn, config = {}) {
    if (typeof fn !== 'function') {
      throw new Error('createLogDecorator expects a function');
    }

    const label = config.label || fn.name || 'anonymous';
    // Локальний рівень функції: дозволяє задавати рівень для конкретної функції
    const localThreshold = levelRank(String(config.level || globalLevel).toUpperCase());

    function canLog(level) {
      return levelRank(level) >= localThreshold && shouldLog(level);
    }

    // Обгортована функція з логуванням подій call, return та error
    return function loggedFunction(...args) {
      const startedAt = Date.now();

      if (canLog('DEBUG')) {
        emit({ level: 'DEBUG', event: 'call', label, args: trySerialize(args) });
      }

      let result;
      try {
        result = fn.apply(this, args);
      } catch (error) {
        emit({
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

export { createLogDecorator, levelRank };