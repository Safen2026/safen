/**
 * Lightweight in-process event bus.
 * Used to let the notification realtime listener (in useNotifications)
 * signal the contacts screen to refetch when a contact request is resolved.
 */
type Listener = () => void;

const contactRefreshListeners = new Set<Listener>();

export const contactEvents = {
  /** Subscribe to contact-refresh events. Returns an unsubscribe function. */
  onRefresh: (cb: Listener): (() => void) => {
    contactRefreshListeners.add(cb);
    return () => contactRefreshListeners.delete(cb);
  },

  /** Fire from wherever the accepted/declined notification arrives. */
  emitRefresh: (): void => {
    contactRefreshListeners.forEach(cb => cb());
  },
};

// ─── Trip Share Event Bus ─────────────────────────────────────────────────────
// Lets the contacts tab tell the map tab to open the Share Trip modal
// for a specific contact, without needing a global store.

export interface TripSharePayload {
  contactUserId: string;
  contactName: string;
  contactId: string;
}

type TripListener = (payload: TripSharePayload) => void;
const tripShareListeners = new Set<TripListener>();

export const tripEvents = {
  onShareTrip: (cb: TripListener): (() => void) => {
    tripShareListeners.add(cb);
    return () => tripShareListeners.delete(cb);
  },
  emitShareTrip: (payload: TripSharePayload): void => {
    tripShareListeners.forEach(cb => cb(payload));
  },
};
