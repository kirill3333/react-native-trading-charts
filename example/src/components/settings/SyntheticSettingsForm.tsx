import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { useSyntheticSettingsDraft } from '../../hooks/useSyntheticSettingsDraft';
import { APP_THEMES, type AppThemeColors } from '../../theme';
import { useAppTheme } from '../../themeContext';
import { SyntheticSettingsActions } from './SyntheticSettingsActions';
import { SyntheticSettingsField } from './SyntheticSettingsField';
import { SyntheticSettingsHeader } from './SyntheticSettingsHeader';
import { SYNTHETIC_SETTINGS_FIELDS } from './syntheticSettingsFields';

type SyntheticSettingsFormProps = { onClose: () => void };

export function SyntheticSettingsForm({ onClose }: SyntheticSettingsFormProps) {
  const theme = useAppTheme();
  const styles = THEMED_STYLES[theme.mode];
  const { draft, setDraft, errors, valid, apply } =
    useSyntheticSettingsDraft(onClose);

  return (
    <View style={styles.screen}>
      <SyntheticSettingsHeader onClose={onClose} />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {SYNTHETIC_SETTINGS_FIELDS.map((field) => (
            <SyntheticSettingsField
              key={field.key}
              label={field.label}
              description={field.description}
              decimal={field.decimal}
              value={draft[field.key]}
              error={errors[field.key]}
              onChangeText={(text) =>
                setDraft((current) => ({ ...current, [field.key]: text }))
              }
            />
          ))}
          <SyntheticSettingsActions valid={valid} onApply={apply} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1 },
    content: { padding: 20, gap: 18 },
  });
}

const THEMED_STYLES = {
  dark: createStyles(APP_THEMES.dark.colors),
  light: createStyles(APP_THEMES.light.colors),
};
