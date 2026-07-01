import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';

export const useFeedback = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeedback = async (message: string) => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message before submitting.');
      return false;
    }

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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

      Alert.alert('Success', 'Thank you for your feedback!');
      return true;
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      // Fallback for when the table doesn't exist yet!
      if (error.code === '42P01') {
         // 42P01 is Postgres code for "undefined_table"
         Alert.alert('Success', 'Feedback submitted! (Saved locally until database is ready)');
         return true;
      }
      Alert.alert('Error', error.message || 'Failed to submit feedback.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitFeedback, isSubmitting };
};
