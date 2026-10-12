import { StyleSheet, Text, View } from 'react-native';

import { VibeColors } from '../constants/theme';

const palette = ['#F5F3FF', '#FDF2F8', '#ECFDF5', '#FFF7ED', '#DBEAFE', '#F3E8FF'];

function hashFromName(name: string) {
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

export function Avatar({
  name,
  size = 52,
  online = false,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  const initial = (name || 'V').trim().charAt(0).toUpperCase() || 'V';
  const background = palette[hashFromName(name || 'Vibe') % palette.length];
  const indicatorSize = Math.max(10, Math.round(size * 0.24));
  const borderWidth = Math.max(2, Math.round(size * 0.05));

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}>
      <Text style={[styles.initial, { fontSize: Math.max(16, size * 0.38) }]}>{initial}</Text>
      {online && (
        <View
          style={[
            styles.onlineIndicator,
            {
              width: indicatorSize,
              height: indicatorSize,
              borderRadius: indicatorSize / 2,
              borderWidth,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  initial: {
    color: '#312E81',
    fontWeight: '700',
  },
  onlineIndicator: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: VibeColors.online,
    borderColor: '#FFFFFF',
  },
});
