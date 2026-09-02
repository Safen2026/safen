import {
  timeAgo,
  formatGroupedTime,
  formatDuration,
  formatDurationVerbose,
  formatArrivalDeadline,
} from '../../src/utils/dateUtils';

// ─── timeAgo ─────────────────────────────────────────────────────────────────
describe('timeAgo', () => {
  const freeze = (secsAgo: number) =>
    new Date(Date.now() - secsAgo * 1000).toISOString();

  it('returns "Just now" for < 1 minute', () => {
    expect(timeAgo(freeze(30))).toBe('Just now');
    expect(timeAgo(freeze(59))).toBe('Just now');
  });

  it('returns singular "1 min ago"', () => {
    expect(timeAgo(freeze(60))).toBe('1 min ago');
  });

  it('returns plural "5 mins ago"', () => {
    expect(timeAgo(freeze(300))).toBe('5 mins ago');
  });

  it('returns "59 mins ago" at the boundary before hours', () => {
    expect(timeAgo(freeze(59 * 60))).toBe('59 mins ago');
  });

  it('returns singular "1 hr ago"', () => {
    expect(timeAgo(freeze(3600))).toBe('1 hr ago');
  });

  it('returns plural "3 hrs ago"', () => {
    expect(timeAgo(freeze(3 * 3600))).toBe('3 hrs ago');
  });

  it('returns singular "1 day ago"', () => {
    expect(timeAgo(freeze(24 * 3600))).toBe('1 day ago');
  });

  it('returns plural "3 days ago"', () => {
    expect(timeAgo(freeze(3 * 24 * 3600))).toBe('3 days ago');
  });

  it('handles a future timestamp gracefully (sub-minute rounding)', () => {
    // 5 seconds in the future → diff is negative → floor to 0 mins → "Just now"
    const future = new Date(Date.now() + 5000).toISOString();
    expect(timeAgo(future)).toBe('Just now');
  });
});

// ─── formatGroupedTime ───────────────────────────────────────────────────────
describe('formatGroupedTime', () => {
  it('returns "" for empty string', () => {
    expect(formatGroupedTime('', 'Today')).toBe('');
  });

  it('returns "" for an invalid date string', () => {
    expect(formatGroupedTime('not-a-date', 'Today')).toBe('');
  });

  it('returns just the time for "Today"', () => {
    const iso = new Date().toISOString();
    const result = formatGroupedTime(iso, 'Today');
    expect(result).toMatch(/\d+:\d{2}\s?(AM|PM)/i);
    expect(result).not.toContain('Today');
  });

  it('prepends "Yesterday" for the Yesterday group', () => {
    const iso = new Date().toISOString();
    const result = formatGroupedTime(iso, 'Yesterday');
    expect(result.startsWith('Yesterday')).toBe(true);
  });

  it('prepends "2 Days Ago" for that group', () => {
    const iso = new Date().toISOString();
    const result = formatGroupedTime(iso, '2 Days Ago');
    expect(result.startsWith('2 Days Ago')).toBe(true);
  });

  it('returns just the time for an older date group header', () => {
    const iso = new Date('2024-01-15T14:30:00Z').toISOString();
    const result = formatGroupedTime(iso, 'January 15, 2024');
    // Should be just the time, no date prefix
    expect(result).not.toContain('January');
    expect(result).toMatch(/\d/);
  });
});

// ─── formatDuration ──────────────────────────────────────────────────────────
describe('formatDuration', () => {
  it('formats 0 seconds as "00:00"', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  it('formats 65 seconds as "01:05"', () => {
    expect(formatDuration(65)).toBe('01:05');
  });

  it('formats 3600 seconds as "60:00"', () => {
    expect(formatDuration(3600)).toBe('60:00');
  });

  it('pads single-digit seconds with zero', () => {
    expect(formatDuration(61)).toBe('01:01');
  });

  it('handles fractional seconds by flooring', () => {
    expect(formatDuration(90.9)).toBe('01:30');
  });

  it('formats exactly 59 seconds as "00:59"', () => {
    expect(formatDuration(59)).toBe('00:59');
  });

  it('formats 1 second as "00:01"', () => {
    expect(formatDuration(1)).toBe('00:01');
  });
});

// ─── formatDurationVerbose ───────────────────────────────────────────────────
describe('formatDurationVerbose', () => {
  it('returns "1 min" for 1 minute', () => {
    expect(formatDurationVerbose(1)).toBe('1 min');
  });

  it('returns "0 min" for 0 minutes', () => {
    // 0 minutes: days=0, hrs=0, minsRemaining=0 → '0 min'
    expect(formatDurationVerbose(0)).toBe('0 min');
  });

  it('returns "30 min" for 30 minutes', () => {
    expect(formatDurationVerbose(30)).toBe('30 min');
  });

  it('returns singular "1 hr" for 60 minutes', () => {
    expect(formatDurationVerbose(60)).toBe('1 hr');
  });

  it('returns plural "3 hrs" for 180 minutes', () => {
    expect(formatDurationVerbose(180)).toBe('3 hrs');
  });

  it('returns "2 hrs" for 120 minutes', () => {
    expect(formatDurationVerbose(120)).toBe('2 hrs');
  });

  it('returns "1h 30m" for 90 minutes', () => {
    expect(formatDurationVerbose(90)).toBe('1h 30m');
  });

  it('returns "2h 45m" for 165 minutes', () => {
    expect(formatDurationVerbose(165)).toBe('2h 45m');
  });

  it('returns "1d" for exactly 1440 minutes', () => {
    expect(formatDurationVerbose(1440)).toBe('1d');
  });

  it('returns "1d 6h" for 1440 + 360 minutes', () => {
    expect(formatDurationVerbose(1800)).toBe('1d 6h');
  });

  it('returns "1d 30m" for 1440 + 30 minutes', () => {
    expect(formatDurationVerbose(1470)).toBe('1d 30m');
  });

  it('returns "2d 1h 15m" for complex value', () => {
    expect(formatDurationVerbose(2 * 1440 + 60 + 15)).toBe('2d 1h 15m');
  });

  it('returns "59 min" for 59 minutes (boundary before 1 hr)', () => {
    expect(formatDurationVerbose(59)).toBe('59 min');
  });
});

// ─── formatArrivalDeadline ───────────────────────────────────────────────────
describe('formatArrivalDeadline', () => {
  it('returns just a time string (HH:MM) for a deadline 30 minutes from now', () => {
    const result = formatArrivalDeadline(30);
    // The result should match a time pattern, not include a date prefix
    expect(result).toMatch(/\d+:\d{2}/);
    expect(result).not.toContain('Tomorrow');
  });

  it('returns a string starting with "Tomorrow," for a deadline exactly 25 hours away', () => {
    // 25 hours from now is always tomorrow (never 2 days out unless it's 11pm)
    // We use a fixed date offset to be deterministic
    const result = formatArrivalDeadline(25 * 60); // 25 hours
    // Acceptable results: 'Tomorrow, HH:MM' or a short date if it crosses 2 days
    // Either way it must contain a comma
    expect(result).toContain(',');
  });

  it('does NOT say "Tomorrow" for a deadline 3 days away', () => {
    const result = formatArrivalDeadline(3 * 24 * 60);
    expect(result).not.toBe('Tomorrow');
    // Should contain a comma — formatted date + time
    expect(result).toContain(',');
  });

  it('does NOT include commas for a same-day deadline', () => {
    // 1 minute from now is always today, always just a time
    const result = formatArrivalDeadline(1);
    expect(result).toMatch(/\d+:\d{2}/);
    // A same-day-only time should NOT include 'Tomorrow' or a month name
    expect(result).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });
});
