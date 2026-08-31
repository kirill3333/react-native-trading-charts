import { buildMainSeriesColors } from '../../../chartSettingsConfig';
import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingsSection } from '../SettingsSection';
import { SERIES_LINE_WIDTH_OPTIONS, SERIES_OPTIONS } from './settingsOptions';

export function SeriesSettingsSection() {
  const settings = useChartSettingsStore((state) => state.settings);
  const updateSettings = useChartSettingsStore(
    (state) => state.updateSettings
  );
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
        onValueChange={(seriesType) => updateSettings({ seriesType })}
        options={SERIES_OPTIONS}
        value={settings.seriesType}
      />
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
