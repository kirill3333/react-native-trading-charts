import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type SettingsSectionProps = {
  children: ReactNode;
  title: string;
};

export function SettingsSection({ children, title }: SettingsSectionProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 22 },
  title: {
    color: '#8F899B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 7,
    paddingHorizontal: 14,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#1B1723',
    borderColor: '#393242',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
