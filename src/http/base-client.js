// Базовий HTTP-клієнт: будує URL, нормалізує заголовки,
// підготовляє тіло запиту і читає відповідь у єдиному форматі

// Додає query-параметри до URL: підтримує масиви (декілька значень з одним ключем)
function buildUrl(inputUrl, query = {}) {
  const url = new URL(inputUrl);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

// Нормалізує заголовки: приймає Headers-об'єкт або звичайний об'єкт; повертає plain object
function normalizeHeaders(headers) {
  const result = {};

  if (!headers) {
    return result;
  }

  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    result[key] = value;
  }

  return result;
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

// Готує тіло запиту: об'єкт → JSON + авто Content-Type, інші типи — без змін
function prepareBody(body, headers) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof URLSearchParams
  ) {
    return body;
  }

  if (isPlainObject(body)) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return JSON.stringify(body);
  }

  return body;
}

// Читає тіло відповіді: JSON, текст або null (204 No Content)
async function readResponseBody(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  try {
    return await response.text();
  } catch (_error) {
    return null;
  }
}

// Клас BaseHttpClient: обгортовує fetch API,
// повертає знормалізовану відповідь з розпарсеним тілом і метаданими
class BaseHttpClient {
  constructor({ fetchImpl } = {}) {
    this.fetchImpl = fetchImpl || globalThis.fetch;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('A fetch implementation is required');
    }
  }

  async request(request = {}) {
    const headers = normalizeHeaders(request.headers);
    const url = request.query ? buildUrl(request.url, request.query) : request.url;
    const body = prepareBody(request.body, headers);

    const response = await this.fetchImpl(url, {
      method: request.method || 'GET',
      headers,
      body,
      signal: request.signal
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url || url,
      headers: normalizeHeaders(response.headers),
      data: await readResponseBody(response),
      raw: response
    };
  }
}

export { BaseHttpClient };