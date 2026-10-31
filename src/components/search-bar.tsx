import { StyleSheet, TextInput, View } from 'react-native';

import { useAppTheme } from '../context/theme-context';
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
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <VibeIcon name="search" color={colors.textSecondary} size={18} />
      <TextInput
        style={[styles.input, { color: colors.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <VibeIconButton
          name="close"
          label="Clear search"
          onPress={() => onChangeText('')}
          size={30}
          backgroundColor={colors.surfaceSubtle}
          color={colors.primary}
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
    borderWidth: 1,
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
    fontSize: 15,
  },
});
