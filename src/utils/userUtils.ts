import type { User } from '@supabase/supabase-js';

/**
 * Extracts a fallback display name for a user.
 * Prioritizes a passed profile name, then auth metadata, then email, then a default string.
 */
export function getUserDisplayName(user: User | null | undefined, profileName?: string | null): string {
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim();
  }
  
  if (!user) return 'A Safen user';

  const rawFull = user.user_metadata?.full_name;
  const rawFirst = user.user_metadata?.first_name;

  const fullName = typeof rawFull === 'string' ? rawFull.trim() : '';
  const firstName = typeof rawFirst === 'string' ? rawFirst.trim() : '';

  const metadataName = fullName || firstName;
  if (metadataName) {
    return metadataName;
  }

  const email = typeof user.email === 'string' ? user.email : '';
  const emailName = email.split('@')[0]?.trim();
  if (emailName) {
    return emailName;
  }

  return 'A Safen user';
}
