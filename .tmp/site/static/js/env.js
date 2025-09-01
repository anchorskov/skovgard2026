const isLocal = window.location.hostname === 'localhost';
const isProd  = !isLocal;
const API_URL = isLocal
  ? 'http://localhost:8787'   // your local Worker/D1/R2 endpoint
  : 'https://api.skovgard2026.org'; // adjust when live
export { isLocal, isProd, API_URL };
