import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons, Entypo } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const AIRiskCard = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const MOCK_SCENARIOS = useMemo(() => [
    {
      risk: "Low Risk",
      color: colors.status.safeText,
      bgColor: colors.status.safeBackground,
      icon: "shield-check-outline",
      message: "You are on a well-mapped, active route. No immediate environmental risks detected."
    },
    {
      risk: "Caution",
      color: colors.status.warningText,
      bgColor: colors.status.warningBackground,
      icon: "alert-circle-outline",
      message: "Late night walk detected. It is recommended to stick to main roads and avoid unlit alleys."
    },
    {
      risk: "High Alert",
      color: colors.status.alertText,
      bgColor: colors.status.alertBackground,
      icon: "shield-alert-outline",
      message: "You have entered a secluded area with low lighting. Keep your phone accessible."
    }
  ], [colors]);

  const [expanded, setExpanded] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scenario, setScenario] = useState(MOCK_SCENARIOS[0]);

  const handlePress = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    setIsScanning(true);

    // Simulate AI network request / data gathering delay
    setTimeout(() => {
      // Pick a random scenario to demonstrate the dynamic contextual awareness
      const randomIdx = Math.floor(Math.random() * MOCK_SCENARIOS.length);
      setScenario(MOCK_SCENARIOS[randomIdx]);
      setIsScanning(false);
    }, 2500);
  };

  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.8} onPress={handlePress}>
      <View style={styles.header}>
        <View style={[
          styles.iconContainer, 
          { backgroundColor: expanded && !isScanning ? scenario.bgColor : colors.status.safeBackground }
        ]}>
          {isScanning ? (
            <ActivityIndicator color={colors.status.safeText} size="small" />
          ) : (
            <MaterialCommunityIcons 
              // @ts-ignore - dynamic icon name
              name={expanded ? scenario.icon : "shield-search"} 
              size={24} 
              color={expanded ? scenario.color : colors.status.safeText} 
            />
          )}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.label}>AI SITUATIONAL AWARENESS</Text>
          <Text style={[
            styles.statusText, 
            expanded && !isScanning && { color: scenario.color }
          ]}>
            {isScanning ? "Scanning environment..." : expanded ? `Status: ${scenario.risk}` : "Tap to scan surroundings"}
          </Text>
        </View>
        <Entypo name={expanded ? "chevron-up" : "chevron-down"} size={24} color={colors.text.secondary} />
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          {isScanning ? (
            <View style={styles.scanningBox}>
              <Text style={styles.scanningText}>• Checking time and movement speed...</Text>
              <Text style={styles.scanningText}>• Verifying route lighting & density...</Text>
              <Text style={styles.scanningText}>• Analyzing ambient context...</Text>
            </View>
          ) : (
            <View style={styles.resultBox}>
              <Text style={[styles.resultText, { color: scenario.color }]}>
                {scenario.message}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text.secondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.status.safeText,
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scanningBox: {
    paddingVertical: 8,
  },
  scanningText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  resultBox: {
    paddingVertical: 8,
  },
  resultText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
});
