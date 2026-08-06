import { Switch } from 'react-native';

import { useAppTheme } from '../../themeContext';
import { SettingsRow } from './SettingsRow';

type SettingSwitchProps = {
  description?: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
};

export function SettingSwitch({
  description,
  disabled = false,
  label,
  onValueChange,
  value,
}: SettingSwitchProps) {
  const { colors } = useAppTheme();
  return (
    <SettingsRow description={description} disabled={disabled} label={label}>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        ios_backgroundColor={colors.switchTrackOff}
        onValueChange={onValueChange}
        thumbColor={colors.switchThumb}
        trackColor={{ false: colors.switchTrackOff, true: colors.accent }}
        value={value}
      />
    </SettingsRow>
  );
}
