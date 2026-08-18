/**
 * Utility functions for formatting dates and times across the app.
 */

/**
 * Returns a human-readable "time ago" string from an ISO timestamp.
 * Example: "Just now", "5 mins ago", "2 days ago"
 *
 * @param iso - The ISO date string to parse
 * @returns A formatted relative time string
 */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
