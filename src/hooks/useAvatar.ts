import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';

export function useAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadAvatar(); }, []);

  const loadAvatar = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      // avatar_url stores the full Cloudinary secure_url directly, so
      // it can be used as-is (no signed/public URL lookup needed).
      if (data?.avatar_url) {
        setAvatarUrl(data.avatar_url);
      }
    } catch (err) {
      console.warn('loadAvatar error:', err);
    }
  };

  const uploadAvatar = async (localUri: string): Promise<boolean> => {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
  };

  return { avatarUrl, uploading, uploadAvatar, reloadAvatar: loadAvatar };
}
