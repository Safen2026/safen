/**
 * Tests for src/lib/events.ts — the lightweight in-process event bus.
 *
 * Both buses (contactEvents and tripEvents) are tested for:
 *   - subscribe fires the callback on emit
 *   - multiple subscribers all receive the event
 *   - the unsubscribe function removes only that subscriber
 *   - emitting with no subscribers doesn't throw
 *   - the two buses are fully isolated from each other
 */

import { contactEvents, tripEvents, type TripSharePayload } from '../../src/lib/events';

// ─── Helper ───────────────────────────────────────────────────────────────────
const makeTripPayload = (overrides: Partial<TripSharePayload> = {}): TripSharePayload => ({
  contactUserId: 'user-abc',
  contactName: 'Alice',
  contactId: 'contact-123',
  avatarUrl: null,
  ...overrides,
});

// Reset listeners between tests by unsubscribing everything
// (The module uses a module-level Set, so we need to be careful with isolation)
// We achieve isolation by always unsubscribing returned cleanup functions.

// ─── contactEvents ────────────────────────────────────────────────────────────
describe('contactEvents', () => {
  it('fires a subscribed callback on emitRefresh', () => {
    const cb = jest.fn();
    const unsub = contactEvents.onRefresh(cb);
    contactEvents.emitRefresh();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('fires all subscribed callbacks on emitRefresh', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const unsub1 = contactEvents.onRefresh(cb1);
    const unsub2 = contactEvents.onRefresh(cb2);
    contactEvents.emitRefresh();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it('does not fire after unsubscribing', () => {
    const cb = jest.fn();
    const unsub = contactEvents.onRefresh(cb);
    unsub();
    contactEvents.emitRefresh();
    expect(cb).not.toHaveBeenCalled();
  });

  it('only removes the specific subscriber, not others', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const unsub1 = contactEvents.onRefresh(cb1);
    const unsub2 = contactEvents.onRefresh(cb2);
    unsub1(); // remove cb1 only
    contactEvents.emitRefresh();
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
    unsub2();
  });

  it('emitting with no subscribers does not throw', () => {
    expect(() => contactEvents.emitRefresh()).not.toThrow();
  });

  it('can subscribe the same callback multiple times', () => {
    const cb = jest.fn();
    const unsub1 = contactEvents.onRefresh(cb);
    const unsub2 = contactEvents.onRefresh(cb);
    contactEvents.emitRefresh();
    // A Set deduplicates the same reference, so cb fires once
    expect(cb).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it('onRefresh returns an unsubscribe function', () => {
    const cb = jest.fn();
    const result = contactEvents.onRefresh(cb);
    expect(typeof result).toBe('function');
    result(); // cleanup
  });
});

// ─── tripEvents ───────────────────────────────────────────────────────────────
describe('tripEvents', () => {
  it('fires a subscribed callback with the payload on emitShareTrip', () => {
    const cb = jest.fn();
    const unsub = tripEvents.onShareTrip(cb);
    const payload = makeTripPayload();
    tripEvents.emitShareTrip(payload);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(payload);
    unsub();
  });

  it('passes the exact payload through without mutation', () => {
    const cb = jest.fn();
    const unsub = tripEvents.onShareTrip(cb);
    const payload = makeTripPayload({ contactName: 'Bob', contactUserId: 'user-bob' });
    tripEvents.emitShareTrip(payload);
    expect(cb.mock.calls[0][0]).toStrictEqual(payload);
    unsub();
  });

  it('fires all subscribers with the payload', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const unsub1 = tripEvents.onShareTrip(cb1);
    const unsub2 = tripEvents.onShareTrip(cb2);
    const payload = makeTripPayload();
    tripEvents.emitShareTrip(payload);
    expect(cb1).toHaveBeenCalledWith(payload);
    expect(cb2).toHaveBeenCalledWith(payload);
    unsub1();
    unsub2();
  });

  it('does not fire after unsubscribing', () => {
    const cb = jest.fn();
    const unsub = tripEvents.onShareTrip(cb);
    unsub();
    tripEvents.emitShareTrip(makeTripPayload());
    expect(cb).not.toHaveBeenCalled();
  });

  it('emitting with no subscribers does not throw', () => {
    expect(() => tripEvents.emitShareTrip(makeTripPayload())).not.toThrow();
  });

  // ── Isolation: contactEvents must not cross-fire tripEvents ────────────────
  it('contactEvents.emitRefresh does NOT fire tripEvents subscribers', () => {
    const tripCb = jest.fn();
    const unsub = tripEvents.onShareTrip(tripCb);
    contactEvents.emitRefresh();
    expect(tripCb).not.toHaveBeenCalled();
    unsub();
  });

  it('tripEvents.emitShareTrip does NOT fire contactEvents subscribers', () => {
    const contactCb = jest.fn();
    const unsub = contactEvents.onRefresh(contactCb);
    tripEvents.emitShareTrip(makeTripPayload());
    expect(contactCb).not.toHaveBeenCalled();
    unsub();
  });
});
