import { StyleSheet, TextInput, View } from 'react-native';

import { VibeColors } from '../constants/theme';
import { VibeIcon, VibeIconButton } from './vibe-ui';

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search conversations',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.container}>
      <VibeIcon name="search" color={VibeColors.textSecondary} size={18} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={VibeColors.textSecondary}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <VibeIconButton
          name="close"
          label="Clear search"
          onPress={() => onChangeText('')}
          size={30}
          backgroundColor="rgba(99, 102, 241, 0.08)"
          color={VibeColors.primary}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: VibeColors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  input: {
    flex: 1,
    minHeight: 42,
    color: VibeColors.text,
    fontSize: 15,
  },
});
