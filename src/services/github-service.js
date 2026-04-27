class GitHubService {
  constructor(httpClient, options = {}) {
    if (!httpClient || typeof httpClient.request !== 'function') {
      throw new Error('GitHubService requires an injected HttpClient');
    }

    this.httpClient = httpClient;
    this.baseUrl = options.baseUrl || 'https://api.github.com';
    this.userAgent = options.userAgent || 'BrowserX GitHubService';
  }

  async request(path, options = {}) {
    const response = await this.httpClient.request({
      url: `${this.baseUrl}${path}`,
      method: options.method || 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': this.userAgent,
        ...(options.headers || {})
      },
      query: options.query,
      body: options.body
    });

    if (!response.ok) {
      const message = `GitHub request failed with status ${response.status}`;
      const error = new Error(message);
      error.response = response;
      throw error;
    }

    return response.data;
  }

  getUser(username) {
    return this.request(`/users/${encodeURIComponent(username)}`);
  }

  getRepos(username) {
    return this.request(`/users/${encodeURIComponent(username)}/repos`, {
      query: { per_page: 100, sort: 'updated' }
    });
  }

  getRepo(owner, repo) {
    return this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }
}

module.exports = { GitHubService };