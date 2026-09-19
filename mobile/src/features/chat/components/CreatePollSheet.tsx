import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';

const MAX_OPTIONS = 6;

const DEADLINES: { label: string; hours: number | null }[] = [
  { label: 'No deadline', hours: null },
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
];

// Bottom sheet where a Host/Co-host writes a poll for the team chat. The
// server (fn_create_chat_poll) re-checks the role and the 2-6 option rule.
export function CreatePollSheet({
  visible,
  isPosting,
  onClose,
  onPost,
}: {
  visible: boolean;
  isPosting: boolean;
  onClose: () => void;
  onPost: (poll: { question: string; options: string[]; closesAt: string | null }) => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [deadlineHours, setDeadlineHours] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setDeadlineHours(null);
    setError(undefined);
  };

  const handlePost = () => {
    const cleaned = Array.from(new Set(options.map((o) => o.trim()).filter(Boolean)));
    if (question.trim().length < 3) {
      setError('Write the question first (at least 3 characters).');
      return;
    }
    if (cleaned.length < 2) {
      setError('Add at least two different options.');
      return;
    }
    setError(undefined);
    onPost({
      question: question.trim(),
      options: cleaned,
      closesAt: deadlineHours ? new Date(Date.now() + deadlineHours * 3600_000).toISOString() : null,
    });
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <Text style={styles.title}>Create a poll</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <TextField
              label="Question"
              placeholder="e.g. Who's in for Saturday 7 PM?"
              value={question}
              onChangeText={setQuestion}
              maxLength={200}
            />
            <Text style={styles.label}>Options (single choice)</Text>
            {options.map((value, index) => (
              <View key={index} style={styles.optionRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    placeholder={`Option ${index + 1}`}
                    value={value}
                    maxLength={80}
                    onChangeText={(v) => setOptions((prev) => prev.map((o, i) => (i === index ? v : o)))}
                  />
                </View>
                {options.length > 2 && (
                  <Pressable onPress={() => setOptions((prev) => prev.filter((_, i) => i !== index))} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            ))}
            {options.length < MAX_OPTIONS && (
              <Pressable onPress={() => setOptions((prev) => [...prev, ''])} style={styles.addOption}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={styles.addOptionText}>Add option</Text>
              </Pressable>
            )}

            <Text style={styles.label}>Voting closes</Text>
            <View style={styles.chips}>
              {DEADLINES.map((d) => (
                <Pressable
                  key={d.label}
                  onPress={() => setDeadlineHours(d.hours)}
                  style={[styles.chip, deadlineHours === d.hours && styles.chipActive]}
                >
                  <Text style={[styles.chipText, deadlineHours === d.hours && styles.chipTextActive]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <View style={{ marginTop: spacing.md }}>
            <Button title="Post poll to team" iconLeft="bar-chart-outline" onPress={handlePost} loading={isPosting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  addOption: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
  addOptionText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
  error: { marginTop: spacing.md, fontSize: 12, fontWeight: '700', color: colors.danger },
}));
