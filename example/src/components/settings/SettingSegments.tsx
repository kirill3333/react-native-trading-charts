import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from './SettingsRow';

export type SettingSegmentOption<TValue extends string | number> = {
  label: string;
  value: TValue;
};

type SettingSegmentsProps<TValue extends string | number> = {
  description?: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: TValue) => void;
  options: ReadonlyArray<SettingSegmentOption<TValue>>;
  value: TValue;
};

export function SettingSegments<TValue extends string | number>({
  description,
  disabled = false,
  label,
  onValueChange,
  options,
  value,
}: SettingSegmentsProps<TValue>) {
  return (
    <SettingsRow description={description} disabled={disabled} label={label}>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              key={String(option.value)}
              onPress={() => onValueChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.text, selected && styles.textSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SettingsRow>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: '#100C18',
    borderColor: '#393242',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    padding: 2,
  },
  option: {
    alignItems: 'center',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 48,
    paddingHorizontal: 8,
  },
  optionSelected: { backgroundColor: '#7562F4' },
  text: { color: '#8F899B', fontSize: 11, fontWeight: '700' },
  textSelected: { color: '#FFFFFF', fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
