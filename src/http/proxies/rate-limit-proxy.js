// Проксі-клас: обмежує частоту запитів через розрахування інтервалу між запитами:
// запити виконуються послідовно з дотриманням spacingMs мілісекунд між ними
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimitProxy {
  constructor(client, options = {}) {
    if (!client || typeof client.request !== 'function') {
      throw new Error('RateLimitProxy requires an HttpClient instance');
    }

    const requestsPerInterval = options.requestsPerInterval || 60;
    const intervalMs = options.intervalMs || 60000;

    this.client = client;
    this.spacingMs = Math.max(1, Math.floor(intervalMs / requestsPerInterval));
    this.nextAvailableAt = 0;
    this.queue = Promise.resolve();
  }

  // Виконує запит з очікуванням: додає запит до внутрішньої черги, щоб зберігти порядок виконання
  async request(request = {}) {
    const execute = async () => {
      const now = Date.now();
      // Чекаємо, якщо до наступного дозволеного вікна ще залишилось час
      const waitMs = Math.max(0, this.nextAvailableAt - now);

      if (waitMs > 0) {
        await delay(waitMs);
      }

      this.nextAvailableAt = Date.now() + this.spacingMs;
      return this.client.request(request);
    };

    const pending = this.queue.then(execute, execute);
    this.queue = pending.catch(() => {});
    return pending;
  }
}

export { RateLimitProxy };