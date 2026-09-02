/**
 * Tests for reportQuality.ts
 *
 * The module calls `supabase.functions.invoke` — we mock the entire supabase
 * module so no real network requests are made.
 */

// ── Mock supabase ─────────────────────────────────────────────────────────────
const mockInvoke = jest.fn();
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { checkReportQuality, type QualityInput } from '../../src/lib/reportQuality';

const BASE_INPUT: QualityInput = {
  category: 'robbery',
  description: 'Armed robbery at 10 PM near the market',
  address: '12 Market Road, Lagos',
  latitude: 6.5244,
  longitude: 3.3792,
  hasMedia: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('checkReportQuality', () => {
  // ── Happy path: pass ───────────────────────────────────────────────────────
  it('returns a pass verdict with token and priority', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { status: 'pass', token: 'tok_abc', priority: 'high', quality_status: 'passed' },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('pass');
    if (result.status === 'pass') {
      expect(result.token).toBe('tok_abc');
      expect(result.priority).toBe('high');
      expect(result.degraded).toBe(false);
    }
  });

  it('sets degraded=true when quality_status is not "passed"', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { status: 'pass', token: 'tok_abc', priority: 'low', quality_status: 'degraded' },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('pass');
    if (result.status === 'pass') {
      expect(result.degraded).toBe(true);
    }
  });

  it('defaults priority to "medium" when backend omits it', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { status: 'pass', token: null, quality_status: 'passed' },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    if (result.status === 'pass') {
      expect(result.priority).toBe('medium');
    }
  });

  // ── needs_detail ───────────────────────────────────────────────────────────
  it('returns needs_detail verdict with missing fields and strikesLeft', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        status: 'needs_detail',
        missing: ['description', 'location'],
        feedback: 'Please describe what happened.',
        strikes: { count: 1, threshold: 3 },
      },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('needs_detail');
    if (result.status === 'needs_detail') {
      expect(result.missing).toEqual(['description', 'location']);
      expect(result.feedback).toBe('Please describe what happened.');
      expect(result.strikesLeft).toBe(2); // threshold(3) - count(1)
    }
  });

  it('strikesLeft cannot go below 0', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        status: 'needs_detail',
        missing: ['description'],
        feedback: 'Add more detail.',
        strikes: { count: 5, threshold: 3 }, // count > threshold
      },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    if (result.status === 'needs_detail') {
      expect(result.strikesLeft).toBe(0);
    }
  });

  it('uses fallback feedback when backend omits it', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        status: 'needs_detail',
        missing: ['address'],
        strikes: { count: 0, threshold: 3 },
      },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    if (result.status === 'needs_detail') {
      expect(result.feedback).toBe('Please add a little more detail.');
    }
  });

  // ── paused ─────────────────────────────────────────────────────────────────
  it('returns paused verdict with retryAt from data', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { status: 'paused', retry_at: '2026-09-02T12:00:00Z' },
      error: null,
    });

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('paused');
    if (result.status === 'paused') {
      expect(result.retryAt).toBe('2026-09-02T12:00:00Z');
    }
  });

  it('returns paused verdict when error is a 429 response', async () => {
    const mockResponse = {
      status: 429,
      json: async () => ({ status: 'paused', retry_at: '2026-09-02T13:00:00Z' }),
    };
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Rate limited', context: mockResponse },
    });

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('paused');
    if (result.status === 'paused') {
      expect(result.retryAt).toBe('2026-09-02T13:00:00Z');
    }
  });

  // ── Network failures → degraded pass (fail-open) ───────────────────────────
  it('returns a degraded pass when the invoke call errors (not 429)', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network error', context: null },
    });

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('pass');
    if (result.status === 'pass') {
      expect(result.degraded).toBe(true);
      expect(result.token).toBeNull();
      expect(result.priority).toBe('medium');
    }
  });

  it('returns a degraded pass when invoke throws an exception', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await checkReportQuality(BASE_INPUT);
    expect(result.status).toBe('pass');
    if (result.status === 'pass') {
      expect(result.degraded).toBe(true);
    }
  });

  it('returns a degraded pass when 429 body json() fails', async () => {
    const mockResponse = {
      status: 429,
      json: async () => { throw new Error('parse error'); },
    };
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'Rate limited', context: mockResponse },
    });

    const result = await checkReportQuality(BASE_INPUT);
    // Falls through to degraded pass because the body couldn't be parsed
    expect(result.status).toBe('pass');
    if (result.status === 'pass') {
      expect(result.degraded).toBe(true);
    }
  });

  // ── Optional fields forwarded correctly ────────────────────────────────────
  it('passes null for optional fields when omitted from input', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { status: 'pass', token: null, priority: 'medium', quality_status: 'passed' },
      error: null,
    });

    await checkReportQuality({
      category: 'other',
      description: 'Something happened',
      hasMedia: false,
    });

    expect(mockInvoke).toHaveBeenCalledWith('check-report-quality', {
      body: expect.objectContaining({
        address: null,
        latitude: null,
        longitude: null,
        last_seen_at: null,
        police_reference: null,
      }),
    });
  });
});
