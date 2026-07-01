import { useState } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';

export type AlertType = 'sos' | 'medical' | 'police' | 'fire';

export type ActiveAlert = {
  id: string;
  type: AlertType;
};

export function useAlert() {
  const [loading, setLoading] = useState(false);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);

  const getLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  };

  const triggerAlert = async (type: AlertType): Promise<boolean> => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return false; }

    // Fire the alert immediately for instant user feedback
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id: user.id,
        type,
        status: 'active',
      })
      .select('id')
      .single();

    setLoading(false);
    if (error || !data) return false;

    setActiveAlert({ id: data.id, type });

    // Fetch and update location in the background so it doesn't block the UI
    (async () => {
      const coords = await getLocation();
      if (coords) {
        await supabase
          .from('alerts')
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude,
          })
          .eq('id', data.id);
      }
    })();

    return true;
  };

  const cancelAlert = async (): Promise<boolean> => {
    if (!activeAlert) return false;
    setLoading(true);

    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', activeAlert.id);

    setLoading(false);
    if (error) return false;

    setActiveAlert(null);
    return true;
  };

  return { loading, activeAlert, triggerAlert, cancelAlert };
}