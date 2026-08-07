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
