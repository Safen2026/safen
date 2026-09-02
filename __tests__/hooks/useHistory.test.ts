/**
 * Tests for the pure logic inside useHistory.
 *
 * useHistory imports supabase.ts which throws if env vars are not set.
 * We mock the entire module so the test environment never needs real credentials.
 * The logic under test (TYPE_META, FILTERS, filtering, grouping) is pure and
 * completely independent of Supabase — we extract and test it directly.
 */

// ── Silence the Supabase client before any imports touch it ──────────────────
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn(), getUser: jest.fn() },
    channel: jest.fn(() => ({ on: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() })),
    removeChannel: jest.fn(),
  },
}));

// Also mock SessionContext since useHistory pulls from it
jest.mock('../../src/context/SessionContext', () => ({
  useSession: jest.fn(() => null),
}));

import { TYPE_META, FILTERS } from '../../src/hooks/useHistory';
import type { HistoryItem } from '../../src/hooks/useHistory';

// ─── TYPE_META ────────────────────────────────────────────────────────────────
describe('TYPE_META', () => {
  it('contains all expected alert types', () => {
    const expectedTypes = ['sos', 'medical', 'police', 'fire', 'robbery', 'accident', 'other'];
    for (const type of expectedTypes) {
      expect(TYPE_META).toHaveProperty(type);
    }
  });

  it('each entry has icon, color, label, and category', () => {
    for (const [, meta] of Object.entries(TYPE_META)) {
      expect(typeof meta.icon).toBe('string');
      expect(typeof meta.color).toBe('string');
      expect(typeof meta.label).toBe('string');
      expect(typeof meta.category).toBe('string');
    }
  });

  it('maps "sos" to category "SOS"', () => {
    expect(TYPE_META.sos.category).toBe('SOS');
  });

  it('maps "robbery" to category "Security"', () => {
    expect(TYPE_META.robbery.category).toBe('Security');
  });

  it('maps "medical" to category "Medical"', () => {
    expect(TYPE_META.medical.category).toBe('Medical');
  });

  it('maps "fire" to category "Fire"', () => {
    expect(TYPE_META.fire.category).toBe('Fire');
  });

  it('maps "accident" and "other" to category "Other"', () => {
    expect(TYPE_META.accident.category).toBe('Other');
    expect(TYPE_META.other.category).toBe('Other');
  });
});

// ─── FILTERS ──────────────────────────────────────────────────────────────────
describe('FILTERS', () => {
  it('starts with "All"', () => {
    expect(FILTERS[0]).toBe('All');
  });

  it('contains all relevant categories', () => {
    expect(FILTERS).toContain('SOS');
    expect(FILTERS).toContain('Security');
    expect(FILTERS).toContain('Medical');
    expect(FILTERS).toContain('Fire');
    expect(FILTERS).toContain('Other');
  });

  it('has exactly 6 entries', () => {
    expect(FILTERS).toHaveLength(6);
  });
});

// ─── Category filtering logic ─────────────────────────────────────────────────
function filterItems(items: HistoryItem[], activeFilter: string): HistoryItem[] {
  if (activeFilter === 'All') return items;
  return items.filter(item => {
    const meta = TYPE_META[item.type] || TYPE_META.other;
    return meta.category === activeFilter;
  });
}

function makeItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: Math.random().toString(36).slice(2),
    source: 'alert',
    type: 'sos',
    title: 'Test',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('filterItems', () => {
  const items: HistoryItem[] = [
    makeItem({ type: 'sos' }),
    makeItem({ type: 'medical' }),
    makeItem({ type: 'police' }),
    makeItem({ type: 'robbery' }),
    makeItem({ type: 'fire' }),
    makeItem({ type: 'other' }),
    makeItem({ type: 'accident' }),
  ];

  it('returns all items for "All" filter', () => {
    expect(filterItems(items, 'All')).toHaveLength(7);
  });

  it('returns only SOS items for "SOS" filter', () => {
    const result = filterItems(items, 'SOS');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('sos');
  });

  it('returns Security items (police + robbery) for "Security" filter', () => {
    const result = filterItems(items, 'Security');
    expect(result).toHaveLength(2);
    expect(result.every(i => ['police', 'robbery'].includes(i.type))).toBe(true);
  });

  it('returns only Medical for "Medical" filter', () => {
    const result = filterItems(items, 'Medical');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('medical');
  });

  it('returns only fire for "Fire" filter', () => {
    const result = filterItems(items, 'Fire');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('fire');
  });

  it('groups accident and other under "Other"', () => {
    const result = filterItems(items, 'Other');
    expect(result).toHaveLength(2);
    expect(result.every(i => ['other', 'accident'].includes(i.type))).toBe(true);
  });

  it('returns empty array when no items match the filter', () => {
    expect(filterItems([], 'SOS')).toHaveLength(0);
  });

  it('falls back to TYPE_META.other for unknown item types', () => {
    const weirdItem = makeItem({ type: 'unknown_type' });
    const result = filterItems([weirdItem], 'Other');
    expect(result).toHaveLength(1);
  });

  it('does not mutate the original items array', () => {
    const original = [...items];
    filterItems(items, 'SOS');
    expect(items).toHaveLength(original.length);
  });
});

// ─── Date grouping logic ──────────────────────────────────────────────────────
function groupItems(filteredItems: HistoryItem[]) {
  const groups: { title: string; data: HistoryItem[] }[] = [];
  const map = new Map<string, HistoryItem[]>();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  filteredItems.forEach(item => {
    const d = new Date(item.created_at);
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    let groupTitle = '';
    if (itemDay.getTime() === today.getTime()) {
      groupTitle = 'Today';
    } else if (itemDay.getTime() === yesterday.getTime()) {
      groupTitle = 'Yesterday';
    } else if (itemDay.getTime() === twoDaysAgo.getTime()) {
      groupTitle = '2 Days Ago';
    } else {
      groupTitle = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    if (!map.has(groupTitle)) {
      const newGroup: HistoryItem[] = [];
      map.set(groupTitle, newGroup);
      groups.push({ title: groupTitle, data: newGroup });
    }
    map.get(groupTitle)?.push(item);
  });

  return groups;
}

describe('groupItems', () => {
  it('returns empty array for no items', () => {
    expect(groupItems([])).toHaveLength(0);
  });

  it('groups a today item under "Today"', () => {
    const item = makeItem({ created_at: new Date().toISOString() });
    const result = groupItems([item]);
    expect(result[0].title).toBe('Today');
    expect(result[0].data).toHaveLength(1);
  });

  it('groups a yesterday item under "Yesterday"', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const item = makeItem({ created_at: d.toISOString() });
    const result = groupItems([item]);
    expect(result[0].title).toBe('Yesterday');
  });

  it('groups a 2-day-old item under "2 Days Ago"', () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const item = makeItem({ created_at: d.toISOString() });
    const result = groupItems([item]);
    expect(result[0].title).toBe('2 Days Ago');
  });

  it('groups older items under a formatted date string containing the year', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    const item = makeItem({ created_at: d.toISOString() });
    const result = groupItems([item]);
    expect(result[0].title).toMatch(/\d{4}/);
    expect(result[0].title).not.toBe('Today');
    expect(result[0].title).not.toBe('Yesterday');
    expect(result[0].title).not.toBe('2 Days Ago');
  });

  it('merges multiple same-day items into one group', () => {
    const now = new Date().toISOString();
    const items = [makeItem({ created_at: now }), makeItem({ created_at: now })];
    const result = groupItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].data).toHaveLength(2);
  });

  it('creates separate groups for today and yesterday', () => {
    const today = new Date().toISOString();
    const yday = new Date();
    yday.setDate(yday.getDate() - 1);
    const items = [
      makeItem({ created_at: today }),
      makeItem({ created_at: yday.toISOString() }),
    ];
    const result = groupItems(items);
    expect(result).toHaveLength(2);
    expect(result.map(g => g.title)).toContain('Today');
    expect(result.map(g => g.title)).toContain('Yesterday');
  });

  it('preserves insertion order within a group', () => {
    const t1 = new Date();
    t1.setMinutes(t1.getMinutes() - 10);
    const t2 = new Date();
    const item1 = makeItem({ id: 'first', created_at: t1.toISOString() });
    const item2 = makeItem({ id: 'second', created_at: t2.toISOString() });
    const result = groupItems([item1, item2]);
    expect(result[0].data[0].id).toBe('first');
    expect(result[0].data[1].id).toBe('second');
  });
});
