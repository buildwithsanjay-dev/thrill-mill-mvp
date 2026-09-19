import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';

// App-wide replacement for React Native's `Alert.alert` (the plain Android
// system dialog the owner flagged). Same call shape on purpose —
// showAlert(title, message?, buttons?, options?) — so every existing call
// site swaps over mechanically, plus an optional `variant` that drives the
// animated icon. When no variant is passed one is inferred from the title
// and button styles (see inferVariant), so "Could not …" reads as an error
// and "Team created" as a success without touching each call site.

export type DialogVariant = 'success' | 'error' | 'warning' | 'info';

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type DialogState = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  variant: DialogVariant;
};

type ShowOptions = { variant?: DialogVariant };

let counter = 0;
let queue: DialogState[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function inferVariant(title: string, buttons: DialogButton[]): DialogVariant {
  if (buttons.some((b) => b.style === 'destructive')) return 'warning';
  const t = title.toLowerCase();
  if (/(could not|couldn't|can't|cannot|failed|error|not allowed|unavailable|expired|denied|invalid|required|too many|already|no longer)/.test(t)) {
    return 'error';
  }
  if (/(created|success|confirmed|activated|submitted|saved|sent|updated|cancelled|canceled|archived|done|thank|welcome|deleted|removed|added|posted)/.test(t)) {
    return 'success';
  }
  if (/(sure|confirm|discard|leave|delete|remove|archive)/.test(t)) return 'warning';
  return 'info';
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: ShowOptions
): void {
  const resolvedButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  queue = [
    ...queue,
    {
      id: ++counter,
      title,
      message,
      buttons: resolvedButtons,
      variant: options?.variant ?? inferVariant(title, resolvedButtons),
    },
  ];
  emit();
}

function dismissCurrent() {
  queue = queue.slice(1);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return queue;
}

// Calm, brand-consistent tints (no neon): success is a muted green, info uses
// the brand teal. Built per render so it follows light/dark.
function variantStyle(variant: DialogVariant): { icon: keyof typeof Ionicons.glyphMap; tint: string; soft: string } {
  switch (variant) {
    case 'success':
      return { icon: 'checkmark', tint: colors.success, soft: colors.successSoft };
    case 'error':
      return { icon: 'close', tint: colors.danger, soft: colors.dangerSoft };
    case 'warning':
      return { icon: 'alert', tint: colors.warning, soft: colors.warningSoft };
    default:
      return { icon: 'information', tint: colors.primary, soft: colors.primarySoft };
  }
}

// Mounted once in the root layout. Renders the head of the queue so two
// dialogs fired back-to-back show one after the other instead of stacking.
export function DialogHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)[0];
  if (!current) return null;
  return <DialogCard key={current.id} dialog={current} />;
}

function DialogCard({ dialog }: { dialog: DialogState }) {
  const [backdrop] = useState(() => new Animated.Value(0));
  const [card] = useState(() => new Animated.Value(0));
  const [iconPop] = useState(() => new Animated.Value(0));
  const [wiggle] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));

  const style = variantStyle(dialog.variant);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(card, { toValue: 1, damping: 14, stiffness: 180, mass: 0.9, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(140),
        Animated.spring(iconPop, { toValue: 1, damping: 9, stiffness: 190, useNativeDriver: true }),
      ]),
    ]).start(() => {
      if (dialog.variant === 'error' || dialog.variant === 'warning') {
        Animated.sequence([
          Animated.timing(wiggle, { toValue: 1, duration: 70, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: -1, duration: 110, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: 1, duration: 110, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(wiggle, { toValue: 0, duration: 70, easing: Easing.linear, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.loop(
          Animated.sequence([
            Animated.timing(ring, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        ).start();
      }
    });
    // Animation values are stable refs; run once per dialog instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(
    (button?: DialogButton) => {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(card, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start(() => {
        dismissCurrent();
        button?.onPress?.();
      });
    },
    [backdrop, card]
  );

  const cancelButton = dialog.buttons.find((b) => b.style === 'cancel');
  const stackButtons = dialog.buttons.length > 2;

  const cardScale = card.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const iconScale = iconPop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const iconRotate = wiggle.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-9deg', '0deg', '9deg'] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => close(cancelButton)}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (cancelButton ? close(cancelButton) : undefined)} />
        <Animated.View style={[styles.card, { opacity: card, transform: [{ scale: cardScale }] }]}>
          <View style={styles.iconStage}>
            <Animated.View
              style={[
                styles.ring,
                { backgroundColor: style.tint, opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
            <Animated.View
              style={[
                styles.iconCircle,
                { backgroundColor: style.soft, transform: [{ scale: iconScale }, { rotate: iconRotate }] },
              ]}
            >
              <View style={[styles.iconInner, { backgroundColor: style.tint }]}>
                <Ionicons name={style.icon} size={30} color="#FFFFFF" />
              </View>
            </Animated.View>
          </View>

          <Text style={styles.title}>{dialog.title}</Text>
          {!!dialog.message && <Text style={styles.message}>{dialog.message}</Text>}

          <View style={[styles.buttons, stackButtons && styles.buttonsStacked]}>
            {dialog.buttons.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDestructive = b.style === 'destructive';
              const isPrimary = !isCancel && !isDestructive;
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => close(b)}
                  style={({ pressed }) => [
                    styles.button,
                    !stackButtons && styles.buttonFlex,
                    isCancel && styles.buttonGhost,
                    isDestructive && styles.buttonDanger,
                    isPrimary && { backgroundColor: style.tint },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.buttonText, isCancel && styles.buttonTextGhost]}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg + 6,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  iconStage: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  ring: { position: 'absolute', width: 64, height: 64, borderRadius: 32 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  iconInner: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  message: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, width: '100%' },
  buttonsStacked: { flexDirection: 'column' },
  button: {
    height: 46,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonFlex: { flex: 1 },
  buttonGhost: { backgroundColor: colors.surfaceAlt },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  buttonTextGhost: { color: colors.text },
}));
