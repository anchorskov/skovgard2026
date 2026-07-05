const GUIDE_HOST = 'candidates.skovgard2026.org';

export function isGuideEnabled(hostname: string): boolean {
  if (import.meta.env.DEV) return true;
  return hostname.trim().toLowerCase() === GUIDE_HOST;
}

export function isGuidePath(pathname: string): boolean {
  return pathname === '/guide'
    || pathname.startsWith('/guide/')
    || pathname === '/endorsements'
    || pathname.startsWith('/endorsements/')
    || pathname.startsWith('/candidate/');
}
