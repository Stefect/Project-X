import { net, session } from 'electron';

function fetchWithProxy(url, isJson = true) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, session: session.defaultSession });
    let data = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => { data += chunk.toString(); });
      response.on('end', () => {
        try {
          resolve(isJson ? JSON.parse(data) : data.trim());
        } catch (err) {
          console.error('IP parse error:', err.message);
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
    return { ip: torData.IP, responseTime: Date.now() - startTime };
  } catch (err1) {
    console.warn('Tor Project API failed:', err1.message);
  }

  try {
    const ip = await fetchWithProxy('https://ident.me/', false);
    return { ip, responseTime: Date.now() - startTime };
  } catch (err2) {
    console.warn('ident.me failed:', err2.message);
  }

  const ip = await fetchWithProxy('https://icanhazip.com/', false);
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
        response.on('data', (chunk) => { data += chunk.toString(); });
        response.on('end', () => {
          if (statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              console.warn('Geo API returned non-JSON:', data.substring(0, 100));
              resolve(null);
            }
          } else {
            console.warn(`Geo API blocked request (HTTP ${statusCode})`);
            resolve(null);
          }
        });
      });

      geoRequest.on('error', (err) => {
        console.warn('Geo request error:', err.message);
        resolve(null);
      });

      geoRequest.end();
    });

    if (geoResult && geoResult.country_name) {
      return geoResult;
    }
    return defaults;
  } catch (geoErr) {
    console.warn('Geo lookup failed:', geoErr.message);
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
    console.error('IP check failed:', error);
    throw new Error(`Не вдалося перевірити IP: ${error.message}`);
  }
}

export { checkIp };
