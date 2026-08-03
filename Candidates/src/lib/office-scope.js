export function normalizeWard(value) {
  const text = value == null ? '' : String(value).trim().replace(/\s+/g, ' ').toUpperCase();
  if (!text) return '';
  const match = text.match(/\bWARD\s*(\d+|[A-Z])\b/) || text.match(/\b(\d+|[A-Z])\b/);
  return match ? `WARD ${match[1]}` : text;
}

export function normalizePrecinctCode(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^PRECINCT\s+/i, '')
    .replace(/[^\dA-Z]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized
    .split('-')
    .map((part) => /^\d+$/.test(part) ? String(Number(part)) : part)
    .join('-');
}

export function officeMatchesPrecinct(row, precinct) {
  const precinctKey = normalizePrecinctCode(precinct);
  if (!precinctKey) return false;
  if (row.precinct_code && normalizePrecinctCode(row.precinct_code) === precinctKey) return true;

  const mappedPrecincts = String(row.mapped_precinct_codes || '')
    .split(',')
    .map(normalizePrecinctCode)
    .filter(Boolean);
  if (mappedPrecincts.includes(precinctKey)) return true;

  const titleKey = String(row.title || '')
    .trim()
    .toUpperCase()
    .replace(/[^\dA-Z]+/g, ' ')
    .replace(/\s+/g, ' ');
  return titleKey.startsWith(`PRECINCT ${precinctKey.replace(/-/g, ' ')} `);
}
