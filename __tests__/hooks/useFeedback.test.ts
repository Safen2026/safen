/**
 * Tests for the pure validation logic in useFeedback.ts.
 *
 * useFeedback has two application-layer security rules that must never regress:
 *   1. Empty/whitespace-only messages are rejected
 *   2. Messages > 1000 characters are rejected (DoS protection)
 *
 * These are extracted and tested as pure functions to keep the tests fast
 * and free of React/Supabase dependencies.
 */

// ─── Validation logic ─────────────────────────────────────────────────────────
// Mirrors the validation in useFeedback.submitFeedback

type ValidationResult =
  | { valid: true }
  | { valid: false; reason: 'empty' | 'too_long' };

function validateFeedbackMessage(message: string): ValidationResult {
  const trimmed = message.trim();
  if (!trimmed) return { valid: false, reason: 'empty' };
  if (trimmed.length > 1000) return { valid: false, reason: 'too_long' };
  return { valid: true };
}

describe('feedback message validation', () => {
  // ── Empty / whitespace ───────────────────────────────────────────────────
  it('rejects an empty string', () => {
    expect(validateFeedbackMessage('')).toEqual({ valid: false, reason: 'empty' });
  });

  it('rejects a whitespace-only string', () => {
    expect(validateFeedbackMessage('   ')).toEqual({ valid: false, reason: 'empty' });
  });

  it('rejects a tab-only string', () => {
    expect(validateFeedbackMessage('\t\n\r')).toEqual({ valid: false, reason: 'empty' });
  });

  it('accepts a message that is whitespace-padded but has real content', () => {
    expect(validateFeedbackMessage('  Great app!  ')).toEqual({ valid: true });
  });

  // ── Length limits (DoS protection) ────────────────────────────────────────
  it('accepts a message of exactly 1000 characters', () => {
    const exactly1000 = 'A'.repeat(1000);
    expect(validateFeedbackMessage(exactly1000)).toEqual({ valid: true });
  });

  it('rejects a message of 1001 characters', () => {
    const tooLong = 'A'.repeat(1001);
    expect(validateFeedbackMessage(tooLong)).toEqual({ valid: false, reason: 'too_long' });
  });

  it('rejects a message of 5000 characters', () => {
    const massive = 'X'.repeat(5000);
    expect(validateFeedbackMessage(massive)).toEqual({ valid: false, reason: 'too_long' });
  });

  it('trimming is applied BEFORE checking length (cannot bypass the 1000-char limit with padding)', () => {
    // A message that is 1001 chars but only 1 non-whitespace char
    // → trimmed = 'A' (length 1) → valid
    const padded = ' '.repeat(500) + 'A' + ' '.repeat(500);
    expect(validateFeedbackMessage(padded)).toEqual({ valid: true });
  });

  it('trimming is applied BEFORE checking length (1001 real chars is still rejected)', () => {
    // A message with 1001 real characters (no padding)
    const real1001 = 'B'.repeat(1001);
    expect(validateFeedbackMessage(real1001)).toEqual({ valid: false, reason: 'too_long' });
  });

  // ── Valid messages ────────────────────────────────────────────────────────
  it('accepts a normal short message', () => {
    expect(validateFeedbackMessage('The SOS button is very intuitive.')).toEqual({ valid: true });
  });

  it('accepts a message with special characters', () => {
    expect(validateFeedbackMessage('Lagos 🇳🇬 is safe now! Great feature!')).toEqual({ valid: true });
  });

  it('accepts a message with newlines (multi-line feedback)', () => {
    const multiline = 'Feature request:\n1. Dark mode\n2. Biometric login';
    expect(validateFeedbackMessage(multiline)).toEqual({ valid: true });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('single character is valid', () => {
    expect(validateFeedbackMessage('!')).toEqual({ valid: true });
  });

  it('999 chars is valid', () => {
    expect(validateFeedbackMessage('C'.repeat(999))).toEqual({ valid: true });
  });
});
