/**
 * Tests for area.ts — matching a device reverse-geocode to the gazetteer.
 *
 * Production had zero profiles with a resolved area: the old exact `ilike`
 * match failed on strings like "Lagos State" or "Abuja", silently dropping
 * every user into the national feed.
 */
import { matchLga, matchState } from '../../src/lib/area';

const STATES = [
  { code: 'LA', name: 'Lagos' },
  { code: 'FC', name: 'Federal Capital Territory' },
  { code: 'AK', name: 'Akwa Ibom' },
  { code: 'NA', name: 'Nasarawa' },
];

const LGAS = [
  { code: 'LA-IKJ', name: 'Ikeja' },
  { code: 'LA-ETO', name: 'Eti-Osa' },
  { code: 'LA-LIS', name: 'Lagos Island' },
];

describe('matchState', () => {
  it('matches an exact state name', () => {
    expect(matchState('Lagos', STATES)).toBe('LA');
  });

  it('ignores a trailing "State" and letter case', () => {
    expect(matchState('LAGOS STATE', STATES)).toBe('LA');
    expect(matchState('Akwa Ibom State', STATES)).toBe('AK');
  });

  it('maps Abuja and FCT to the Federal Capital Territory', () => {
    expect(matchState('Abuja', STATES)).toBe('FC');
    expect(matchState('FCT', STATES)).toBe('FC');
    expect(matchState('Abuja Federal Capital Territory', STATES)).toBe('FC');
  });

  it('accepts the alternate Nassarawa spelling', () => {
    expect(matchState('Nassarawa', STATES)).toBe('NA');
  });

  it('returns null for an unknown or missing region', () => {
    expect(matchState('Greater Accra', STATES)).toBeNull();
    expect(matchState(null, STATES)).toBeNull();
    expect(matchState('', STATES)).toBeNull();
  });
});

describe('matchState against the real gazetteer', () => {
  // Read the seed itself so the test tracks what production actually holds.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const seed = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20260827120300_gazetteer_seed_states.sql'),
    'utf8',
  );
  const all = [...seed.matchAll(/\('([A-Z]{2})','([^']+)'\)/g)]
    .map(([, code, name]) => ({ code, name }));

  it('covers all 36 states plus the FCT', () => {
    expect(all).toHaveLength(37);
  });

  it.each(all)('resolves $name as written and as "$name State"', ({ code, name }) => {
    expect(matchState(name, all)).toBe(code);
    expect(matchState(`${name} State`, all)).toBe(code);
    expect(matchState(name.toUpperCase(), all)).toBe(code);
  });
});

describe('matchLga', () => {
  it('ignores case, punctuation and a trailing "LGA"', () => {
    expect(matchLga('ikeja', LGAS)).toBe('LA-IKJ');
    expect(matchLga('Eti Osa', LGAS)).toBe('LA-ETO');
    expect(matchLga('Ikeja LGA', LGAS)).toBe('LA-IKJ');
    expect(matchLga('Lagos Island Local Government Area', LGAS)).toBe('LA-LIS');
  });

  it('returns null when nothing matches', () => {
    expect(matchLga('Surulere', LGAS)).toBeNull();
    expect(matchLga(null, LGAS)).toBeNull();
  });
});
