import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import { useSession } from '../context/SessionContext';

const getAvatarCacheKey = (userId: string) => `safen_cached_avatar_url_${userId}`;

export function useAvatar() {
  // Pull the session from the Water Tower (SessionContext) — free, no DB call.
  const session = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // useCallback is necessary here because loadAvatar is a dependency of the
  // useEffect below. Without it, a new function is created every render,
  // causing the effect to re-run in an infinite loop.
  const loadAvatar = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      // avatar_url stores the full Cloudinary secure_url directly, so
      // it can be used as-is (no signed/public URL lookup needed).
      if (!error && data?.avatar_url) {
        setAvatarUrl(data.avatar_url);
        // Persist for offline use
        const cacheKey = getAvatarCacheKey(session.user.id);
        AsyncStorage.setItem(cacheKey, data.avatar_url).catch((err) => {
          console.warn('Failed to cache avatar URL:', err);
        });
      } else if (error) {
        // Offline — use the last known avatar
        const cacheKey = getAvatarCacheKey(session.user.id);
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) setAvatarUrl(cached);
      }
    } catch (err) {
      // Also try cache on an unexpected exception
      try {
        const cacheKey = getAvatarCacheKey(session.user.id);
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) setAvatarUrl(cached);
      } catch (cacheErr) {
        console.warn('Failed to load avatar from cache:', cacheErr);
      }
      console.warn('loadAvatar error:', err);
    }
  }, [session?.user?.id]); // Only re-create when the user ID changes

  // Run once on mount (and again if the user logs out then back in).
  useEffect(() => { loadAvatar(); }, [loadAvatar]);

  const uploadAvatar = useCallback(async (localUri: string): Promise<boolean> => {
    setUploading(true);
    try {
      if (!session?.user) {
        console.warn('No session found');
        setUploading(false);
        return false;
      }

      // Keep avatars in their own Cloudinary folder, separate from
      // report media, and retry/timeout-hardened via the shared helper.
      const secureUrl = await uploadToCloudinary(localUri, { folder: 'avatars' });
      if (!secureUrl) {
        setUploading(false);
        return false;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: secureUrl })
        .eq('id', session.user.id);

      if (updateError) {
        console.warn('Profile update failed:', updateError.message);
        setUploading(false);
        return false;
      }

      setAvatarUrl(secureUrl);
      setUploading(false);
      return true;
    } catch (err) {
      console.warn('uploadAvatar error:', err);
      setUploading(false);
      return false;
    }
  }, [session?.user?.id]);

  return useMemo(() => ({
    avatarUrl,
    uploading,
    uploadAvatar,
    reloadAvatar: loadAvatar,
  }), [avatarUrl, uploading, uploadAvatar, loadAvatar]);
}
