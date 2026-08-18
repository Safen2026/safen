import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useSession } from '../context/SessionContext';

export const useFeedback = () => {
  // Pull the session from the Water Tower (SessionContext) — free, no DB call.
  const session = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeedback = async (message: string) => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message before submitting.');
      return false;
    }

    setIsSubmitting(true);
    try {
      const userId = session?.user?.id;

      if (!userId) {
        throw new Error('You must be logged in to submit feedback.');
      }

      const { error } = await supabase
        .from('feedback')
        .insert({
          user_id: userId,
          message: message.trim(),
        });

      if (error) {
        throw error;
      }

      // The insert itself is what matters for the user — the email to
      // the team fires automatically via a Database Webhook on this
      // table, so there's nothing else to await here.
      Alert.alert('Thank you!', 'Your feedback has been sent to the team.');
      return true;
    } catch (error: unknown) {
      console.error('Error submitting feedback:', error);
      const msg = error instanceof Error ? error.message : 'Failed to submit feedback.';
      Alert.alert('Error', msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitFeedback, isSubmitting };
};
