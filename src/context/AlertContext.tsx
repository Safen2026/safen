/**
 * AlertContext.tsx
 *
 * Provides a single shared instance of useAlert to the entire app.
 *
 * Without this, SOSButton and QuickActions each call useAlert() independently,
 * giving them separate activeAlert states. The idempotency guard in triggerAlert
 * only works if every caller reads from the same state — which requires sharing
 * one hook instance via context.
 */

import React, { createContext, useContext } from 'react';
import { useAlert } from '../hooks/useAlert';
import type { ActiveAlert, AlertType, AlertResult } from '../hooks/useAlert';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlertContextValue {
  loading: boolean;
  loadingMessage: string | null;
  activeAlert: ActiveAlert | null;
  triggerAlert: (type: AlertType, description?: string) => Promise<AlertResult>;
  cancelAlert: () => Promise<boolean>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const alert = useAlert();

  return (
    <AlertContext.Provider value={alert}>
      {children}
    </AlertContext.Provider>
  );
};

// ── Consumer hook ─────────────────────────────────────────────────────────────

export const useAlertContext = (): AlertContextValue => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlertContext must be used within an AlertProvider');
  }
  return context;
};
