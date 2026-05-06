class LoggingProxy {
  constructor(client, options = {}) {
    if (!client || typeof client.request !== 'function') {
      throw new Error('LoggingProxy requires an HttpClient instance');
    }

    this.client = client;
    this.level = options.level || 'INFO';
    this.includeBody = options.includeBody !== false;
    this.format = options.formatter || options.format || ((entry) => JSON.stringify(entry));
    this.sink = options.sink || console;
  }

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

    this.write({
      level: 'DEBUG',
      event: 'request',
      request: this.includeBody ? request : { url: request.url, method: request.method }
    });

    try {
      const response = await this.client.request(request);

      this.write({
        level: response.ok ? this.level : 'ERROR',
        event: 'response',
        status: response.status,
        durationMs: Date.now() - startedAt
      });

      return response;
    } catch (error) {
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