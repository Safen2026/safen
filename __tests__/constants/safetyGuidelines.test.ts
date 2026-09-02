/**
 * Tests for src/constants/safetyGuidelines.ts
 *
 * The GUIDELINES array is the data contract for the Safety screen.
 * These tests verify the structural invariants so a future edit
 * (e.g. adding a guideline with a duplicate key or empty points list)
 * is caught immediately rather than causing a silent UI bug.
 */

import { GUIDELINES, type Guideline } from '../../src/constants/safetyGuidelines';

describe('GUIDELINES data contract', () => {
  // ── Structural presence ────────────────────────────────────────────────────
  it('is a non-empty array', () => {
    expect(Array.isArray(GUIDELINES)).toBe(true);
    expect(GUIDELINES.length).toBeGreaterThan(0);
  });

  it('has exactly 5 guidelines', () => {
    // If this changes intentionally, the test should be updated too
    expect(GUIDELINES).toHaveLength(5);
  });

  // ── Required keys ──────────────────────────────────────────────────────────
  it('contains the expected guideline keys', () => {
    const expectedKeys = ['setup', 'sos', 'reporting', 'everyday', 'contact'];
    const actualKeys = GUIDELINES.map((g: Guideline) => g.key);
    expect(actualKeys).toEqual(expectedKeys);
  });

  // ── Per-guideline field validation ─────────────────────────────────────────
  it('every guideline has a non-empty key', () => {
    for (const g of GUIDELINES) {
      expect(g.key.length).toBeGreaterThan(0);
    }
  });

  it('every guideline has a non-empty title', () => {
    for (const g of GUIDELINES) {
      expect(typeof g.title).toBe('string');
      expect(g.title.length).toBeGreaterThan(0);
    }
  });

  it('every guideline has a non-empty icon string', () => {
    for (const g of GUIDELINES) {
      expect(typeof g.icon).toBe('string');
      expect(g.icon.length).toBeGreaterThan(0);
    }
  });

  it('every guideline has a non-empty color', () => {
    for (const g of GUIDELINES) {
      expect(typeof g.color).toBe('string');
      expect(g.color.length).toBeGreaterThan(0);
    }
  });

  it('every guideline has at least 1 point', () => {
    for (const g of GUIDELINES) {
      expect(Array.isArray(g.points)).toBe(true);
      expect(g.points.length).toBeGreaterThan(0);
    }
  });

  it('every point in every guideline is a non-empty string', () => {
    for (const g of GUIDELINES) {
      for (const point of g.points) {
        expect(typeof point).toBe('string');
        expect(point.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('every guideline has a valid iconSet ("ion" or "mci")', () => {
    const validSets = ['ion', 'mci'];
    for (const g of GUIDELINES) {
      expect(validSets).toContain(g.iconSet);
    }
  });

  // ── Uniqueness ─────────────────────────────────────────────────────────────
  it('all keys are unique', () => {
    const keys = GUIDELINES.map((g: Guideline) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all titles are unique', () => {
    const titles = GUIDELINES.map((g: Guideline) => g.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  // ── Spot checks: specific known content ────────────────────────────────────
  it('"sos" guideline exists and is about SOS/Quick Action', () => {
    const sos = GUIDELINES.find((g: Guideline) => g.key === 'sos');
    expect(sos).toBeDefined();
    expect(sos!.title.toLowerCase()).toContain('sos');
  });

  it('"setup" guideline mentions emergency contacts', () => {
    const setup = GUIDELINES.find((g: Guideline) => g.key === 'setup');
    const fullText = setup!.points.join(' ').toLowerCase();
    expect(fullText).toContain('emergency contact');
  });

  it('"reporting" guideline mentions anonymous', () => {
    const reporting = GUIDELINES.find((g: Guideline) => g.key === 'reporting');
    const fullText = reporting!.points.join(' ').toLowerCase();
    expect(fullText).toContain('anonymous');
  });

  it('SOS guideline color is red (emergency color)', () => {
    const sos = GUIDELINES.find((g: Guideline) => g.key === 'sos');
    // Color is a hex string; red for SOS
    expect(sos!.color.toLowerCase()).toMatch(/#e0|#ff|#b9|#dc/i);
  });
});
