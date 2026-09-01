import type { User } from '@supabase/supabase-js';

/**
 * Extracts a fallback display name for a user.
 * Prioritizes a passed profile name, then auth metadata, then email, then a default string.
 */
export function getUserDisplayName(user: User | null | undefined, profileName?: string | null): string {
  if (profileName?.trim()) {
    return profileName.trim();
  }
  
  if (!user) return 'A Safen user';

  const metadataName = (user.user_metadata?.full_name as string | undefined)?.trim()
    || (user.user_metadata?.first_name as string | undefined)?.trim();

  if (metadataName) {
    return metadataName;
  }

  const emailName = user.email?.split('@')[0]?.trim();
  if (emailName) {
    return emailName;
  }

  return 'A Safen user';
}
