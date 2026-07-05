import { defineMiddleware } from 'astro:middleware';
import { isGuideEnabled, isGuidePath } from './lib/guide-host';

function withHostVary(response: Response): Response {
  const headers = new Headers(response.headers);
  const vary = headers.get('Vary');
  const values = new Set((vary || '').split(',').map((value) => value.trim()).filter(Boolean));
  values.add('Host');
  headers.set('Vary', [...values].join(', '));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { hostname, pathname } = context.url;

  if (isGuidePath(pathname) && !isGuideEnabled(hostname)) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'vary': 'Host',
      },
    });
  }

  return withHostVary(await next());
});
