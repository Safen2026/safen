/**
 * Tests for permission classification and community alert banner logic.
 */

// Mirrors the permission classification logic in PermissionWarningBanner
export type MissingPermission =
  | 'both_critical'
  | 'location'
  | 'notifications'
  | 'safety_and_evidence'
  | 'evidence_both'
  | 'camera'
  | 'microphone';

export function classifyMissingPermissions(
  locGranted: boolean,
  notifGranted: boolean,
  camGranted: boolean,
  micGranted: boolean
): MissingPermission | null {
  if (!locGranted && !notifGranted) {
    return 'both_critical';
  } else if (!locGranted) {
    return 'location';
  } else if (!notifGranted && (!camGranted || !micGranted)) {
    return 'safety_and_evidence';
  } else if (!notifGranted) {
    return 'notifications';
  } else if (!camGranted && !micGranted) {
    return 'evidence_both';
  } else if (!camGranted) {
    return 'camera';
  } else if (!micGranted) {
    return 'microphone';
  } else {
    return null;
  }
}

// Mirrors distance formatting in CommunityAlertBanner
export function formatApproxDistance(metres: number): string {
  if (metres < 1000) return `~${Math.round(metres)}m away`;
  return `~${(metres / 1000).toFixed(1)}km away`;
}

// Mirrors active community alert selection
export interface MockNotification {
  id: string;
  is_community_broadcast: boolean;
  alert_id: string | null;
  title: string;
  created_at: string;
}

export function findActiveCommunityAlert(
  notifications: MockNotification[],
  dismissedIds: string[],
  now: number = Date.now()
): MockNotification | null {
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  return (
    notifications.find((n) => {
      if (!n.is_community_broadcast || !n.alert_id) return false;
      if (n.title.startsWith('✅')) return false;
      if (dismissedIds.includes(n.alert_id)) return false;
      const alertTime = new Date(n.created_at).getTime();
      if (isNaN(alertTime) || now - alertTime > TWO_HOURS_MS) return false;
      return true;
    }) ?? null
  );
}

describe('classifyMissingPermissions', () => {
  it('returns both_critical when both location and notifications are denied', () => {
    expect(classifyMissingPermissions(false, false, true, true)).toBe('both_critical');
  });

  it('returns location when location is denied but notifications are granted', () => {
    expect(classifyMissingPermissions(false, true, true, true)).toBe('location');
  });

  it('returns safety_and_evidence when notifications and evidence permissions are denied', () => {
    expect(classifyMissingPermissions(true, false, false, true)).toBe('safety_and_evidence');
    expect(classifyMissingPermissions(true, false, true, false)).toBe('safety_and_evidence');
    expect(classifyMissingPermissions(true, false, false, false)).toBe('safety_and_evidence');
  });

  it('returns notifications when only notifications are denied', () => {
    expect(classifyMissingPermissions(true, false, true, true)).toBe('notifications');
  });

  it('returns evidence_both when location & notifications granted but camera & mic denied', () => {
    expect(classifyMissingPermissions(true, true, false, false)).toBe('evidence_both');
  });

  it('returns camera when only camera is denied', () => {
    expect(classifyMissingPermissions(true, true, false, true)).toBe('camera');
  });

  it('returns microphone when only microphone is denied', () => {
    expect(classifyMissingPermissions(true, true, true, false)).toBe('microphone');
  });

  it('returns null when all 4 permissions are granted', () => {
    expect(classifyMissingPermissions(true, true, true, true)).toBeNull();
  });
});

describe('formatApproxDistance', () => {
  it('formats distances under 1000m with meters', () => {
    expect(formatApproxDistance(450)).toBe('~450m away');
    expect(formatApproxDistance(50.4)).toBe('~50m away');
  });

  it('formats distances 1000m and above with kilometers', () => {
    expect(formatApproxDistance(1200)).toBe('~1.2km away');
    expect(formatApproxDistance(3500)).toBe('~3.5km away');
  });
});

describe('findActiveCommunityAlert', () => {
  const now = Date.now();

  it('returns the active community alert if within 2 hours', () => {
    const notifs: MockNotification[] = [
      {
        id: '1',
        is_community_broadcast: true,
        alert_id: 'alert-123',
        title: 'Community SOS Alert',
        created_at: new Date(now - 10 * 60 * 1000).toISOString(),
      },
    ];
    const result = findActiveCommunityAlert(notifs, [], now);
    expect(result?.alert_id).toBe('alert-123');
  });

  it('ignores alerts that are not community broadcasts', () => {
    const notifs: MockNotification[] = [
      {
        id: '1',
        is_community_broadcast: false,
        alert_id: 'alert-123',
        title: 'Personal SOS Alert',
        created_at: new Date(now - 10 * 60 * 1000).toISOString(),
      },
    ];
    expect(findActiveCommunityAlert(notifs, [], now)).toBeNull();
  });

  it('ignores cancelled/resolved alerts starting with checkmark', () => {
    const notifs: MockNotification[] = [
      {
        id: '1',
        is_community_broadcast: true,
        alert_id: 'alert-123',
        title: '✅ SOS Resolved',
        created_at: new Date(now - 10 * 60 * 1000).toISOString(),
      },
    ];
    expect(findActiveCommunityAlert(notifs, [], now)).toBeNull();
  });

  it('ignores dismissed alert IDs', () => {
    const notifs: MockNotification[] = [
      {
        id: '1',
        is_community_broadcast: true,
        alert_id: 'alert-dismissed',
        title: 'Community SOS Alert',
        created_at: new Date(now - 10 * 60 * 1000).toISOString(),
      },
    ];
    expect(findActiveCommunityAlert(notifs, ['alert-dismissed'], now)).toBeNull();
  });

  it('ignores alerts older than 2 hours', () => {
    const notifs: MockNotification[] = [
      {
        id: '1',
        is_community_broadcast: true,
        alert_id: 'alert-old',
        title: 'Community SOS Alert',
        created_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      },
    ];
    expect(findActiveCommunityAlert(notifs, [], now)).toBeNull();
  });
});
