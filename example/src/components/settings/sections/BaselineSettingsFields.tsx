import { type ChartBaselineAppearance } from 'react-native-trading-charts';
import { buildBaselineAppearance } from '../../../baselineSettings';
import { useChartSettingsStore } from '../../../stores/chartSettingsStore';
import { HexColorSetting } from '../HexColorSetting';
import { NumberSetting } from '../NumberSetting';
import { SettingSegments } from '../SettingSegments';
import { SettingSwitch } from '../SettingSwitch';
import { LINE_OPTIONS, VALUE_SOURCE_OPTIONS } from './settingsOptions';

const BASE_MODES = [
  { label: 'Position %', value: 'percentage' },
  { label: 'Price', value: 'price' },
] as const;

export function BaselineSettingsFields() {
  const settings = useChartSettingsStore((state) => state.settings);
  const update = useChartSettingsStore((state) => state.updateSettings);
  const appearance = buildBaselineAppearance(settings);
  const patch = (value: ChartBaselineAppearance) =>
    update({
      baselineAppearance: { ...settings.baselineAppearance, ...value },
    });
  const patchGuide = (value: ChartBaselineAppearance['baseLine']) =>
    patch({
      baseLine: { ...settings.baselineAppearance.baseLine, ...value },
    });
  return (
    <>
      <SettingSegments
        label="Value source"
        options={VALUE_SOURCE_OPTIONS}
        value={settings.baselineSource}
        onValueChange={(baselineSource) => update({ baselineSource })}
      />
      <SettingSegments
        label="Base mode"
        options={BASE_MODES}
        value={settings.baselineMode}
        onValueChange={(baselineMode) => update({ baselineMode })}
      />
      {settings.baselineMode === 'price' ? (
        <NumberSetting
          key="price"
          label="Base price"
          description="Fixed price; does not expand autoscale"
          value={settings.baselinePrice}
          allowNonPositive
          onValueChange={(baselinePrice) => update({ baselinePrice })}
        />
      ) : (
        <NumberSetting
          key="percentage"
          label="Base position (%)"
          description="0 is the bottom, 100 is the top of the pane"
          value={settings.baselinePercentage}
          allowNonPositive
          validate={(value) =>
            value < 0 || value > 100 ? 'Enter a value from 0 to 100' : undefined
          }
          onValueChange={(baselinePercentage) => update({ baselinePercentage })}
        />
      )}
      <NumberSetting
        label="Baseline outline width"
        description="Width in points / dp"
        value={appearance.width}
        onValueChange={(width) => patch({ width })}
      />
      <SettingSegments
        label="Baseline outline style"
        options={LINE_OPTIONS}
        value={appearance.style}
        onValueChange={(style) => patch({ style })}
      />
      <SettingSwitch
        label="Round caps and joins"
        value={settings.baselineRounded}
        onValueChange={(baselineRounded) => update({ baselineRounded })}
      />
      <HexColorSetting
        label="Above base line color"
        value={appearance.topLineColor}
        onValueChange={(topLineColor) => patch({ topLineColor })}
      />
      <HexColorSetting
        label="Below base line color"
        value={appearance.bottomLineColor}
        onValueChange={(bottomLineColor) => patch({ bottomLineColor })}
      />
      {(['topFill', 'bottomFill'] as const).map((side) =>
        (['topColor', 'bottomColor'] as const).map((stop) => (
          <HexColorSetting
            key={`${side}-${stop}`}
            label={`${side === 'topFill' ? 'Above' : 'Below'} fill ${stop === 'topColor' ? 'top' : 'bottom'}`}
            value={appearance[side][stop]}
            onValueChange={(color) =>
              patch({
                [side]: { ...settings.baselineAppearance[side], [stop]: color },
              })
            }
          />
        ))
      )}
      <SettingSwitch
        label="Show base line"
        value={appearance.baseLine.visible}
        onValueChange={(visible) => patchGuide({ visible })}
      />
      <HexColorSetting
        label="Base line color"
        value={appearance.baseLine.color}
        onValueChange={(color) => patchGuide({ color })}
      />
      <NumberSetting
        label="Base line width"
        description="Width in points / dp"
        value={appearance.baseLine.width}
        onValueChange={(width) => patchGuide({ width })}
      />
      <SettingSegments
        label="Base line style"
        options={LINE_OPTIONS}
        value={appearance.baseLine.style}
        onValueChange={(style) => patchGuide({ style })}
      />
    </>
  );
}
