// Будує HTTP-заголовки автентифікації залежно від стратегії:
// apiKey → X-API-Key, jwt → Bearer token, oauth → Authorization header
function buildAuthHeaders(strategy, credentials, options = {}) {
  if (!credentials) return {};

  if (strategy === 'apiKey') {
    const name = options.headerName || 'X-API-Key';
    return { [name]: credentials.key || credentials.token };
  }

  if (strategy === 'jwt') {
    return { Authorization: `Bearer ${credentials.jwt || credentials.token}` };
  }

  const token = credentials.accessToken || credentials.token;
  const type = options.tokenType || 'Bearer';
  return { Authorization: `${type} ${token}` };
}

// Проксі-клас: додає автентифікацію до кожного запиту і автоматично оновлює credentials при 401
class AuthProxy {
  constructor(client, options = {}) {
    if (!client || typeof client.request !== 'function') {
      throw new Error('AuthProxy requires an HttpClient instance');
    }

    this.client = client;
    this.strategy = options.strategy || 'oauth';
    this.credentials = options.credentials || null;
    this.refreshCredentials = options.refreshCredentials || null;
    this.headerName = options.headerName;
    this.tokenType = options.tokenType || 'Bearer';
  }

  setStrategy(strategy) {
    this.strategy = strategy;
    return this;
  }

  setCredentials(credentials) {
    this.credentials = credentials;
    return this;
  }

  // Виконує запит: додає auth-заголовки, а при 401 — оновлює credentials і повторює запит
  async request(request = {}) {
    const credentials = typeof this.credentials === 'function'
      ? await this.credentials(request)
      : this.credentials;

    const authHeaders = buildAuthHeaders(this.strategy, credentials, {
      headerName: this.headerName,
      tokenType: this.tokenType
    });

    const outRequest = {
      ...request,
      headers: { ...(request.headers || {}), ...authHeaders }
    };

    const response = await this.client.request(outRequest);

    if (response.status !== 401 || !this.refreshCredentials) {
      return response;
    }

    const refreshed = await this.refreshCredentials({ response, credentials });

    if (!refreshed) return response;

    this.credentials = refreshed;

    const retryHeaders = buildAuthHeaders(this.strategy, refreshed, {
      headerName: this.headerName,
      tokenType: this.tokenType
    });

    return this.client.request({
      ...request,
      headers: { ...(request.headers || {}), ...retryHeaders }
    });
  }
}

export { AuthProxy };