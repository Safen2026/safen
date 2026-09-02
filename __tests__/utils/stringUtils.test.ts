import { getInitials } from '../../src/utils/stringUtils';

describe('getInitials (stringUtils)', () => {
  it('returns "JD" for "John Doe"', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('returns "J" for a single-word name', () => {
    expect(getInitials('Jane')).toBe('J');
  });

  it('returns only the first two initials for a three-word name', () => {
    expect(getInitials('John Michael Doe')).toBe('JM');
  });

  it('returns "" for an empty string', () => {
    expect(getInitials('')).toBe('');
  });

  it('returns "" for whitespace-only string', () => {
    expect(getInitials('   ')).toBe('');
  });

  it('handles extra whitespace between words', () => {
    expect(getInitials('John   Doe')).toBe('JD');
  });

  it('handles leading and trailing whitespace', () => {
    expect(getInitials('  John Doe  ')).toBe('JD');
  });

  it('returns uppercase initials regardless of input case', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('handles single character name', () => {
    expect(getInitials('A')).toBe('A');
  });

  it('does not crash for special characters', () => {
    expect(() => getInitials('👋 World')).not.toThrow();
  });
});
