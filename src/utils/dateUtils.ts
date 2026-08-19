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

/**
 * Formats an ISO string based on its group header.
 * e.g., for 'Today' -> '2:30 PM'
 * e.g., for 'Yesterday' -> 'Yesterday, 2:30 PM'
 */
export function formatGroupedTime(isoString: string, groupTitle: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  // Prevent invalid date errors
  if (isNaN(d.getTime())) return '';

  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  
  if (groupTitle === 'Today') return timeStr;
  if (groupTitle === 'Yesterday' || groupTitle === '2 Days Ago') return `${groupTitle}, ${timeStr}`;
  return timeStr; // For specific dates, we just return time since date is in the group header
}

/**
 * Formats a raw number of seconds into a standard "MM:SS" duration string.
 * e.g., for 65 -> '01:05'
 *
 * @param seconds - The raw duration in seconds
 * @returns A formatted "MM:SS" string
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins.toString().padStart(2, '0')}:${secs}`;
}

/**
 * Formats a duration in minutes into a human-readable verbose string.
 * e.g., 90 -> "1h 30m", 300 -> "5 hrs", 1440 -> "1d"
 *
 * @param minutes - The total minutes
 * @returns A formatted verbose string
 */
export function formatDurationVerbose(minutes: number): string {
  const days = Math.floor(minutes / (24 * 60));
  const remainingMins = minutes % (24 * 60);
  const hrs = Math.floor(remainingMins / 60);
  const minsRemaining = remainingMins % 60;
  
  if (days > 0) {
    let str = `${days}d`;
    if (hrs > 0) str += ` ${hrs}h`;
    if (minsRemaining > 0) str += ` ${minsRemaining}m`;
    return str;
  }

  if (hrs > 0 && minsRemaining > 0) return `${hrs}h ${minsRemaining}m`;
  if (hrs > 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${minsRemaining} min`;
}

/**
 * Computes an arrival deadline string based on a duration from now.
 * e.g., "1:45 PM" or "Tomorrow, 2:45 PM"
 *
 * @param minutesFromNow - Duration in minutes from the current time
 * @returns A formatted deadline string
 */
export function formatArrivalDeadline(minutesFromNow: number): string {
  const deadline = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const isToday = new Date().toDateString() === deadline.toDateString();
  
  const timeStr = deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return timeStr;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.toDateString() === deadline.toDateString()) {
    return `Tomorrow, ${timeStr}`;
  }
  
  const dateStr = deadline.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr}, ${timeStr}`;
}
