import { BaselineSettingsFields } from './BaselineSettingsFields';
import { buildMainSeriesColors } from '../../../chartSettingsConfig';
import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingSwitch } from '../SettingSwitch';
import { SettingsSection } from '../SettingsSection';
import { SERIES_LINE_WIDTH_OPTIONS, SERIES_OPTIONS } from './settingsOptions';

export function SeriesSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore((state) => state.updateSettings);
  const colors = buildMainSeriesColors(settings);
  const lineSeries =
    settings.seriesType === 'line' || settings.seriesType === 'area';
  const ohlcSeries =
    settings.seriesType === 'candlestick' ||
    settings.seriesType === 'hollowCandlestick' ||
    settings.seriesType === 'bar';

  return (
    <SettingsSection title="Main chart">
      <SettingSegments
        label="Style"
        wrap
        onValueChange={(seriesType) => updateSettings({ seriesType })}
        options={SERIES_OPTIONS}
        value={settings.seriesType}
      />
      {settings.seriesType === 'baseline' ? <BaselineSettingsFields /> : null}
      {lineSeries ? (
        <>
          <SettingSegments
            label="Line width"
            onValueChange={(seriesLineWidth) =>
              updateSettings({ seriesLineWidth })
            }
            options={SERIES_LINE_WIDTH_OPTIONS}
            value={settings.seriesLineWidth}
          />
          <SettingSwitch
            label="Round caps and joins"
            onValueChange={(rounded) =>
              updateSettings(
                settings.seriesType === 'area'
                  ? { areaRounded: rounded }
                  : { lineRounded: rounded }
              )
            }
            value={
              settings.seriesType === 'area'
                ? settings.areaRounded
                : settings.lineRounded
            }
          />
          <HexColorSetting
            description="Color of the close-price line"
            label="Line color"
            onValueChange={(mainLineColorOverride) =>
              updateSettings({ mainLineColorOverride })
            }
            value={colors.lineColor}
          />
        </>
      ) : null}
      {ohlcSeries ? (
        <>
          <HexColorSetting
            description="Rising candles and bars"
            label="Up color"
            onValueChange={(mainUpColorOverride) =>
              updateSettings({ mainUpColorOverride })
            }
            value={colors.upColor}
          />
          <HexColorSetting
            description="Falling candles and bars"
            label="Down color"
            onValueChange={(mainDownColorOverride) =>
              updateSettings({ mainDownColorOverride })
            }
            value={colors.downColor}
          />
        </>
      ) : null}
      {settings.seriesType === 'area' ? (
        <>
          <HexColorSetting
            description="Color at the top of the area fill"
            label="Fill top"
            onValueChange={(mainAreaFillTopColorOverride) =>
              updateSettings({ mainAreaFillTopColorOverride })
            }
            value={colors.areaFillTopColor}
          />
          <HexColorSetting
            description="Color at the bottom of the area fill"
            label="Fill bottom"
            onValueChange={(mainAreaFillBottomColorOverride) =>
              updateSettings({ mainAreaFillBottomColorOverride })
            }
            value={colors.areaFillBottomColor}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
