export const prerender = false;

import { env } from 'cloudflare:workers';
import { loadActiveRubric } from '../../../lib/rubric.js';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function GET({ request }) {
  const key = request.headers.get('x-admin-key') ?? '';
  if (!timingSafeEqual(key, env.CANDIDATES_ADMIN_KEY_GUIDE ?? '')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const rubric = await loadActiveRubric(env.WY_DB);
  return Response.json(rubric, { headers: { 'cache-control': 'no-store' } });
}
