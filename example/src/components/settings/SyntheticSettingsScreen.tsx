import {
  type StaticScreenProps,
  useNavigation,
} from '@react-navigation/native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { useAppTheme } from '../../themeContext';
import { SyntheticSettingsForm } from './SyntheticSettingsForm';

type SyntheticSettingsScreenProps = StaticScreenProps<{
  orientation: 'portrait_up' | 'landscape';
}>;

export function SyntheticSettingsScreen(_props: SyntheticSettingsScreenProps) {
  const navigation = useNavigation();
  const theme = useAppTheme();
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
      >
        <SyntheticSettingsForm onClose={() => navigation.goBack()} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
