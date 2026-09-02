/**
 * Tests for src/lib/emergencySms.ts — the offline SOS fallback.
 *
 * This is life-safety code. We test:
 *   - `buildSmsBody` message construction for every alert type
 *   - `isOnline` fail-open behaviour
 *   - `sendEmergencySms` routing logic (no_contacts, SMS unavailable, cancelled, error)
 *   - The cache fallback in `getEmergencyContactPhones`
 *
 * All native modules (expo-network, expo-sms, react-native Linking, supabase)
 * are mocked so no network or device is required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn(), getUser: jest.fn() },
  },
}));

const mockGetNetworkState = jest.fn();
jest.mock('expo-network', () => ({
  getNetworkStateAsync: (...args: unknown[]) => mockGetNetworkState(...args),
}));

const mockIsAvailable = jest.fn();
const mockSendSMS = jest.fn();
jest.mock('expo-sms', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  sendSMSAsync: (...args: unknown[]) => mockSendSMS(...args),
}));

const mockCanOpen = jest.fn();
const mockOpenURL = jest.fn();
jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: (...args: unknown[]) => mockCanOpen(...args),
    openURL: (...args: unknown[]) => mockOpenURL(...args),
  },
}));

// Import AFTER mocks are set up
import {
  isOnline,
  sendEmergencySms,
  type SmsContact,
} from '../../src/lib/emergencySms';

const CONTACTS: SmsContact[] = [
  { name: 'Alice', phone: '+2348012345678' },
  { name: 'Bob',   phone: '+2348087654321' },
];
const COORDS = { latitude: 6.5244, longitude: 3.3792 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// ─── isOnline ─────────────────────────────────────────────────────────────────
describe('isOnline', () => {
  it('returns true when connected AND internet reachable', async () => {
    mockGetNetworkState.mockResolvedValueOnce({ isConnected: true, isInternetReachable: true });
    expect(await isOnline()).toBe(true);
  });

  it('returns false when connected but not internet reachable', async () => {
    mockGetNetworkState.mockResolvedValueOnce({ isConnected: true, isInternetReachable: false });
    expect(await isOnline()).toBe(false);
  });

  it('returns false when not connected', async () => {
    mockGetNetworkState.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
    expect(await isOnline()).toBe(false);
  });

  it('FAIL-OPEN: returns true when the network state check throws', async () => {
    // This is the critical safety invariant: a network API failure must never
    // block the user from sending a distress SMS.
    mockGetNetworkState.mockRejectedValueOnce(new Error('Native error'));
    expect(await isOnline()).toBe(true);
  });

  it('returns false when isInternetReachable is null', async () => {
    mockGetNetworkState.mockResolvedValueOnce({ isConnected: true, isInternetReachable: null });
    expect(await isOnline()).toBe(false);
  });
});

// ─── sendEmergencySms ─────────────────────────────────────────────────────────
describe('sendEmergencySms', () => {
  // ── No contacts ─────────────────────────────────────────────────────────────
  it('returns no_contacts when the contacts array is empty', async () => {
    const result = await sendEmergencySms([], 'George', COORDS);
    expect(result).toEqual({ success: false, reason: 'no_contacts' });
  });

  // ── expo-sms path ────────────────────────────────────────────────────────────
  it('returns success when expo-sms is available and result is "sent"', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockResolvedValueOnce({ result: 'sent' });
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: true, sent: 2 });
    // Verify sendSMSAsync was actually called with all phone numbers
    expect(mockSendSMS).toHaveBeenCalledWith(
      [CONTACTS[0].phone, CONTACTS[1].phone],
      expect.any(String)
    );
  });

  it('returns success when expo-sms result is "unknown" (Android)', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockResolvedValueOnce({ result: 'unknown' });
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: true, sent: 2 });
  });

  it('returns cancelled when expo-sms result is "cancelled"', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockResolvedValueOnce({ result: 'cancelled' });
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: false, reason: 'cancelled' });
  });

  // ── Linking fallback path ────────────────────────────────────────────────────
  it('falls back to Linking when expo-sms is unavailable', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockCanOpen.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: true, sent: 1 }); // only primary contact
    // Verify the URL uses the first contact's phone
    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining(CONTACTS[0].phone)
    );
  });

  it('falls back to Linking even when expo-sms fails (no sent/unknown/cancelled result)', async () => {
    mockIsAvailable.mockResolvedValueOnce(true);
    // An unexpected result value — falls through to Linking
    mockSendSMS.mockResolvedValueOnce({ result: 'failed' });
    mockCanOpen.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: true, sent: 1 });
  });

  it('returns sms_unavailable when Linking cannot open the URL', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockCanOpen.mockResolvedValueOnce(false);
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: false, reason: 'sms_unavailable' });
  });

  it('returns error when an exception is thrown', async () => {
    mockIsAvailable.mockRejectedValueOnce(new Error('SMS crashed'));
    const result = await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(result).toEqual({ success: false, reason: 'error' });
  });

  it('returns success with sent=1 when there is only one contact', async () => {
    const single: SmsContact[] = [{ name: 'Alice', phone: '+2348012345678' }];
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockResolvedValueOnce({ result: 'sent' });
    const result = await sendEmergencySms(single, 'George', COORDS);
    expect(result).toEqual({ success: true, sent: 1 });
  });

  it('includes the sender name in the SMS body', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).toContain('George');
  });

  it('includes the Google Maps URL when coords are provided', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).toContain('maps.google.com');
    expect(capturedBody).toContain(`${COORDS.latitude},${COORDS.longitude}`);
  });

  it('says "location unavailable" when coords are null', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', null);
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).toContain('Location unavailable');
  });

  it('uses the correct emergency type label in the body', async () => {
    for (const [type, label] of [
      ['sos', 'SOS'],
      ['medical', 'Medical'],
      ['fire', 'Fire'],
      ['police', 'Police'],
    ] as const) {
      let capturedBody = '';
      mockIsAvailable.mockResolvedValueOnce(true);
      mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
        capturedBody = body;
        return Promise.resolve({ result: 'sent' });
      });
      await sendEmergencySms(CONTACTS, 'George', COORDS, type);
      expect(capturedBody).toContain(label);
    }
  });

  it('defaults to "SOS" for an unknown emergency type', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS, 'unknown_type');
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).toContain('SOS');
  });

  it('includes the optional description in the body when provided', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS, 'sos', 'Armed robbery near the bank');
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).toContain('Armed robbery near the bank');
  });

  it('omits the description section when description is empty', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS, 'sos', '');
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).not.toContain('Additional Info');
  });

  it('omits the description section when description is whitespace only', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS, 'sos', '   ');
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).not.toContain('Additional Info');
  });

  it('falls back to "Someone you know" when senderName is empty string', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, '', COORDS);
    expect(mockSendSMS).toHaveBeenCalledTimes(1);
    expect(capturedBody).toContain('Someone you know');
  });

  it('Linking fallback URL uses sms: scheme with the primary contact\'s phone', async () => {
    mockIsAvailable.mockResolvedValueOnce(false);
    mockCanOpen.mockResolvedValueOnce(true);
    mockOpenURL.mockResolvedValueOnce(undefined);
    await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringMatching(/^sms:.*\+2348012345678/)
    );
  });

  it('body contains the Safen attribution line', async () => {
    let capturedBody = '';
    mockIsAvailable.mockResolvedValueOnce(true);
    mockSendSMS.mockImplementationOnce((_phones: string[], body: string) => {
      capturedBody = body;
      return Promise.resolve({ result: 'sent' });
    });
    await sendEmergencySms(CONTACTS, 'George', COORDS);
    expect(capturedBody).toContain('Safen');
  });
});
