import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { SettingsSection } from '../SettingsSection';
import { SettingSwitch } from '../SettingSwitch';

export function PriceOverlaysSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
  const currentPriceDetailsDisabled = !settings.currentPriceVisible;
  const pinToEdgeDisabled =
    currentPriceDetailsDisabled || !settings.currentPriceShowLabel;

  return (
    <SettingsSection title="Price overlays">
      <SettingSwitch
        label="Current price"
        onValueChange={(currentPriceVisible) =>
          updateSettings({ currentPriceVisible })
        }
        value={settings.currentPriceVisible}
      />
      <SettingSwitch
        disabled={currentPriceDetailsDisabled}
        label="Price label"
        onValueChange={(currentPriceShowLabel) =>
          updateSettings({ currentPriceShowLabel })
        }
        value={settings.currentPriceShowLabel}
      />
      <SettingSwitch
        description="Keep the label on the Y-axis edge"
        disabled={pinToEdgeDisabled}
        label="Pin to edge"
        onValueChange={(currentPricePinToEdge) =>
          updateSettings({ currentPricePinToEdge })
        }
        value={settings.currentPricePinToEdge}
      />
      <SettingSwitch
        label="Price extremes"
        onValueChange={(priceExtremesVisible) =>
          updateSettings({ priceExtremesVisible })
        }
        value={settings.priceExtremesVisible}
      />
      <SettingSwitch
        description="Calculated from all API candles loaded this session"
        label="All-time high & low"
        onValueChange={(allTimeExtremesVisible) =>
          updateSettings({ allTimeExtremesVisible })
        }
        value={settings.allTimeExtremesVisible}
      />
    </SettingsSection>
  );
}
