import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { TopToastRef } from '../components/TopToast';

export const toastRef = React.createRef<TopToastRef>();

interface ToastOptions {
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  duration?: number;
}

export const showToast = (options: ToastOptions) => {
  toastRef.current?.show(options);
};
