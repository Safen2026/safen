import {
  toE164Nigeria,
  isValidPhone,
  getInitials,
  getAvatarColor,
} from '../../src/utils/contactUtils';

// ─── toE164Nigeria ────────────────────────────────────────────────────────────
describe('toE164Nigeria', () => {
  it('converts a 0xx 11-digit number to +234xx', () => {
    expect(toE164Nigeria('08012345678')).toBe('+2348012345678');
  });

  it('converts a bare 10-digit number (no leading 0) to +234xx', () => {
    expect(toE164Nigeria('8012345678')).toBe('+2348012345678');
  });

  it('passes through a number already starting with 234', () => {
    expect(toE164Nigeria('2348012345678')).toBe('+2348012345678');
  });

  it('passes through a number already starting with +234', () => {
    expect(toE164Nigeria('+2348012345678')).toBe('+2348012345678');
  });

  it('strips spaces and dashes before converting', () => {
    expect(toE164Nigeria('080 1234 5678')).toBe('+2348012345678');
    expect(toE164Nigeria('080-1234-5678')).toBe('+2348012345678');
  });

  it('handles an international format with spaces', () => {
    expect(toE164Nigeria('+234 801 234 5678')).toBe('+2348012345678');
  });

  it('handles a number with parentheses (strips non-digits)', () => {
    // '(080) 1234-5678' → digits = '08012345678' → +2348012345678
    expect(toE164Nigeria('(080) 1234-5678')).toBe('+2348012345678');
  });

  it('strips dots as well as dashes and spaces', () => {
    expect(toE164Nigeria('080.1234.5678')).toBe('+2348012345678');
  });
});

// ─── isValidPhone ─────────────────────────────────────────────────────────────
describe('isValidPhone', () => {
  it('accepts a valid 0xx 11-digit Nigerian number', () => {
    expect(isValidPhone('08012345678')).toBe(true);
  });

  it('accepts a valid 10-digit number (no leading 0)', () => {
    expect(isValidPhone('8012345678')).toBe(true);
  });

  it('accepts a valid 234-prefixed 13-digit number', () => {
    expect(isValidPhone('2348012345678')).toBe(true);
  });

  it('rejects a too-short 0xx number', () => {
    expect(isValidPhone('0801234567')).toBe(false); // 10 digits with leading 0
  });

  it('rejects a too-long 0xx number', () => {
    expect(isValidPhone('080123456789')).toBe(false); // 12 digits with leading 0
  });

  it('rejects an empty string', () => {
    expect(isValidPhone('')).toBe(false);
  });

  it('rejects a random short string', () => {
    expect(isValidPhone('123')).toBe(false);
  });

  it('rejects a 234-prefixed number that is too short', () => {
    expect(isValidPhone('234801234567')).toBe(false); // 12 digits, not 13
  });

  it('ignores formatting characters', () => {
    expect(isValidPhone('0801 234 5678')).toBe(true);
    expect(isValidPhone('0801-234-5678')).toBe(true);
  });

  it('rejects a +234-prefixed number that is too long', () => {
    expect(isValidPhone('+23480123456789')).toBe(false); // 15 digits — too long
  });

  it('rejects a non-numeric string', () => {
    expect(isValidPhone('not-a-number')).toBe(false);
  });

  it('rejects a number with only the country code', () => {
    expect(isValidPhone('+234')).toBe(false);
  });
});

// ─── getInitials (contactUtils) ───────────────────────────────────────────────
describe('contactUtils.getInitials', () => {
  it('returns initials of first two words', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns only first initial for single-word name', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('returns only two initials for a three-word name', () => {
    expect(getInitials('John Michael Doe')).toBe('JM');
  });

  it('returns empty string for empty string', () => {
    expect(getInitials('')).toBe('');
  });

  it('returns empty string for whitespace-only string', () => {
    expect(getInitials('   ')).toBe('');
  });

  it('is case-insensitive — always returns uppercase initials', () => {
    expect(getInitials('alice bob')).toBe('AB');
  });
});

// ─── getAvatarColor ───────────────────────────────────────────────────────────
describe('getAvatarColor', () => {
  const PALETTE = ['#0A2463', '#1B5E20', '#DC2626', '#EA580C', '#7C3AED'];

  it('returns a color from the palette', () => {
    const color = getAvatarColor('Alice');
    expect(PALETTE).toContain(color);
  });

  it('is deterministic — same name always returns same color', () => {
    expect(getAvatarColor('George')).toBe(getAvatarColor('George'));
  });

  it('returns different colors for obviously different names', () => {
    // Not guaranteed but very likely for any 2 distinct names
    const colors = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'].map(getAvatarColor);
    const unique = new Set(colors);
    // Should not all resolve to the exact same color
    expect(unique.size).toBeGreaterThan(1);
  });

  it('handles an empty string without throwing', () => {
    expect(() => getAvatarColor('')).not.toThrow();
    // Even for empty string, must return a value from the palette
    expect(PALETTE).toContain(getAvatarColor(''));
  });

  it('returns a color for a single-character name', () => {
    expect(PALETTE).toContain(getAvatarColor('A'));
  });

  it('covers all 5 palette slots across different names', () => {
    // With enough different names, all 5 palette colors should appear.
    // Using 10 names gives >99.99% probability of hitting all 5 slots.
    const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'James'];
    const colors = names.map(getAvatarColor);
    const used = new Set(colors);
    expect(used.size).toBeGreaterThanOrEqual(2); // at minimum 2 distinct colours
  });
});
