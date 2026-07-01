import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useFeedback } from '../hooks/useFeedback';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FeedbackModal = ({ visible, onClose }: FeedbackModalProps) => {
  const { colors } = useTheme();
  const { submitFeedback, isSubmitting } = useFeedback();
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    const success = await submitFeedback(message);
    if (success) {
      setMessage('');
      onClose();
    }
  };

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, { backgroundColor: colors.white }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text.primary }]}>Send Feedback</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.description, { color: colors.text.secondary }]}>
            Found a bug or have an idea? We're listening! Let us know how we can improve SAFEN.
          </Text>

          <TextInput
            style={[styles.input, { 
              backgroundColor: colors.background, 
              color: colors.text.primary,
              borderColor: colors.border 
            }]}
            placeholder="Type your feedback here..."
            placeholderTextColor={colors.text.secondary}
            multiline
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
            editable={!isSubmitting}
          />

          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.cancelBtn, { borderColor: colors.border }]} 
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.icon.activeTab, opacity: (!message.trim() || isSubmitting) ? 0.6 : 1 }]} 
              onPress={handleSubmit}
              disabled={!message.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.submitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    height: 150,
    fontSize: 16,
    marginBottom: 24,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  }
});
