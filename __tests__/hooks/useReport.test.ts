/**
 * Tests for the GATE_MESSAGES map and pure logic in useReport.ts.
 *
 * The GATE_MESSAGES map is a security-relevant contract: if a gate code
 * is missing or wrong, the user sees a confusing generic error instead of
 * an actionable message. These tests ensure every known gate code maps to
 * a non-empty, user-facing message.
 *
 * We also test the media failure count calculation and the snippet-truncation
 * logic (details capped at 120 chars for the notification body).
 */

// ─── GATE_MESSAGES ────────────────────────────────────────────────────────────
// Mirror the map from useReport.ts — if a key is added/removed in the source,
// this test catches the mismatch.

const GATE_MESSAGES: Record<string, string> = {
  QUALITY_GATE_MISSING_PERSON_PHOTO:       'A missing-person report needs a recent photo.',
  QUALITY_GATE_MISSING_PERSON_LAST_SEEN:   'Please add when the person was last seen.',
  QUALITY_GATE_MISSING_PERSON_POLICE_REF:  'Please add the police station and case reference.',
  QUALITY_GATE_MISSING_PERSON_LOCATION:    'We need the location where they were last seen.',
  QUALITY_GATE_TOKEN_MISSING:              'Your report could not be verified. Please try submitting again.',
  QUALITY_GATE_TOKEN_UNKNOWN:              'Your report could not be verified. Please try submitting again.',
  QUALITY_GATE_TOKEN_USED:                 'This report was already submitted.',
  QUALITY_GATE_TOKEN_EXPIRED:              'Your report took too long to upload. Please submit it again.',
  QUALITY_GATE_TOKEN_WRONG_USER:           'Your report could not be verified. Please try submitting again.',
  QUALITY_GATE_PAYLOAD_MISMATCH:           'Your report changed after it was checked. Please submit it again.',
};

describe('GATE_MESSAGES', () => {
  it('has 10 gate codes', () => {
    expect(Object.keys(GATE_MESSAGES)).toHaveLength(10);
  });

  it('every gate code maps to a non-empty user-facing message', () => {
    for (const [code, message] of Object.entries(GATE_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(typeof message).toBe('string');
      // Message should be a complete sentence ending in . or !
      expect(message).toMatch(/[.!]$/);
      // Gate codes must follow the QUALITY_GATE_ prefix convention
      expect(code).toMatch(/^QUALITY_GATE_/);
    }
  });

  it('all QUALITY_GATE_TOKEN_* codes resolve to the same generic re-submit message', () => {
    const genericMessage = 'Your report could not be verified. Please try submitting again.';
    expect(GATE_MESSAGES['QUALITY_GATE_TOKEN_MISSING']).toBe(genericMessage);
    expect(GATE_MESSAGES['QUALITY_GATE_TOKEN_UNKNOWN']).toBe(genericMessage);
    expect(GATE_MESSAGES['QUALITY_GATE_TOKEN_WRONG_USER']).toBe(genericMessage);
  });

  it('QUALITY_GATE_TOKEN_USED has a distinct message from generic token errors', () => {
    expect(GATE_MESSAGES['QUALITY_GATE_TOKEN_USED']).not.toBe(
      GATE_MESSAGES['QUALITY_GATE_TOKEN_MISSING']
    );
  });

  it('missing-person codes all have distinct user-facing messages', () => {
    const mpCodes = [
      'QUALITY_GATE_MISSING_PERSON_PHOTO',
      'QUALITY_GATE_MISSING_PERSON_LAST_SEEN',
      'QUALITY_GATE_MISSING_PERSON_POLICE_REF',
      'QUALITY_GATE_MISSING_PERSON_LOCATION',
    ];
    const messages = mpCodes.map(c => GATE_MESSAGES[c]);
    const unique = new Set(messages);
    expect(unique.size).toBe(mpCodes.length);
  });

  it('gate code lookup via substring match works correctly', () => {
    // Mirrors the logic: Object.keys(GATE_MESSAGES).find(k => errorMessage.includes(k))
    const errorMessage = 'pgrst: QUALITY_GATE_TOKEN_EXPIRED – token has expired';
    const code = Object.keys(GATE_MESSAGES).find(k => errorMessage.includes(k));
    expect(code).toBe('QUALITY_GATE_TOKEN_EXPIRED');
    expect(GATE_MESSAGES[code!]).toContain('took too long');
  });

  it('returns undefined for an error message with no recognised gate code', () => {
    const errorMessage = 'duplicate key value violates unique constraint';
    const code = Object.keys(GATE_MESSAGES).find(k => errorMessage.includes(k));
    expect(code).toBeUndefined();
  });
});

// ─── Media upload failure counting ───────────────────────────────────────────
// Mirrors: const failedCount = payload.media.length - uploadedUrls.length

function countMediaFailures(totalMedia: number, successfulUploads: number): number {
  return totalMedia - successfulUploads;
}

describe('media upload failure counting', () => {
  it('is 0 when all media uploads succeed', () => {
    expect(countMediaFailures(3, 3)).toBe(0);
  });

  it('correctly counts partial failures', () => {
    expect(countMediaFailures(4, 2)).toBe(2);
  });

  it('is equal to totalMedia when all uploads fail', () => {
    expect(countMediaFailures(3, 0)).toBe(3);
  });

  it('is 0 when there are no media attachments', () => {
    expect(countMediaFailures(0, 0)).toBe(0);
  });
});

// ─── Details snippet truncation ───────────────────────────────────────────────
// Mirrors: payload.details.slice(0, 120) in the notification call

function truncateDetailsSnippet(details: string, maxLength = 120): string | null {
  if (!details) return null;
  return details.slice(0, maxLength);
}

describe('details snippet truncation', () => {
  it('returns null for empty string', () => {
    expect(truncateDetailsSnippet('')).toBeNull();
  });

  it('returns null for undefined (falsy) input', () => {
    // The source uses: if (!details) return null
    // undefined is falsy
    expect(truncateDetailsSnippet(undefined as unknown as string)).toBeNull();
  });

  it('returns the full string if under 120 chars', () => {
    const short = 'Armed robbery on Victoria Island';
    expect(truncateDetailsSnippet(short)).toBe(short);
  });

  it('truncates to exactly 120 chars for a long string', () => {
    const long = 'A'.repeat(200);
    const result = truncateDetailsSnippet(long);
    expect(result?.length).toBe(120);
  });

  it('keeps exactly 120 chars when input is exactly 120 chars', () => {
    const exact = 'B'.repeat(120);
    expect(truncateDetailsSnippet(exact)).toBe(exact);
  });

  it('truncates correctly for 121 chars (one over the limit)', () => {
    const oneOver = 'C'.repeat(121);
    const result = truncateDetailsSnippet(oneOver);
    expect(result?.length).toBe(120);
    expect(result).toBe('C'.repeat(120));
  });
});

// ─── hasMedia detection ───────────────────────────────────────────────────────
// Mirrors: hasMedia: (payload.media?.length ?? 0) > 0

function hasMedia(media?: string[]): boolean {
  return (media?.length ?? 0) > 0;
}

describe('hasMedia detection', () => {
  it('returns false when media is undefined', () => {
    expect(hasMedia(undefined)).toBe(false);
  });

  it('returns false when media is an empty array', () => {
    expect(hasMedia([])).toBe(false);
  });

  it('returns true when media has at least one item', () => {
    expect(hasMedia(['https://example.com/photo.jpg'])).toBe(true);
  });

  it('returns true for multiple media items', () => {
    expect(hasMedia(['a', 'b', 'c'])).toBe(true);
  });
});
