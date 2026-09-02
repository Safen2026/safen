import { getUserDisplayName } from '../../src/utils/userUtils';
import type { User } from '@supabase/supabase-js';

// Helper to create a minimal User-like object
function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    user_metadata: {},
    app_metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

describe('getUserDisplayName', () => {
  // ── Priority: profileName first ──────────────────────────────────────────
  it('returns profileName when provided and non-empty', () => {
    const user = makeUser({ email: 'test@example.com' });
    expect(getUserDisplayName(user, 'George Jr')).toBe('George Jr');
  });

  it('trims whitespace from profileName', () => {
    const user = makeUser();
    expect(getUserDisplayName(user, '  Alice  ')).toBe('Alice');
  });

  it('falls through to next option if profileName is empty string', () => {
    const user = makeUser({ user_metadata: { full_name: 'Meta Name' } });
    expect(getUserDisplayName(user, '')).toBe('Meta Name');
  });

  it('falls through to next option if profileName is whitespace only', () => {
    const user = makeUser({ user_metadata: { full_name: 'Meta Name' } });
    expect(getUserDisplayName(user, '   ')).toBe('Meta Name');
  });

  // ── Priority: full_name metadata ─────────────────────────────────────────
  it('returns full_name from user_metadata when profileName is absent', () => {
    const user = makeUser({ user_metadata: { full_name: 'Amara Okafor' } });
    expect(getUserDisplayName(user)).toBe('Amara Okafor');
  });

  it('returns first_name from user_metadata when full_name is absent', () => {
    const user = makeUser({ user_metadata: { first_name: 'Chidi' } });
    expect(getUserDisplayName(user)).toBe('Chidi');
  });

  it('prefers full_name over first_name', () => {
    const user = makeUser({ user_metadata: { full_name: 'Full Name', first_name: 'First' } });
    expect(getUserDisplayName(user)).toBe('Full Name');
  });

  // ── Priority: email prefix ───────────────────────────────────────────────
  it('returns email prefix when metadata is empty', () => {
    const user = makeUser({ email: 'george@safen.app', user_metadata: {} });
    expect(getUserDisplayName(user)).toBe('george');
  });

  it('handles email with no prefix gracefully', () => {
    // Edge case: email is just "@domain.com"
    const user = makeUser({ email: '@safen.app', user_metadata: {} });
    // Empty prefix → falls through to default
    expect(getUserDisplayName(user)).toBe('A Safen user');
  });

  // ── Fallback ─────────────────────────────────────────────────────────────
  it('returns "A Safen user" when user is null', () => {
    expect(getUserDisplayName(null)).toBe('A Safen user');
  });

  it('returns "A Safen user" when user is undefined', () => {
    expect(getUserDisplayName(undefined)).toBe('A Safen user');
  });

  it('returns "A Safen user" when user has no email and no metadata', () => {
    const user = makeUser({ email: undefined, user_metadata: {} });
    expect(getUserDisplayName(user)).toBe('A Safen user');
  });
});
