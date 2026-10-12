import { SymbolView } from 'expo-symbols';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    type KeyboardTypeOptions,
    type TextInputProps,
    type ViewStyle,
} from 'react-native';

import { VibeColors, VibeRadii, VibeSpacing } from '../constants/theme';

type VibeIconName =
  | 'add'
  | 'arrowBack'
  | 'call'
  | 'check'
  | 'close'
  | 'document'
  | 'edit'
  | 'eye'
  | 'eyeOff'
  | 'image'
  | 'logout'
  | 'mail'
  | 'message'
  | 'more'
  | 'person'
  | 'pin'
  | 'search'
  | 'send'
  | 'sentRead'
  | 'smile'
  | 'lock';

const iconNames: Record<VibeIconName, { ios: string; android: string }> = {
  add: { ios: 'plus', android: 'add' },
  arrowBack: { ios: 'chevron.left', android: 'arrow_back' },
  call: { ios: 'phone', android: 'call' },
  check: { ios: 'checkmark', android: 'check' },
  close: { ios: 'xmark', android: 'close' },
  document: { ios: 'doc.fill', android: 'description' },
  edit: { ios: 'pencil', android: 'edit' },
  eye: { ios: 'eye', android: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  image: { ios: 'photo', android: 'image' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  mail: { ios: 'envelope', android: 'mail' },
  message: { ios: 'bubble.left.and.bubble.right', android: 'forum' },
  more: { ios: 'ellipsis', android: 'more_vert' },
  person: { ios: 'person.crop.circle', android: 'person' },
  pin: { ios: 'pin.fill', android: 'push_pin' },
  search: { ios: 'magnifyingglass', android: 'search' },
  send: { ios: 'paperplane.fill', android: 'send' },
  sentRead: { ios: 'checkmark', android: 'done_all' },
  smile: { ios: 'face.smiling', android: 'sentiment_satisfied' },
  lock: { ios: 'lock', android: 'lock' },
};

export function VibeIcon({
  name,
  color = VibeColors.textSecondary,
  size = 20,
}: {
  name: VibeIconName;
  color?: string;
  size?: number;
}) {
  const icon = iconNames[name];
  return (
    <SymbolView
      name={{ ios: icon.ios as never, android: icon.android as never, web: icon.android as never }}
      tintColor={color}
      size={size}
    />
  );
}

export function VibeIconButton({
  name,
  label,
  onPress,
  color = VibeColors.text,
  backgroundColor = 'transparent',
  size = 42,
}: {
  name: VibeIconName;
  label: string;
  onPress: () => void;
  color?: string;
  backgroundColor?: string;
  size?: number;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.iconButton, { width: size, height: size, backgroundColor }]}
      activeOpacity={0.72}
    >
      <VibeIcon name={name} color={color} size={20} />
    </TouchableOpacity>
  );
}

export function VibeAvatar({
  name,
  size = 52,
  online = false,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'V';
  const indicatorSize = Math.max(12, Math.round(size * 0.25));
  const palette = ['#F5F3FF', '#FDF2F8', '#ECFDF5', '#FFF7ED', '#DBEAFE', '#F3E8FF'];
  let hash = 0;

  for (let index = 0; index < (name || 'Vibe').length; index += 1) {
    hash = (hash << 5) - hash + (name || 'Vibe').charCodeAt(index);
    hash |= 0;
  }

  const background = palette[Math.abs(hash) % palette.length];

  return (
    <View
      accessible
      accessibilityLabel={`${name || 'Vibe user'}${online ? ', online' : ''}`}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}
    >
      <Text style={[styles.avatarInitial, { fontSize: Math.round(size * 0.38) }]}>{initial}</Text>
      {online && (
        <View
          style={[
            styles.onlineIndicator,
            {
              width: indicatorSize,
              height: indicatorSize,
              borderRadius: indicatorSize / 2,
              borderWidth: Math.max(2, Math.round(size * 0.045)),
            },
          ]}
        />
      )}
    </View>
  );
}

export function VibeBrand({
  tagline = true,
  compact = false,
}: {
  tagline?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
        <VibeIcon name="message" color="#FFFFFF" size={compact ? 21 : 26} />
      </View>
      <View style={compact ? styles.brandWordmarkCompact : styles.brandWordmark}>
        <Text style={[styles.brandName, compact && styles.brandNameCompact]}>Vibe</Text>
      </View>
      {tagline && <Text style={styles.brandTagline}>Connect. Chat. Stay together.</Text>}
    </View>
  );
}

export function VibeSearchBar({
  value,
  onChangeText,
  placeholder = 'Search chats or people',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchBar}>
      <VibeIcon name="search" size={19} color={VibeColors.textSecondary} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={VibeColors.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <VibeIconButton
          name="close"
          label="Clear search"
          onPress={() => onChangeText('')}
          size={32}
          color={VibeColors.primary}
          backgroundColor="rgba(99, 102, 241, 0.08)"
        />
      )}
    </View>
  );
}

export function VibeAuthField({
  icon,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  secureTextEntry = false,
  onToggleSecure,
  autoCapitalize,
  autoComplete,
  returnKeyType,
}: {
  icon: VibeIconName;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  returnKeyType?: TextInputProps['returnKeyType'];
}) {
  return (
    <View style={styles.authField}>
      <VibeIcon name={icon} size={18} color={VibeColors.textSecondary} />
      <TextInput
        style={styles.authInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={VibeColors.textSecondary}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        returnKeyType={returnKeyType}
      />
      {onToggleSecure && (
        <VibeIconButton
          name={secureTextEntry ? 'eyeOff' : 'eye'}
          label={secureTextEntry ? 'Show password' : 'Hide password'}
          onPress={onToggleSecure}
          size={38}
          color={VibeColors.textSecondary}
        />
      )}
    </View>
  );
}

export function VibePrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.84}
      style={[styles.primaryButton, (disabled || loading) && styles.buttonDisabled, style]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function VibeEmptyState({
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
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <VibeIcon name="message" color={VibeColors.primary} size={27} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} style={styles.emptyAction} activeOpacity={0.75}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VibeRadii.pill,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarInitial: {
    color: '#312E81',
    fontWeight: '700',
  },
  onlineIndicator: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    borderColor: VibeColors.surface,
    backgroundColor: VibeColors.online,
  },
  brand: {
    alignItems: 'center',
  },
  brandCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VibeSpacing.md,
  },
  brandWordmark: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  brandWordmarkCompact: {
    justifyContent: 'center',
  },
  brandMark: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VibeColors.primary,
    marginBottom: VibeSpacing.md,
    shadowColor: '#5B5CE6',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  brandMarkCompact: {
    width: 44,
    height: 44,
    borderRadius: 16,
    marginBottom: 0,
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  brandName: {
    color: VibeColors.text,
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  brandNameCompact: {
    color: VibeColors.primary,
    fontSize: 24,
  },
  brandTagline: {
    color: VibeColors.textSecondary,
    fontSize: 14,
    marginTop: VibeSpacing.xs,
    textAlign: 'center',
  },
  searchBar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VibeSpacing.md,
    paddingLeft: VibeSpacing.lg,
    paddingRight: VibeSpacing.sm,
    borderRadius: VibeRadii.input,
    backgroundColor: VibeColors.surface,
    borderWidth: 1,
    borderColor: VibeColors.border,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    color: VibeColors.text,
    fontSize: 15,
  },
  authField: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: VibeSpacing.md,
    paddingLeft: VibeSpacing.lg,
    paddingRight: VibeSpacing.sm,
    borderRadius: VibeRadii.input,
    borderWidth: 1,
    borderColor: VibeColors.border,
    backgroundColor: VibeColors.surfaceAlt,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  authInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    color: VibeColors.text,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: VibeRadii.control,
    backgroundColor: VibeColors.primary,
    shadowColor: '#5B5CE6',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: VibeSpacing.xxl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: VibeColors.primarySoft,
    marginBottom: VibeSpacing.lg,
  },
  emptyTitle: {
    color: VibeColors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyDescription: {
    color: VibeColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: VibeColors.primary,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
