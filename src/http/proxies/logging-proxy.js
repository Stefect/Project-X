// Task 8: LoggingProxy — Proxy-обгортка для логування HTTP-запитів і відповідей.
// Реалізує той самий інтерфейс request(), що й BaseHttpClient — прозора для клієнта.
// Логує event: 'request' перед відправкою і event: 'response'/'failure' після.
class LoggingProxy {
  constructor(client, options = {}) {
    if (!client || typeof client.request !== 'function') {
      throw new Error('LoggingProxy requires an HttpClient instance');
    }

    this.client = client;
    this.level = options.level || 'INFO';
    this.includeBody = options.includeBody !== false;
    // Форматтер: перетворює об'єкт запису у рядок для виводу.
    // Приймає як options.formatter (для сумісності з createLogDecorator), так і options.format.
    this.format = options.formatter || options.format || ((entry) => JSON.stringify(entry));
    // sink: може бути console, функцією або об'єктом з методами info/error/debug.
    this.sink = options.sink || console;
  }

  // Внутрішній метод запису — розподіляє між sink.error / sink.debug / sink.info
  // залежно від рівня. Підтримує як функцію-sink, так і logger-об'єкти (winston, pino).
  write(entry) {
    const formatted = this.format(entry);
    const record = { ...entry, timestamp: new Date().toISOString(), message: formatted };

    if (typeof this.sink === 'function') {
      this.sink(record);
      return;
    }

    if (entry.level === 'ERROR' && this.sink.error) {
      this.sink.error(formatted, record);
    } else if (entry.level === 'DEBUG' && this.sink.debug) {
      this.sink.debug(formatted, record);
    } else {
      (this.sink.info || console.log).call(this.sink, formatted, record);
    }
  }

  async request(request = {}) {
    const startedAt = Date.now();

    // Логуємо вихідний запит. Якщо includeBody=false — лише URL і метод (без чутливих даних).
    this.write({
      level: 'DEBUG',
      event: 'request',
      request: this.includeBody ? request : { url: request.url, method: request.method }
    });

    try {
      const response = await this.client.request(request);

      // Успішна відповідь → рівень this.level (INFO за замовчуванням).
      // Помилкова відповідь (4xx/5xx) → рівень ERROR.
      this.write({
        level: response.ok ? this.level : 'ERROR',
        event: 'response',
        status: response.status,
        durationMs: Date.now() - startedAt
      });

      return response;
    } catch (error) {
      // Мережева помилка (не HTTP) — логуємо як failure з detalями.
      this.write({
        level: 'ERROR',
        event: 'failure',
        durationMs: Date.now() - startedAt,
        error: { message: error.message, name: error.name }
      });
      throw error;
    }
  }
}

export { LoggingProxy };