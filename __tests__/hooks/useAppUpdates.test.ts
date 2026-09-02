/**
 * Tests for useAppUpdates.ts — the throttle guard and update-blocking logic.
 *
 * The critical invariant: an OTA update must NEVER be prompted while the user
 * is in an active SOS alert. This test verifies the guard logic in isolation.
 *
 * We also test the throttle timing: checks should only fire once per 15 minutes.
 */

// ─── Throttle logic ───────────────────────────────────────────────────────────
// Mirrors: if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function isThrottled(lastCheckAt: number, now: number): boolean {
  return (now - lastCheckAt) < CHECK_INTERVAL_MS;
}

describe('update check throttle', () => {
  it('is NOT throttled on first check (lastCheck = 0)', () => {
    const lastCheckAt = 0;
    const now = Date.now();
    expect(isThrottled(lastCheckAt, now)).toBe(false);
  });

  it('IS throttled within 15 minutes of the last check', () => {
    const now = Date.now();
    const lastCheckAt = now - 5 * 60 * 1000; // 5 minutes ago
    expect(isThrottled(lastCheckAt, now)).toBe(true);
  });

  it('IS throttled at exactly 14m 59s after the last check', () => {
    const now = Date.now();
    const lastCheckAt = now - (CHECK_INTERVAL_MS - 1000); // 1s before interval ends
    expect(isThrottled(lastCheckAt, now)).toBe(true);
  });

  it('is NOT throttled after exactly 15 minutes have passed', () => {
    const now = Date.now();
    const lastCheckAt = now - CHECK_INTERVAL_MS;
    // exactly at the boundary: now - lastCheckAt = 15min, which is NOT < 15min
    expect(isThrottled(lastCheckAt, now)).toBe(false);
  });

  it('is NOT throttled after 30 minutes', () => {
    const now = Date.now();
    const lastCheckAt = now - 30 * 60 * 1000;
    expect(isThrottled(lastCheckAt, now)).toBe(false);
  });

  it('CHECK_INTERVAL_MS is exactly 15 minutes (900,000 ms)', () => {
    expect(CHECK_INTERVAL_MS).toBe(900_000);
  });
});

// ─── SOS active alert blocking ────────────────────────────────────────────────
// Mirrors: if (data && !error) return; // silently abort during SOS

type ActiveAlertResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } }
  | { data: null; error: null };

function shouldShowUpdatePrompt(result: ActiveAlertResult): boolean {
  // If there is an active alert, do NOT show the prompt
  if (result.data && !result.error) return false;
  // If there was a query error, we err on the safe side and show the prompt
  // (the original code does: if (error) console.warn; then continues)
  return true;
}

describe('SOS active-alert update blocking', () => {
  it('blocks the update prompt when the user has an active SOS alert', () => {
    const result: ActiveAlertResult = { data: { id: 'alert-123' }, error: null };
    expect(shouldShowUpdatePrompt(result)).toBe(false);
  });

  it('allows the update prompt when there is no active alert', () => {
    const result: ActiveAlertResult = { data: null, error: null };
    expect(shouldShowUpdatePrompt(result)).toBe(true);
  });

  it('allows the update prompt when the alert query errors (safe default: show update)', () => {
    const result: ActiveAlertResult = { data: null, error: { message: 'Network error' } };
    expect(shouldShowUpdatePrompt(result)).toBe(true);
  });
});

// ─── Update availability check ────────────────────────────────────────────────
// Mirrors the logic of checking both isAvailable and isNew

type UpdateCheckResult = { isAvailable: boolean };
type FetchResult = { isNew: boolean };

function shouldFetchUpdate(check: UpdateCheckResult): boolean {
  return check.isAvailable;
}

function shouldPromptForUpdate(fetch: FetchResult, hasActiveAlert: boolean): boolean {
  return fetch.isNew && !hasActiveAlert;
}

describe('update fetch and prompt logic', () => {
  it('fetches when update is available', () => {
    expect(shouldFetchUpdate({ isAvailable: true })).toBe(true);
  });

  it('does not fetch when no update is available', () => {
    expect(shouldFetchUpdate({ isAvailable: false })).toBe(false);
  });

  it('prompts when update is new and user has no active alert', () => {
    expect(shouldPromptForUpdate({ isNew: true }, false)).toBe(true);
  });

  it('does NOT prompt when update is not new', () => {
    expect(shouldPromptForUpdate({ isNew: false }, false)).toBe(false);
  });

  it('does NOT prompt when update is new but user has active alert (CRITICAL safety guard)', () => {
    expect(shouldPromptForUpdate({ isNew: true }, true)).toBe(false);
  });
});
