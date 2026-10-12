import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { VibeColors } from '../constants/theme';

export function LoadingScreen({
  label = 'Loading Vibe',
}: {
  label?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.loaderCard}>
        <ActivityIndicator size="large" color={VibeColors.primary} />
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VibeColors.background,
  },
  loaderCard: {
    alignItems: 'center',
    gap: 14,
    padding: 20,
    borderRadius: 20,
    backgroundColor: VibeColors.surface,
    borderWidth: 1,
    borderColor: VibeColors.border,
  },
  text: {
    color: VibeColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
