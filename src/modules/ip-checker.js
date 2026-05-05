import { net, session } from 'electron';

function fetchWithProxy(url, isJson = true) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, session: session.defaultSession });
    let data = '';

    request.on('response', (response) => {
      console.log(`[IP CHECK] Response status: ${response.statusCode} for ${url}`);
      response.on('data', (chunk) => { data += chunk.toString(); });
      response.on('end', () => {
        try {
          resolve(isJson ? JSON.parse(data) : data.trim());
        } catch (err) {
          console.error('[IP CHECK] Parse error:', err.message);
          console.error('[IP CHECK] Received data:', data.substring(0, 200));
          reject(new Error(`Parse error: ${err.message}`));
        }
      });
      response.on('error', (err) => reject(new Error(`Response error: ${err.message}`)));
    });

    request.on('error', (err) => reject(new Error(`Request error: ${err.message}`)));
    request.end();
  });
}

async function resolveCurrentIp() {
  const startTime = Date.now();

  try {
    const torData = await fetchWithProxy('https://check.torproject.org/api/ip', true);
    console.log('[IP CHECK] Got IP from Tor Project API:', torData.IP);
    return { ip: torData.IP, responseTime: Date.now() - startTime };
  } catch (err1) {
    console.warn('[IP CHECK] Tor Project API failed:', err1.message);
  }

  try {
    const ip = await fetchWithProxy('https://ident.me/', false);
    console.log('[IP CHECK] Got IP from ident.me:', ip);
    return { ip, responseTime: Date.now() - startTime };
  } catch (err2) {
    console.warn('[IP CHECK] ident.me failed:', err2.message);
  }

  const ip = await fetchWithProxy('https://icanhazip.com/', false);
  console.log('[IP CHECK] Got IP from icanhazip.com:', ip);
  return { ip, responseTime: Date.now() - startTime };
}

async function resolveGeoData(ip, torStatus) {
  const defaults = {
    country_name: torStatus.active ? 'Tor Network' : 'Невідомо',
    city: torStatus.active ? 'Anonymous' : 'Невідомо',
    region: '',
    org: torStatus.active ? 'Tor Exit Node' : 'Невідомо',
    asn: ''
  };

  try {
    const geoRequest = net.request({ url: `https://ipapi.co/${ip}/json/`, session: session.defaultSession });

    const geoResult = await new Promise((resolve) => {
      let data = '';
      let statusCode = 0;

      geoRequest.on('response', (response) => {
        statusCode = response.statusCode;
        console.log(`[IP CHECK] Geo API response status: ${statusCode}`);
        response.on('data', (chunk) => { data += chunk.toString(); });
        response.on('end', () => {
          if (statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              console.warn('[IP CHECK] Geo API повернув не-JSON:', data.substring(0, 100));
              resolve(null);
            }
          } else {
            console.warn(`[IP CHECK] Geo API заблокував запит (HTTP ${statusCode})`);
            if (statusCode === 403) {
              console.warn('[IP CHECK] Cloudflare блокує Tor трафік - використовуємо дефолтні значення');
            }
            resolve(null);
          }
        });
      });

      geoRequest.on('error', (err) => {
        console.warn('[IP CHECK] Geo request error:', err.message);
        resolve(null);
      });

      geoRequest.end();
    });

    if (geoResult && geoResult.country_name) {
      console.log('[IP CHECK] Got geo data:', geoResult.country_name, geoResult.city);
      return geoResult;
    }
    console.log('[IP CHECK] Using default geo data for Tor');
    return defaults;
  } catch (geoErr) {
    console.warn('[IP CHECK] Geo lookup exception:', geoErr.message);
    return defaults;
  }
}

async function checkIp(torManager) {
  try {
    const { ip, responseTime } = await resolveCurrentIp();
    if (!ip) throw new Error('Не вдалося отримати IP адресу');

    const geoData = await resolveGeoData(ip, torManager.getTorStatus());

    return {
      ip,
      responseTime,
      country: geoData.country_name || 'Невідомо',
      city: geoData.city || 'Невідомо',
      region: geoData.region || '',
      org: geoData.org || 'Невідомо',
      asn: geoData.asn || ''
    };
  } catch (error) {
    console.error('[IP CHECK] Error:', error);
    throw new Error(`Не вдалося перевірити IP: ${error.message}`);
  }
}

export { checkIp };
