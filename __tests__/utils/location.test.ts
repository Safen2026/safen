import { formatAddress, getDistanceMeters } from '../../src/utils/location';

// We define the shape locally so we don't need to import from expo-location
// (which is a native module and requires the mock). This matches the actual
// LocationGeocodedAddress interface used by the function.
type MinimalAddress = {
  city: string | null;
  country: string | null;
  district: string | null;
  isoCountryCode: string | null;
  name: string | null;
  postalCode: string | null;
  region: string | null;
  street: string | null;
  streetNumber: string | null;
  subregion: string | null;
  timezone: string | null;
};

// Helper to create a minimal address object
function makePlace(overrides: Partial<MinimalAddress> = {}): MinimalAddress {
  return {
    city: null,
    country: null,
    district: null,
    isoCountryCode: null,
    name: null,
    postalCode: null,
    region: null,
    street: null,
    streetNumber: null,
    subregion: null,
    timezone: null,
    ...overrides,
  };
}

describe('formatAddress', () => {
  // ─── Street present ────────────────────────────────────────────────────────
  it('formats street + city', () => {
    const result = formatAddress(makePlace({ street: 'Broad Street', city: 'Lagos' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Broad Street, Lagos');
  });

  it('prepends street number when present', () => {
    const result = formatAddress(makePlace({
      street: 'Victoria Island',
      streetNumber: '42',
      city: 'Lagos',
    }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('42 Victoria Island, Lagos');
  });

  it('uses subregion as secondary when city is absent', () => {
    const result = formatAddress(makePlace({ street: 'Ring Road', subregion: 'Ikeja' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Ring Road, Ikeja');
  });

  it('uses region as secondary when city and subregion are absent', () => {
    const result = formatAddress(makePlace({ street: 'Airport Road', region: 'Lagos State' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Airport Road, Lagos State');
  });

  // ─── No street → fall through to name ─────────────────────────────────────
  it('uses name when street is absent and name has no plus code', () => {
    const result = formatAddress(makePlace({ name: 'Ikeja Mall', city: 'Lagos' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Ikeja Mall, Lagos');
  });

  it('skips name if it contains a plus code (e.g. "6FR+9G")', () => {
    // Plus code in name → fall through to district
    const result = formatAddress(makePlace({
      name: '6FR+9G',
      district: 'Surulere',
      city: 'Lagos',
    }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Surulere, Lagos');
  });

  // ─── District fallback ─────────────────────────────────────────────────────
  it('falls back to district when street and usable name are absent', () => {
    const result = formatAddress(makePlace({ district: 'Yaba', city: 'Lagos' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Yaba, Lagos');
  });

  // ─── Ultimate fallback ─────────────────────────────────────────────────────
  it('returns "Unnamed Location" when all primary fields are absent', () => {
    const result = formatAddress(makePlace({ city: 'Lagos' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Unnamed Location, Lagos');
  });

  it('returns "Unnamed Location" with no secondary when everything is absent', () => {
    const result = formatAddress(makePlace() as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Unnamed Location');
  });

  // ─── No secondary location ─────────────────────────────────────────────────
  it('omits the comma when there is no secondary field', () => {
    const result = formatAddress(makePlace({ street: 'Unnamed Road' }) as Parameters<typeof formatAddress>[0]);
    expect(result).toBe('Unnamed Road');
    expect(result).not.toContain(',');
  });
});

describe('getDistanceMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(getDistanceMeters(6.5244, 3.3792, 6.5244, 3.3792)).toBe(0);
  });

  it('calculates approximately correct distance between two points in Lagos', () => {
    // Victoria Island (6.4281, 3.4219) to Ikeja (6.5966, 3.3431) is ~20km
    const dist = getDistanceMeters(6.4281, 3.4219, 6.5966, 3.3431);
    expect(dist).toBeGreaterThan(19000);
    expect(dist).toBeLessThan(23000);
  });

  it('detects short distance moves accurately (~100m)', () => {
    // 0.001 degree of latitude is roughly 111 meters
    const dist = getDistanceMeters(6.5244, 3.3792, 6.5254, 3.3792);
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(120);
  });

  describe('boundary and edge cases', () => {
    it('handles Null Island (0,0) without crashing', () => {
      expect(getDistanceMeters(0, 0, 0, 0)).toBe(0);
      expect(getDistanceMeters(0, 0, 1, 0)).toBeGreaterThan(110000);
    });

    it('handles negative coordinates across hemisperes', () => {
      // Lagos (Northern) to Johannesburg (Southern: -26.2041, 28.0473)
      const dist = getDistanceMeters(6.5244, 3.3792, -26.2041, 28.0473);
      expect(dist).toBeGreaterThan(4_500_000);
      expect(dist).toBeLessThan(5_000_000);
    });

    it('formatAddress handles empty string properties cleanly', () => {
      const result = formatAddress(makePlace({ street: '', name: '', city: 'Abuja' }) as any);
      expect(result).toBe('Unnamed Location, Abuja');
    });
  });
});
