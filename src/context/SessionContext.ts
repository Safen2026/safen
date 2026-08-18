import { createContext, useContext } from 'react';
import { Session } from '@supabase/supabase-js';

// Shared session context — available anywhere in the app via useContext(SessionContext)
export const SessionContext = createContext<Session | null>(null);

export const useSession = () => useContext(SessionContext);