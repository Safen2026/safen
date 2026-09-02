/**
 * Tests for src/constants/Theme.ts
 *
 * LightTheme and DarkTheme must have identical key shapes. If DarkTheme is
 * missing any key that LightTheme defines, the app crashes when dark mode
 * activates. These tests catch that at commit time.
 */

import { LightTheme, DarkTheme, Colors, Shadows } from '../../src/constants/Theme';
import type { ThemeColors } from '../../src/constants/Theme';

// ─── Key parity ───────────────────────────────────────────────────────────────

function getAllLeafPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...getAllLeafPaths(value as Record<string, unknown>, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

describe('LightTheme / DarkTheme key parity', () => {
  it('DarkTheme has all the same leaf keys as LightTheme', () => {
    const lightKeys = getAllLeafPaths(LightTheme as unknown as Record<string, unknown>).sort();
    const darkKeys  = getAllLeafPaths(DarkTheme as unknown as Record<string, unknown>).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('LightTheme has all the same leaf keys as DarkTheme', () => {
    // Symmetric check: DarkTheme must not have extra keys either
    const lightKeys = getAllLeafPaths(LightTheme as unknown as Record<string, unknown>).sort();
    const darkKeys  = getAllLeafPaths(DarkTheme as unknown as Record<string, unknown>).sort();
    expect(lightKeys).toEqual(darkKeys);
  });
});

// ─── Value type consistency ────────────────────────────────────────────────────
// All color values must be non-empty strings

describe('theme color values', () => {
  it('every leaf value in LightTheme is a non-empty string', () => {
    const paths = getAllLeafPaths(LightTheme as unknown as Record<string, unknown>);
    for (const path of paths) {
      const keys = path.split('.');
      let value: unknown = LightTheme;
      for (const k of keys) value = (value as Record<string, unknown>)[k];
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('every leaf value in DarkTheme is a non-empty string', () => {
    const paths = getAllLeafPaths(DarkTheme as unknown as Record<string, unknown>);
    for (const path of paths) {
      const keys = path.split('.');
      let value: unknown = DarkTheme;
      for (const k of keys) value = (value as Record<string, unknown>)[k];
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });
});

// ─── Known critical colors ────────────────────────────────────────────────────
// SOS red must stay consistent across both themes (it's a safety color)

describe('critical safety colors', () => {
  it('primary color (SOS red) is the same in both themes', () => {
    expect(LightTheme.primary).toBe(DarkTheme.primary);
  });

  it('SOS red is #E02B2B in both themes', () => {
    expect(LightTheme.primary).toBe('#E02B2B');
    expect(DarkTheme.primary).toBe('#E02B2B');
  });
});

// ─── Colors alias ─────────────────────────────────────────────────────────────
// Colors = LightTheme is a documented backward-compat alias

describe('Colors alias', () => {
  it('Colors is the same reference as LightTheme', () => {
    expect(Colors).toBe(LightTheme);
  });
});

// ─── ThemeColors type ─────────────────────────────────────────────────────────
// ThemeColors must be derived from LightTheme (not from some other shape)

describe('ThemeColors type alignment', () => {
  it('LightTheme satisfies ThemeColors', () => {
    // TypeScript compile-time check — if LightTheme doesn't satisfy ThemeColors this file won't compile
    const _check: ThemeColors = LightTheme;
    expect(_check).toBe(LightTheme);
  });

  it('DarkTheme satisfies ThemeColors', () => {
    const _check: ThemeColors = DarkTheme;
    expect(_check).toBe(DarkTheme);
  });
});

// ─── Shadows object ───────────────────────────────────────────────────────────

describe('Shadows', () => {
  it('has sm, md, lg, and sos shadow presets', () => {
    expect(Shadows).toHaveProperty('sm');
    expect(Shadows).toHaveProperty('md');
    expect(Shadows).toHaveProperty('lg');
    expect(Shadows).toHaveProperty('sos');
  });

  it('every shadow has a positive elevation value', () => {
    for (const [, shadow] of Object.entries(Shadows)) {
      expect((shadow as { elevation: number }).elevation).toBeGreaterThan(0);
    }
  });

  it('SOS shadow uses the SOS red color', () => {
    expect(Shadows.sos.shadowColor).toBe('#E02B2B');
  });
});
