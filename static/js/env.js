// static/js/env.js
const host = window.location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';
const LOCAL_API = 'http://localhost:8787';
const PROD_API  = 'https://skovgard2026-api.anchorskov.workers.dev';

export const API_URL = isLocal ? LOCAL_API : PROD_API;
export const isLocalEnv = isLocal;
export const isProd = !isLocal;
