import React from 'react';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export type AlertType = 'error' | 'warning' | 'info' | 'success';

export interface CustomAlertConfig {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

export interface CustomAlertModalRef {
  show: (config: CustomAlertConfig) => void;
  hide: () => void;
}

export const customAlertRef = React.createRef<CustomAlertModalRef>();

/**
 * Drop-in custom replacement for React Native's `Alert.alert`.
 * Uses Safen's custom modal design system instead of native OS dialogs.
 */
export const customAlert = (
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: { type?: AlertType }
) => {
  // Infer type if not explicitly provided
  let inferredType: AlertType = options?.type || 'info';
  const lowerTitle = (title || '').toLowerCase();
  if (lowerTitle.includes('error') || lowerTitle.includes('fail') || lowerTitle.includes('invalid') || lowerTitle.includes('security')) {
    inferredType = 'error';
  } else if (lowerTitle.includes('warning') || lowerTitle.includes('limit') || lowerTitle.includes('not on') || lowerTitle.includes('pending') || lowerTitle.includes('missing')) {
    inferredType = 'warning';
  } else if (lowerTitle.includes('success') || lowerTitle.includes('saved') || lowerTitle.includes('sent') || lowerTitle.includes('thank')) {
    inferredType = 'success';
  }

  customAlertRef.current?.show({
    title,
    message,
    type: inferredType,
    buttons,
  });
};

