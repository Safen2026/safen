import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { notifyEmergencyContacts } from '../lib/notifications';

export type AlertType = 'sos' | 'medical' | 'police' | 'fire';

export type ActiveAlert = {
  id: string;
  type: AlertType;
};

export function useAlert() {
  const [loading, setLoading] = useState(false);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchActiveAlert = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('alerts')
        .select('id, type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isMounted && data) {
        setActiveAlert({ id: data.id, type: data.type as AlertType });
      }
    };
    fetchActiveAlert();
    return () => { isMounted = false; };
  }, []);

  const getLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      
      let location = await Location.getLastKnownPositionAsync();
      if (!location) {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      }
      
      if (!location) return null;
      
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (e) {
      console.warn('Location fetch failed:', e);
      return null;
    }
  };

  const triggerAlert = async (type: AlertType): Promise<boolean> => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return false; }

    // 1. Fetch location FIRST. Since we switched to getLastKnownPositionAsync, this is practically instant.
    // This completely bypasses the Supabase RLS update block, as we can just INSERT the coordinates directly.
    const coords = await getLocation();

    // 2. Fire the alert with coordinates already attached
    const { data, error } = await supabase
      .from('alerts')
      .insert({
        user_id: user.id,
        type,
        status: 'active',
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null,
      })
      .select('id')
      .single();

    setLoading(false);
    if (error || !data) return false;

    setActiveAlert({ id: data.id, type });

    // 3. Let emergency contacts know, sending the coordinates directly in the initial insert.
    notifyEmergencyContacts({ 
      type, 
      alertId: data.id,
      latitude: coords?.latitude || undefined,
      longitude: coords?.longitude || undefined
    });

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