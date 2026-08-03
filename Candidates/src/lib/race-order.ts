// Canonical ballot order shared by the homepage ballot-results panel, the
// "Jump to a race" select, and the saved candidate list on /race/[id]. Office
// IDs are autoincrement primary keys and are not confirmed to encode ballot
// order (precinct rows in particular are unverified) — order by explicit
// category instead.
const RACE_LEVEL_ORDER = ['federal', 'statewide', 'wy_senate', 'wy_house', 'county', 'city'];

// Precinct committee races carry level='county' in the schema but must sort
// after every other category, so they need a scope_kind override rather than
// a level lookup.
const PRECINCT_SCOPE_KINDS = new Set(['precinct_party', 'precinct_party_gender']);

export interface OrderableRace {
  id?: string | number;
  name?: string | null;
  level?: string | null;
  scopeKind?: string | null;
}

function categoryRank(race: OrderableRace): number {
  if (race.scopeKind && PRECINCT_SCOPE_KINDS.has(race.scopeKind)) {
    return RACE_LEVEL_ORDER.length; // precinct tier, after city/municipal
  }
  const index = RACE_LEVEL_ORDER.indexOf(race.level || '');
  return index === -1 ? RACE_LEVEL_ORDER.length + 1 : index;
}

// Both API queries that produce race rows (getRaceGroups, getLocalRaces)
// already order by a curated `sort_order` column within each level (e.g.
// Gillette Mayor sort_order=9 before Gillette Ward 1 sort_order=10) — that
// within-category order is real and must survive. So this only reorders
// across categories; Array.prototype.sort is stable, and sortRaces below
// relies on that stability to leave same-category order untouched rather
// than inventing an alphabetical order that would scramble it.
export function compareRaceOrder(a: OrderableRace, b: OrderableRace): number {
  return categoryRank(a) - categoryRank(b);
}

export function sortRaces<T extends OrderableRace>(races: T[]): T[] {
  return [...races].sort(compareRaceOrder);
}

// Projects an already-canonical ordering (e.g. the output of sortRaces) onto a
// differently-shaped list via a shared id, so surfaces that only have partial
// race data (like saved candidate choices) can still render in the same
// order without re-deriving the category logic above. Items with no match in
// referenceOrder sort after all matched items, by fallbackLabel.
export function rankMapFromOrder<T>(referenceOrder: T[], getId: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  referenceOrder.forEach((item, index) => {
    const id = getId(item);
    if (!map.has(id)) map.set(id, index);
  });
  return map;
}

export function sortByRankMap<T>(
  items: T[],
  rank: Map<string, number>,
  getId: (item: T) => string,
  getFallbackLabel: (item: T) => string
): T[] {
  return [...items].sort((a, b) => {
    const ra = rank.has(getId(a)) ? (rank.get(getId(a)) as number) : Number.POSITIVE_INFINITY;
    const rb = rank.has(getId(b)) ? (rank.get(getId(b)) as number) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return getFallbackLabel(a).localeCompare(getFallbackLabel(b));
  });
}
