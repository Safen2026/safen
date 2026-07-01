import { useState } from 'react';

export type ReportPayload = {
  category: string;
  address: string;
  details: string;
  isAnonymous: boolean;
  media?: string[];
};

export function useReport() {
  const [loading, setLoading] = useState(false);

  const submitReport = async (payload: ReportPayload): Promise<boolean> => {
    setLoading(true);

    try {
      // Yo can you replace this timeout with the actual Supabase logic, this one is just static
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setLoading(false);
      return true;
    } catch (error) {
      console.error(error);
      setLoading(false);
      return false;
    }
  };

  return { loading, submitReport };
}
