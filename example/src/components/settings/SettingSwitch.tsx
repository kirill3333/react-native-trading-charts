import { Switch } from 'react-native';

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
  return (
    <SettingsRow description={description} disabled={disabled} label={label}>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        ios_backgroundColor="#393242"
        onValueChange={onValueChange}
        thumbColor="#FFFFFF"
        trackColor={{ false: '#393242', true: '#7562F4' }}
        value={value}
      />
    </SettingsRow>
  );
}
