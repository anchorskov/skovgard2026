// static/js/env.js
const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const params = new URLSearchParams(window.location.search);

// Default local API
let LOCAL_API = 'http://localhost:8787';
const PROD_API  = ''; // Same-origin: calls will use /api/config, /api/donate/*, etc.

// Allow one-off override for debugging: ?api=http://127.0.0.1:8788
const override = params.get('api');
if (override) LOCAL_API = override;

export const API_URL    = isLocalHost ? LOCAL_API : PROD_API;
export const isLocalEnv = isLocalHost;
export const isProd     = !isLocalHost;

// Optional debug (local only)
if (isLocalEnv) {
  console.debug(JSON.stringify({ host: location.host, API_URL, isLocalEnv }, null, 2));
}
