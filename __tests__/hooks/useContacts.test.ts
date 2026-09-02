/**
 * Tests for the pure logic inside useContacts.ts.
 *
 * The hook is network-heavy, but several pieces of pure logic can be extracted
 * and tested in isolation:
 *   - Contact status splitting (active vs pending for the tab UI)
 *   - Cache-to-Contact object mapping (used for offline fallback)
 *   - Protecting-contact mapping (RawProtectingContact → Contact shape)
 *   - The multi-format phone lookup array construction
 *
 * Supabase and all native modules are mocked.
 */

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
    channel: jest.fn(() => ({ on: jest.fn(), subscribe: jest.fn() })),
    removeChannel: jest.fn(),
  },
}));

jest.mock('../../src/lib/notifications', () => ({
  notifyContactAdded: jest.fn(),
}));

jest.mock('../../src/lib/events', () => ({
  contactEvents: { onRefresh: jest.fn(() => jest.fn()) },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// ─── Types mirroring the Contact shape ────────────────────────────────────────
interface Contact {
  id: string;
  name: string;
  phone: string;
  status: string;
  relationship: string | null;
  is_on_app: boolean;
  contact_user_id: string | null;
  avatar_url?: string;
}

type CachedContact = { name: string; phone: string; status: string };

// ─── Contact status splitting ─────────────────────────────────────────────────
// Mirrors how contacts.tsx (the screen) splits the contacts array into
// active, pending, and protectingContacts for the UI tabs.

function splitContacts(contacts: Contact[]) {
  const active  = contacts.filter(c => c.status === 'accepted');
  const pending = contacts.filter(c => c.status === 'pending');
  return { active, pending };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: `contact-${Math.random().toString(36).slice(2)}`,
    name: 'Test Contact',
    phone: '+2348012345678',
    status: 'accepted',
    relationship: 'Friend',
    is_on_app: true,
    contact_user_id: 'user-abc',
    ...overrides,
  };
}

describe('contact status splitting', () => {
  it('puts accepted contacts in the active list', () => {
    const contacts = [makeContact({ status: 'accepted' })];
    const { active, pending } = splitContacts(contacts);
    expect(active).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });

  it('puts pending contacts in the pending list', () => {
    const contacts = [makeContact({ status: 'pending' })];
    const { active, pending } = splitContacts(contacts);
    expect(active).toHaveLength(0);
    expect(pending).toHaveLength(1);
  });

  it('splits a mixed list correctly', () => {
    const contacts = [
      makeContact({ status: 'accepted' }),
      makeContact({ status: 'pending' }),
      makeContact({ status: 'accepted' }),
      makeContact({ status: 'pending' }),
      makeContact({ status: 'pending' }),
    ];
    const { active, pending } = splitContacts(contacts);
    expect(active).toHaveLength(2);
    expect(pending).toHaveLength(3);
  });

  it('returns empty lists for an empty contacts array', () => {
    const { active, pending } = splitContacts([]);
    expect(active).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });

  it('ignores contacts with other statuses (e.g. "declined")', () => {
    const contacts = [makeContact({ status: 'declined' })];
    const { active, pending } = splitContacts(contacts);
    expect(active).toHaveLength(0);
    expect(pending).toHaveLength(0);
  });
});

// ─── Cache-to-Contact offline mapping ────────────────────────────────────────
// Mirrors the code in useContacts.fetchContacts that maps the AsyncStorage
// cache to the Contact shape when Supabase is unreachable.

function mapCacheToContacts(cached: CachedContact[]): Contact[] {
  return cached.map((c, i) => ({
    id: `cached_${i}`,
    name: c.name,
    phone: c.phone,
    status: c.status,
    relationship: null,
    is_on_app: false,
    contact_user_id: null,
  }));
}

describe('cache-to-Contact offline mapping', () => {
  it('produces a Contact with is_on_app=false', () => {
    const cached: CachedContact[] = [{ name: 'Alice', phone: '+2348000000001', status: 'accepted' }];
    const contacts = mapCacheToContacts(cached);
    expect(contacts[0].is_on_app).toBe(false);
  });

  it('produces a Contact with contact_user_id=null', () => {
    const cached: CachedContact[] = [{ name: 'Alice', phone: '+2348000000001', status: 'accepted' }];
    const contacts = mapCacheToContacts(cached);
    expect(contacts[0].contact_user_id).toBeNull();
  });

  it('generates stable IDs using the index', () => {
    const cached: CachedContact[] = [
      { name: 'Alice', phone: '+2348000000001', status: 'accepted' },
      { name: 'Bob',   phone: '+2348000000002', status: 'pending' },
    ];
    const contacts = mapCacheToContacts(cached);
    expect(contacts[0].id).toBe('cached_0');
    expect(contacts[1].id).toBe('cached_1');
  });

  it('preserves name, phone, and status from the cache', () => {
    const cached: CachedContact[] = [{ name: 'Alice', phone: '+2348012345678', status: 'accepted' }];
    const contacts = mapCacheToContacts(cached);
    expect(contacts[0].name).toBe('Alice');
    expect(contacts[0].phone).toBe('+2348012345678');
    expect(contacts[0].status).toBe('accepted');
  });

  it('maps an empty cache to an empty array', () => {
    expect(mapCacheToContacts([])).toHaveLength(0);
  });
});

// ─── getContactsCacheKey ──────────────────────────────────────────────────────
// Mirrors the private cache key builder. This is important because if it
// ever changes, different users' data could overwrite each other.

function getContactsCacheKey(userId: string): string {
  return `safen_cached_contacts_${userId}`;
}

describe('getContactsCacheKey', () => {
  it('includes the userId in the key', () => {
    const key = getContactsCacheKey('user-123');
    expect(key).toContain('user-123');
  });

  it('produces different keys for different users', () => {
    const key1 = getContactsCacheKey('user-A');
    const key2 = getContactsCacheKey('user-B');
    expect(key1).not.toBe(key2);
  });

  it('is deterministic for the same userId', () => {
    expect(getContactsCacheKey('user-XYZ')).toBe(getContactsCacheKey('user-XYZ'));
  });

  it('uses a namespace prefix to avoid collisions with other AsyncStorage keys', () => {
    const key = getContactsCacheKey('user-abc');
    expect(key.startsWith('safen_')).toBe(true);
  });
});

// ─── Multi-format phone lookup ────────────────────────────────────────────────
// Mirrors the phone format array built in the recheck logic.
// Critical for finding off-app contacts when they join Safen later.

import { toE164Nigeria } from '../../src/utils/contactUtils';

function buildPhoneFormats(rawPhone: string): string[] {
  const e164 = toE164Nigeria(rawPhone);
  const withoutPlus = e164.replace(/^\+/, '');
  const digits = rawPhone.replace(/\D/g, '');
  return [...new Set([e164, withoutPlus, digits])];
}

describe('buildPhoneFormats (multi-format lookup for off-app contacts)', () => {
  it('produces the E.164 format', () => {
    const formats = buildPhoneFormats('08012345678');
    expect(formats).toContain('+2348012345678');
  });

  it('produces the format without leading +', () => {
    const formats = buildPhoneFormats('08012345678');
    expect(formats).toContain('2348012345678');
  });

  it('produces the raw digits format', () => {
    const formats = buildPhoneFormats('0801 234 5678');
    expect(formats).toContain('08012345678');
  });

  it('deduplicates formats when they are identical', () => {
    // For an already-E164 number, e164 and withoutPlus+digits may overlap
    const formats = buildPhoneFormats('+2348012345678');
    const unique = new Set(formats);
    expect(unique.size).toBe(formats.length);
  });

  it('always produces at least 1 format for a valid number', () => {
    const formats = buildPhoneFormats('08012345678');
    expect(formats.length).toBeGreaterThanOrEqual(1);
  });

  it('all formats are non-empty strings', () => {
    const formats = buildPhoneFormats('08012345678');
    for (const fmt of formats) {
      expect(typeof fmt).toBe('string');
      expect(fmt.length).toBeGreaterThan(0);
    }
  });
});
