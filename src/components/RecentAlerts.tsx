import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const RecentAlerts = () => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Recent Safety Alerts</Text>
        <TouchableOpacity>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.alertCard}>
        <View style={styles.alertIcon}>
          <MaterialCommunityIcons name="traffic-light" size={22} color={colors.primary} />
        </View>
        <View style={styles.alertContent}>
          <Text style={styles.alertTitle}>Road obstruction on 3rd Mainland Bridge</Text>
          <Text style={styles.alertTime}>12 mins ago • Traffic Control</Text>
        </View>
        <MaterialCommunityIcons name="check-decagram-outline" size={24} color={colors.status.safeText} />
      </View>

      <View style={styles.alertCard}>
        <View style={styles.alertIcon}>
          <MaterialCommunityIcons name="bullhorn-outline" size={22} color={colors.icon.police} />
        </View>
        <View style={styles.alertContent}>
          <Text style={styles.alertTitle}>Scheduled power outage in Victoria Island</Text>
          <Text style={styles.alertTime}>2 hours ago • Public Utility</Text>
        </View>
        <MaterialCommunityIcons name="check-decagram-outline" size={24} color={colors.status.safeText} />
      </View>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.status.safeText,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  alertIcon: {
    marginRight: 12,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  alertContent: {
    flex: 1,
    paddingRight: 10,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: 4,
    lineHeight: 20,
  },
  alertTime: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
