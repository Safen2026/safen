import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Upload to Cloudinary — same approach as report media, since direct
// Supabase Storage uploads were unreliable in Expo Go.
const uploadToCloudinary = async (uri: string): Promise<string | null> => {
  try {
    const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      console.warn('Cloudinary env vars missing: EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET');
      return null;
    }

    const formData = new FormData();
    formData.append('file', { uri, type: 'image/jpeg', name: `avatar_${Date.now()}.jpg` } as any);
    formData.append('upload_preset', uploadPreset);
    // Keep avatars in their own folder so they're easy to find/manage
    // in the Cloudinary media library, separate from report media.
    formData.append('folder', 'avatars');

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData, headers: { Accept: 'application/json' } }
    );

    const data = await response.json();
    if (data.secure_url) return data.secure_url;

    console.warn('Cloudinary avatar upload failed:', data);
    return null;
  } catch (err) {
    console.warn('Cloudinary avatar upload error:', err);
    return null;
  }
};

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

      // avatar_url now stores the full Cloudinary secure_url directly,
      // so we can use it as-is (no signed/public URL lookup needed).
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

      const secureUrl = await uploadToCloudinary(localUri);
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
