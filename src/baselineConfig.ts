import {
  type BaselineBaseValue,
  type ChartBaselineAppearance,
  type ChartLineStyle,
  type ChartTheme,
  type ResolvedBaselineAppearance,
} from './types';

export function resolveBaseValue(input?: BaselineBaseValue): BaselineBaseValue {
  const base = input ?? { type: 'percentage', value: 50 };
  const invalidType = base.type !== 'price' && base.type !== 'percentage';
  const invalidPercentage =
    base.type === 'percentage' && (base.value < 0 || base.value > 100);
  if (invalidType || invalidPercentage || !Number.isFinite(base.value)) {
    throw new TypeError(
      'baseValue must contain a finite price or a percentage from 0 to 100'
    );
  }
  return { ...base };
}

function baselineColor(value: string): string {
  if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) {
    throw new TypeError('Baseline colors must use #RRGGBB or #RRGGBBAA');
  }
  return value;
}

function width(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError('Baseline widths must be finite positive numbers');
  }
  return value;
}

function style(value: ChartLineStyle): ChartLineStyle {
  if (value !== 'solid' && value !== 'dashed') {
    throw new TypeError("Baseline styles must be 'solid' or 'dashed'");
  }
  return value;
}

export function resolveBaselineAppearance(
  input: ChartBaselineAppearance | undefined,
  theme: Required<ChartTheme>,
  fallback?: ResolvedBaselineAppearance
): ResolvedBaselineAppearance {
  const top = baselineColor(
    input?.topLineColor ?? fallback?.topLineColor ?? theme.upColor
  );
  const bottom = baselineColor(
    input?.bottomLineColor ?? fallback?.bottomLineColor ?? theme.downColor
  );
  return {
    width: width(input?.width ?? fallback?.width ?? 1.5),
    style: style(input?.style ?? fallback?.style ?? 'solid'),
    topLineColor: top,
    bottomLineColor: bottom,
    topFill: {
      topColor: baselineColor(
        input?.topFill?.topColor ??
          fallback?.topFill.topColor ??
          `${top.slice(0, 7)}40`
      ),
      bottomColor: baselineColor(
        input?.topFill?.bottomColor ??
          fallback?.topFill.bottomColor ??
          `${top.slice(0, 7)}00`
      ),
    },
    bottomFill: {
      topColor: baselineColor(
        input?.bottomFill?.topColor ??
          fallback?.bottomFill.topColor ??
          `${bottom.slice(0, 7)}00`
      ),
      bottomColor: baselineColor(
        input?.bottomFill?.bottomColor ??
          fallback?.bottomFill.bottomColor ??
          `${bottom.slice(0, 7)}40`
      ),
    },
    baseLine: {
      visible: input?.baseLine?.visible ?? fallback?.baseLine.visible ?? true,
      color: baselineColor(
        input?.baseLine?.color ?? fallback?.baseLine.color ?? theme.gridColor
      ),
      width: width(input?.baseLine?.width ?? fallback?.baseLine.width ?? 1),
      style: style(
        input?.baseLine?.style ?? fallback?.baseLine.style ?? 'dashed'
      ),
    },
  };
}
