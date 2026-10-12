import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { VibeColors } from '../constants/theme';
import { VibeIcon } from './vibe-ui';

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <VibeIcon name="message" color={VibeColors.primary} size={28} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.button} onPress={onAction} activeOpacity={0.8}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 34,
    paddingHorizontal: 28,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F0E7FF',
  },
  iconWrap: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  title: {
    color: VibeColors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: VibeColors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: VibeColors.primary,
    shadowColor: '#5B5CE6',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
