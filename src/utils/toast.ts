import React from 'react';
import { TopToastRef } from '../components/TopToast';

export const toastRef = React.createRef<TopToastRef>();

interface ToastOptions {
  title: string;
  subtitle?: string;
  icon?: any;
  duration?: number;
}

export const showToast = (options: ToastOptions) => {
  toastRef.current?.show(options);
};
