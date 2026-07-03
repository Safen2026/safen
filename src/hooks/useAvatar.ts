import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

      if (data?.avatar_url) {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(data.avatar_url);
        setAvatarUrl(`${urlData.publicUrl}?t=${Date.now()}`);
      }
    } catch (err) {
      console.warn('loadAvatar error:', err);
    }
  };

  const uploadAvatar = async (localUri: string): Promise<boolean> => {
    setUploading(true);
    try {
      // Correctly get session for the access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.warn('No session found');
        setUploading(false);
        return false;
      }
      

      const userId = session.user.id;
      const storagePath = `${userId}/avatar.jpg`;
      const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/avatars/${storagePath}`;

      // FormData + fetch is the most reliable upload method in Expo Go
      const formData = new FormData();
      formData.append('file', {
        uri: localUri,
        name: 'avatar.jpg',
        type: 'image/jpeg',
      } as any);

     const response = await fetch(uploadUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'x-upsert': 'true',
  },
  body: formData,
});

const responseText = await response.text();
console.log('=== AVATAR UPLOAD ===');
console.log('URL:', uploadUrl);
console.log('Status:', response.status);
console.log('Response:', responseText);
console.log('Session exists:', !!session);
console.log('Access token exists:', !!session.access_token);

if (!response.ok) {
  setUploading(false);
  return false;
}
      

      // Save the storage path to the profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: storagePath })
        .eq('id', userId);

      if (updateError) {
        console.warn('Profile update failed:', updateError.message);
        setUploading(false);
        return false;
      }

      // Refresh the displayed URL with cache bust
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(storagePath);
      setAvatarUrl(`${urlData.publicUrl}?t=${Date.now()}`);

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