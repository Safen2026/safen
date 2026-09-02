/**
 * Tests for the pure logic inside useNotifications.
 *
 * We test the optimistic update logic (markAllRead, removeNotification) and
 * the duplicate-prevention merge in the realtime handler — all without any
 * React hooks or Supabase network calls.
 */

import type { AppNotification } from '../../src/hooks/useNotifications';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: `notif-${Math.random().toString(36).slice(2)}`,
    type: 'ping',
    title: 'Test notification',
    body: 'Test body',
    sender_name: 'Alice',
    sender_id: 'user-abc',
    alert_id: null,
    report_id: null,
    latitude: null,
    longitude: null,
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── unreadCount derivation ───────────────────────────────────────────────────
// This mirrors the line:  notifications.filter(n => !n.is_read).length
function getUnreadCount(notifications: AppNotification[]): number {
  return notifications.filter(n => !n.is_read).length;
}

describe('unreadCount', () => {
  it('is 0 for an empty list', () => {
    expect(getUnreadCount([])).toBe(0);
  });

  it('counts only unread notifications', () => {
    const notifications = [
      makeNotification({ is_read: false }),
      makeNotification({ is_read: true }),
      makeNotification({ is_read: false }),
    ];
    expect(getUnreadCount(notifications)).toBe(2);
  });

  it('is 0 when all notifications are read', () => {
    const notifications = [
      makeNotification({ is_read: true }),
      makeNotification({ is_read: true }),
    ];
    expect(getUnreadCount(notifications)).toBe(0);
  });
});

// ─── markAllRead optimistic update ───────────────────────────────────────────
// Mirrors:  prev.map(n => ({ ...n, is_read: true }))
function optimisticMarkAllRead(notifications: AppNotification[]): AppNotification[] {
  return notifications.map(n => ({ ...n, is_read: true }));
}

describe('markAllRead (optimistic update)', () => {
  it('marks all notifications as read', () => {
    const notifications = [
      makeNotification({ is_read: false }),
      makeNotification({ is_read: false }),
    ];
    const result = optimisticMarkAllRead(notifications);
    expect(result.every(n => n.is_read)).toBe(true);
  });

  it('preserves already-read notifications', () => {
    const already = makeNotification({ is_read: true, title: 'Already read' });
    const result = optimisticMarkAllRead([already]);
    expect(result[0].is_read).toBe(true);
    expect(result[0].title).toBe('Already read');
  });

  it('does not mutate the original array', () => {
    const original = [makeNotification({ is_read: false })];
    const result = optimisticMarkAllRead(original);
    expect(original[0].is_read).toBe(false); // original unchanged
    expect(result[0].is_read).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(optimisticMarkAllRead([])).toHaveLength(0);
  });
});

// ─── removeNotification optimistic update ────────────────────────────────────
// Mirrors:  prev.filter(n => n.id !== id)
function optimisticRemove(notifications: AppNotification[], id: string): AppNotification[] {
  return notifications.filter(n => n.id !== id);
}

describe('removeNotification (optimistic update)', () => {
  it('removes the notification with the matching id', () => {
    const a = makeNotification({ id: 'notif-1' });
    const b = makeNotification({ id: 'notif-2' });
    const result = optimisticRemove([a, b], 'notif-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('notif-2');
  });

  it('is a no-op when id does not exist', () => {
    const notifications = [makeNotification({ id: 'notif-1' })];
    const result = optimisticRemove(notifications, 'notif-999');
    expect(result).toHaveLength(1);
  });

  it('handles empty list gracefully', () => {
    expect(optimisticRemove([], 'notif-1')).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const notifications = [makeNotification({ id: 'notif-1' })];
    const copy = [...notifications];
    optimisticRemove(notifications, 'notif-1');
    // original should still have its item
    expect(notifications).toHaveLength(copy.length);
  });
});

// ─── Realtime deduplication logic ────────────────────────────────────────────
// Mirrors the INSERT branch:
//   return prev.some(n => n.id === row.id) ? prev : [row, ...prev]
function mergeIncoming(
  prev: AppNotification[],
  row: AppNotification,
  eventType: 'INSERT' | 'UPDATE',
): AppNotification[] {
  if (eventType === 'UPDATE') {
    return prev.map(n => n.id === row.id ? { ...n, ...row } : n);
  }
  return prev.some(n => n.id === row.id) ? prev : [row, ...prev];
}

describe('realtime deduplication', () => {
  it('prepends a new notification to the list', () => {
    const existing = makeNotification({ id: 'old' });
    const incoming = makeNotification({ id: 'new' });
    const result = mergeIncoming([existing], incoming, 'INSERT');
    expect(result[0].id).toBe('new'); // newest first
    expect(result).toHaveLength(2);
  });

  it('does not add a duplicate notification', () => {
    const existing = makeNotification({ id: 'dupe' });
    const result = mergeIncoming([existing], existing, 'INSERT');
    expect(result).toHaveLength(1);
  });

  it('merges an UPDATE into the existing notification', () => {
    const existing = makeNotification({ id: 'notif-1', is_read: false });
    const updated = { ...existing, is_read: true };
    const result = mergeIncoming([existing], updated, 'UPDATE');
    expect(result).toHaveLength(1);
    expect(result[0].is_read).toBe(true);
  });

  it('leaves other notifications untouched on UPDATE', () => {
    const a = makeNotification({ id: 'notif-a', title: 'A' });
    const b = makeNotification({ id: 'notif-b', title: 'B' });
    const updatedA = { ...a, title: 'A Updated' };
    const result = mergeIncoming([a, b], updatedA, 'UPDATE');
    expect(result.find(n => n.id === 'notif-b')?.title).toBe('B');
  });

  it('UPDATE for a non-existent id is a no-op (list unchanged)', () => {
    const a = makeNotification({ id: 'notif-a' });
    const ghost = makeNotification({ id: 'does-not-exist' });
    const result = mergeIncoming([a], ghost, 'UPDATE');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('notif-a');
  });

  it('INSERT into an empty list prepends the single notification', () => {
    const incoming = makeNotification({ id: 'first' });
    const result = mergeIncoming([], incoming, 'INSERT');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('first');
  });

  it('INSERT does not mutate the original prev array', () => {
    const prev = [makeNotification({ id: 'old' })];
    const incoming = makeNotification({ id: 'new' });
    mergeIncoming(prev, incoming, 'INSERT');
    expect(prev).toHaveLength(1); // original unchanged
  });
});
