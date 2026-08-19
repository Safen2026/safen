/**
 * Utility functions for string manipulation across the app.
 */

/**
 * Returns up to 2 uppercase initials from a full name.
 * e.g., "John Doe" -> "JD", "Jane" -> "J", "" -> ""
 *
 * @param name - The full name string
 * @returns Up to 2 uppercase initials
 */
export const getInitials = (name: string): string => {
  if (!name || name.trim() === '') return '';
  return name
    .trim()
    .split(/\s+/)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
