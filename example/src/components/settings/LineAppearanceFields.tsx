import { type LineSettings } from '../../lineSettings';
import { HexColorSetting } from './HexColorSetting';
import { SettingSegments } from './SettingSegments';
import { SettingSwitch } from './SettingSwitch';
import {
  INDICATOR_LINE_WIDTH_OPTIONS,
  LINE_OPTIONS,
} from './sections/settingsOptions';

export function LineAppearanceFields({
  label,
  labels,
  colorDescription,
  value,
  onChange,
}: {
  label: string;
  labels?: Partial<Record<keyof LineSettings, string>>;
  colorDescription?: string;
  value: LineSettings;
  onChange: (patch: Partial<LineSettings>) => void;
}) {
  const update = onChange;
  return (
    <>
      <SettingSegments
        label={labels?.width ?? `${label} width`}
        value={value.width}
        options={INDICATOR_LINE_WIDTH_OPTIONS}
        onValueChange={(width) => update({ width })}
      />
      <SettingSegments
        label={labels?.style ?? `${label} style`}
        value={value.style}
        options={LINE_OPTIONS}
        onValueChange={(style) => update({ style })}
      />
      <HexColorSetting
        description={colorDescription}
        label={labels?.color ?? `${label} color`}
        value={value.color}
        onValueChange={(color) => update({ color })}
      />
      <SettingSwitch
        label={labels?.gradientEnabled ?? `${label} gradient`}
        value={value.gradientEnabled}
        onValueChange={(gradientEnabled) => update({ gradientEnabled })}
      />
      {value.gradientEnabled ? (
        <>
          <HexColorSetting
            label={labels?.gradientTopColor ?? `${label} gradient top`}
            value={value.gradientTopColor}
            onValueChange={(gradientTopColor) => update({ gradientTopColor })}
          />
          <HexColorSetting
            label={labels?.gradientBottomColor ?? `${label} gradient bottom`}
            value={value.gradientBottomColor}
            onValueChange={(gradientBottomColor) =>
              update({ gradientBottomColor })
            }
          />
        </>
      ) : null}
    </>
  );
}
