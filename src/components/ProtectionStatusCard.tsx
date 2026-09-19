 import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import type { ThemeColors } from '../constants/Theme';
import { useTheme } from '../context/ThemeContext';

// expo-battery is optional — we gracefully degrade if not installed
let Battery: typeof import('expo-battery') | null = null;
try { Battery = require('expo-battery'); } catch {}

// ── Types ────────────────────────────────────────────────────────────────────
type GPSStatus   = 'on' | 'off' | 'unknown';
type NetStatus   = 'strong' | 'active' | 'none' | 'unknown';

// ── Battery visual ───────────────────────────────────────────────────────────
// Drawn with plain Views — no extra packages needed.
const BatteryIcon = ({
  level,      // 0–100
  charging,
  color,
}: {
  level: number;
  charging: boolean;
  color: string;
}) => {
  const fillColor =
    charging ? '#22C55E' :
    level <= 20 ? '#EF4444' :
    level <= 40 ? '#F59E0B' :
    '#22C55E';

  return (
    <View style={battStyles.wrapper}>
      {/* Battery body */}
      <View style={[battStyles.body, { borderColor: color }]}>
        <View
          style={[
            battStyles.fill,
            {
              width: `${level}%`,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>
      {/* Terminal nub */}
      <View style={[battStyles.nub, { backgroundColor: color }]} />
      {/* Charging bolt */}
      {charging && (
        <Ionicons
          name="flash"
          size={9}
          color="#fff"
          style={battStyles.bolt}
        />
      )}
    </View>
  );
};

const battStyles = StyleSheet.create({
  wrapper : { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  body    : { width: 22, height: 11, borderWidth: 1.5, borderRadius: 2.5, overflow: 'hidden', justifyContent: 'center' },
  fill    : { height: '100%', borderRadius: 1.5 },
  nub     : { width: 2, height: 5, borderRadius: 1, marginLeft: 1 },
  bolt    : { position: 'absolute', left: 5, top: 0 },
});

// ── Main component ───────────────────────────────────────────────────────────
export const ProtectionStatusCard = React.memo(() => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);

  const [gps,        setGps]        = useState<GPSStatus>('unknown');
  const [net,        setNet]        = useState<NetStatus>('unknown');
  const [battLevel,  setBattLevel]  = useState<number>(100);
  const [charging,   setCharging]   = useState<boolean>(false);
  const [hasBattery, setHasBattery] = useState<boolean>(!!Battery);

  const refresh = useCallback(async () => {
    // ── GPS ──────────────────────────────────────────────────────────────────
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setGps(status === 'granted' ? 'on' : 'off');
    } catch {
      setGps('unknown');
    }

    // ── Network ──────────────────────────────────────────────────────────────
    try {
      const state = await Network.getNetworkStateAsync();
      if (!state.isConnected) {
        setNet('none');
      } else if (state.type === Network.NetworkStateType.WIFI) {
        setNet('strong');
      } else if (state.type === Network.NetworkStateType.CELLULAR) {
        setNet('active');
      } else {
        setNet('active');
      }
    } catch {
      setNet('unknown');
    }

    // ── Battery ──────────────────────────────────────────────────────────────
    if (Battery) {
      try {
        const [level, state] = await Promise.all([
          Battery.getBatteryLevelAsync(),
          Battery.getBatteryStateAsync(),
        ]);
        setBattLevel(Math.round(level * 100));
        setCharging(state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL);
        setHasBattery(true);
      } catch {
        setHasBattery(false);
      }
    }
  }, []);

  // Initial load + app-foreground refresh
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // ── Derived labels ────────────────────────────────────────────────────────
  const gpsLabel   = gps === 'on' ? 'On'   : gps === 'off' ? 'Off'  : '—';
  const gpsColor   = gps === 'on' ? '#22C55E' : gps === 'off' ? '#EF4444' : colors.text.secondary;

  const netLabel   = net === 'strong' ? 'Strong' : net === 'active' ? 'Active' : net === 'none' ? 'None'  : '—';
  const netColor   = net === 'strong' ? '#22C55E' : net === 'active' ? '#F59E0B' : net === 'none' ? '#EF4444' : colors.text.secondary;

  const battColor  =
    !hasBattery ? colors.text.secondary :
    charging    ? '#22C55E' :
    battLevel <= 20 ? '#EF4444' :
    battLevel <= 40 ? '#F59E0B' :
    '#22C55E';

  const allGood = gps === 'on' && net !== 'none' && (battLevel > 20 || charging);

  return (
    <View style={styles.card}>
      {/* Subtitle only */}
      <Text style={[styles.subText, { marginBottom: 8 }]}>
        {allGood ? 'All systems active' : 'Check your signals'}
      </Text>

      {/* Status rows */}
      <View style={styles.statusGrid}>

        {/* GPS */}
        <View style={styles.statusItem}>
          <Ionicons name="location" size={14} color={gpsColor} style={styles.statusIcon} />
          <Text style={styles.statusLabel}>GPS</Text>
          <Text style={[styles.statusValue, { color: gpsColor }]}>{gpsLabel}</Text>
        </View>

        {/* Network */}
        <View style={styles.statusItem}>
          <MaterialCommunityIcons name="signal" size={14} color={netColor} style={styles.statusIcon} />
          <Text style={styles.statusLabel}>Network</Text>
          <Text style={[styles.statusValue, { color: netColor }]}>{netLabel}</Text>
        </View>

        {/* Battery */}
        <View style={styles.statusItem}>
          {hasBattery ? (
            <BatteryIcon level={battLevel} charging={charging} color={battColor} />
          ) : (
            <Ionicons name="battery-half" size={14} color={battColor} style={styles.statusIcon} />
          )}
          <Text style={styles.statusLabel}>Battery</Text>
          <Text style={[styles.statusValue, { color: battColor }]}>
            {hasBattery ? `${battLevel}%` : '—'}
          </Text>
        </View>

      </View>
    </View>
  );
});

ProtectionStatusCard.displayName = 'ProtectionStatusCard';

// ── Styles ────────────────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subText: {
    fontSize: 10,
    color: '#6B7280',
  },
  statusGrid: {
    gap: 6,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusIcon: {
    width: 16,
  },
  statusLabel: {
    fontSize: 11,
    color: '#6B7280',
    flex: 1,
  },
  statusValue: {
    fontSize: 11,
    fontWeight: '700',
  },
});