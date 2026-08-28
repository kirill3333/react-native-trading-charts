// Copyright 2026 The React Native Trading Charts Authors
// SPDX-License-Identifier: MIT

#include <jni.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "cpp/chart_engine.h"
#include "cpp/internal/trading_time.h"

using trading_charts::BucketOrigin;
using trading_charts::CandleTimestampPolicy;
using trading_charts::ChartConfig;
using trading_charts::ChartEngine;
using trading_charts::Color;
using trading_charts::OhlcValueSource;
using trading_charts::OutsideSessionPolicy;
using trading_charts::PaneConfig;
using trading_charts::RenderSnapshot;
using trading_charts::ResolutionUnit;
using trading_charts::SeriesConfig;
using trading_charts::SeriesSource;
using trading_charts::SeriesType;
using trading_charts::TimeZoneTransition;
using trading_charts::TradingCalendarConfig;
using trading_charts::TradingCalendarOverrideConfig;
using trading_charts::TradingSessionConfig;
using trading_charts::UpdateStatus;

namespace {

template <typename Enum>
constexpr size_t ToIndex(Enum value) {
  return static_cast<size_t>(value);
}

enum class ConfigNumberIndex : std::uint8_t {
  // Positional ABI placeholder. Keep all following indices stable.
  kReservedConfig0,
  kInitialVisibleCount,
  kShowXAxis,
  kXAxisHeight,
  kShowSeconds,
  kShowYAxis,
  kYAxisOnRight,
  kYAxisWidth,
  kCompactValues,
  kPrecision,
  kMinMove,
  kUseGrouping,
  kAllowPan,
  kAllowZoom,
  kShowCurrentPrice,
  kShowCurrentPriceLabel,
  kCrosshairEnabled,
  kShowTooltip,
  kYScaleMarginTop,
  kYScaleMarginBottom,
  kDisplayScale,
  kLogicalSpacing,
  kPinCurrentPriceToEdge,
  kShowPriceExtremes,
  kDefaultScale,
  kCrosshairDashed,
  kTooltipBackgroundOpacity,
  kGridOpacity,
  kCrosshairOpacity,
  kDefaultYScale,
  kAllowYAxisScale,
  kSeriesType,
  kBarLineWidth,
  kLineSource,
  kLineWidth,
  kLineGradientEnabled,
  kLineGapThresholdMs,
  kResolutionUnit,
  kResolutionMultiplier,
  kFixedResolutionDurationMs,
  kBucketOrigin,
  kOriginTimestampMs,
  kOutsideSession,
  kCandleTimestamp,
  kCandleRadius,
  kLineDashed,
  kCount,
};

enum class ConfigColorIndex : std::uint8_t {
  kBackground,
  kGrid = 4,
  kAxisText = 8,
  kUp = 12,
  kDown = 16,
  kCrosshair = 20,
  kTooltipBackground = 24,
  kTooltipText = 28,
  kCurrentPriceLineUp = 32,
  kCurrentPriceLineDown = 36,
  kCurrentPriceLabelUp = 40,
  kCurrentPriceLabelDown = 44,
  kLine = 48,
  kLineGradientTop = 52,
  kLineGradientBottom = 56,
  kAreaFillTop = 60,
  kAreaFillBottom = 64,
};

enum class SeriesNumberIndex : std::uint8_t {
  kAbiVersion,
  kNumberSize,
  kColorSize,
  kStringSize,
  kType,
  kSource,
  kVisible,
  kDeclarative,
  kLineWidth,
  kLineSource,
  kLineGradientEnabled,
  kLineGapThresholdMs,
  kRsiPeriod,
  kRsiOversold,
  kRsiOverbought,
  kRsiTextColorSet,
  kLineDashed,
  kMovingAveragePeriod,
  kMacdFastPeriod,
  kMacdSlowPeriod,
  kMacdSignalPeriod,
  kMacdTextColorSet,
  kMacdSignalLineWidth,
  kMacdSignalGradientEnabled,
  kMacdSignalLineDashed,
  kCount,
};

enum class SeriesColorIndex : std::uint8_t {
  kAbiVersion,
  kNumberSize,
  kColorSize,
  kStringSize,
  kColor,
  kUp = 8,
  kDown = 12,
  kLineGradientTop = 16,
  kLineGradientBottom = 20,
  kAreaFillTop = 24,
  kAreaFillBottom = 28,
  kRsiLevelLine = 32,
  kRsiBand = 36,
  kRsiText = 40,
  kMacdSignal = 44,
  kMacdSignalGradientTop = 48,
  kMacdSignalGradientBottom = 52,
  kMacdPositiveIncreasing = 56,
  kMacdPositiveDecreasing = 60,
  kMacdNegativeIncreasing = 64,
  kMacdNegativeDecreasing = 68,
  kMacdZeroLine = 72,
  kMacdText = 76,
  kCount = 80,
};

enum class SeriesStringIndex : std::uint8_t {
  kMarker,
  kSeriesId,
  kPaneId,
  kPriceScaleId,
  kSourceSeriesId,
  kCount,
};

enum class SnapshotRecordHeaderIndex : std::uint8_t {
  kAbiVersion,
  kRecordWidth,
  kRecordCount,
  kCount,
};

enum class TickRecordIndex : std::uint8_t {
  kValue,
  kPosition,
  kCount,
};

enum class PaneSnapshotRecordIndex : std::uint8_t {
  kPlotLeft,
  kPlotTop,
  kPlotRight,
  kPlotBottom,
  kHeightWeight,
  kVisibleYMin,
  kVisibleYMax,
  kYAxisScale,
  kYTickOffset,
  kYTickCount,
  kScaleVisible,
  kVolumeFormat,
  kPrecision,
  kRsiScale,
  kCount,
};

enum class IndicatorLegendRecordIndex : std::uint8_t {
  kPaneIndex,
  kKind,
  kPeriod,
  kFastPeriod,
  kSlowPeriod,
  kSignalPeriod,
  kValueSource,
  kValueCount,
  kTextColorSet,
  kTextColorR,
  kTextColorG,
  kTextColorB,
  kTextColorA,
  kValues,
};

enum class SnapshotMetaIndex : std::uint8_t {
  kAbiVersion,
  kPayloadSize,
  kWidth,
  kHeight,
  kPlotLeft,
  kPlotTop,
  kPlotRight,
  kPlotBottom,
  kVisibleXMin,
  kVisibleXMax,
  kVisibleYMin,
  kVisibleYMax,
  kCurrentPriceVisible,
  kCurrentPrice,
  kCurrentPriceY,
  kCurrentPriceColorR,
  kCurrentPriceColorG,
  kCurrentPriceColorB,
  kCurrentPriceColorA,
  kCrosshairVisible,
  kCrosshairX,
  kCrosshairY,
  kCrosshairPrice,
  kSelectedTimestamp,
  kSelectedOpen,
  kSelectedHigh,
  kSelectedLow,
  kSelectedClose,
  kSelectedVolume,
  kFirstVisibleIndex,
  kLastVisibleIndex,
  kTotalCandleCount,
  kHasVisibleCandles,
  kVisibleMaximumVisible,
  kVisibleMaximumValue,
  kVisibleMaximumX,
  kVisibleMaximumY,
  kVisibleMaximumLabelOnRight,
  kVisibleMinimumVisible,
  kVisibleMinimumValue,
  kVisibleMinimumX,
  kVisibleMinimumY,
  kVisibleMinimumLabelOnRight,
  kSelectedChange,
  kSelectedChangePercent,
  kSelectedAmplitudePercent,
  kSelectedPercentagesValid,
  kCurrentPriceLabelColorR,
  kCurrentPriceLabelColorG,
  kCurrentPriceLabelColorB,
  kCurrentPriceLabelColorA,
  kHorizontalScale,
  kYAxisScale,
  kCount,
};

inline constexpr jsize kLegacyConfigNumberCount = 22;
inline constexpr jsize kLegacyConfigColorCount = 32;
inline constexpr jsize kExtendedConfigColorCount = 48;
inline constexpr jsize kLineConfigColorCount = 60;
inline constexpr jsize kAreaConfigColorCount = 68;
inline constexpr jsize kColorChannelCount = 4;
inline constexpr double kChartEngineTransportAbiVersion = 3.0;
inline constexpr char kSeriesTransportMarker[] = "TradingCharts.Series.v3";
inline constexpr size_t kConfigNumberCount = ToIndex(ConfigNumberIndex::kCount);
inline constexpr size_t kSeriesNumberCount = ToIndex(SeriesNumberIndex::kCount);
inline constexpr size_t kSeriesColorCount = ToIndex(SeriesColorIndex::kCount);
inline constexpr size_t kSeriesStringCount = ToIndex(SeriesStringIndex::kCount);
inline constexpr size_t kSnapshotRecordHeaderCount = 3;
inline constexpr size_t kTickRecordWidth = ToIndex(TickRecordIndex::kCount);
inline constexpr size_t kPaneSnapshotRecordWidth = 14;
inline constexpr size_t kIndicatorLegendValueRecordWidth = 6;
inline constexpr size_t kIndicatorLegendValueCapacity = 3;
inline constexpr size_t kIndicatorLegendRecordWidth = 31;
inline constexpr size_t kSnapshotMetaCount = ToIndex(SnapshotMetaIndex::kCount);

static_assert(kConfigNumberCount == 46);
static_assert(kSeriesNumberCount == 25);
static_assert(kSeriesColorCount == 80);
static_assert(kSeriesStringCount == 5);
static_assert(ToIndex(SnapshotRecordHeaderIndex::kCount) ==
              kSnapshotRecordHeaderCount);
static_assert(kTickRecordWidth == 2);
static_assert(ToIndex(PaneSnapshotRecordIndex::kCount) ==
              kPaneSnapshotRecordWidth);
static_assert(kIndicatorLegendRecordWidth == 31);
static_assert(kIndicatorLegendRecordWidth ==
              ToIndex(IndicatorLegendRecordIndex::kValues) +
                  kIndicatorLegendValueRecordWidth *
                      kIndicatorLegendValueCapacity);
static_assert(kSnapshotMetaCount == 53);
static_assert(ToIndex(ConfigColorIndex::kCurrentPriceLabelDown) +
                  kColorChannelCount ==
              kExtendedConfigColorCount);
static_assert(ToIndex(ConfigColorIndex::kLineGradientBottom) +
                  kColorChannelCount ==
              kLineConfigColorCount);
static_assert(ToIndex(ConfigColorIndex::kAreaFillBottom) + kColorChannelCount ==
              kAreaConfigColorCount);

ChartEngine* EngineFromHandle(jlong handle) {
  // JNI represents opaque native handles as jlong values.
  // NOLINTNEXTLINE(performance-no-int-to-ptr)
  return reinterpret_cast<ChartEngine*>(handle);
}

std::shared_ptr<const RenderSnapshot>* SnapshotFromHandle(jlong handle) {
  // JNI represents opaque native handles as jlong values.
  // NOLINTNEXTLINE(performance-no-int-to-ptr)
  return reinterpret_cast<std::shared_ptr<const RenderSnapshot>*>(handle);
}

int StatusValue(UpdateStatus status) {
  switch (status) {
    case UpdateStatus::kApplied:
      return 0;
    case UpdateStatus::kIgnoredOldTimestamp:
      return 1;
    case UpdateStatus::kInvalidInput:
      return 2;
    case UpdateStatus::kIgnoredOutsideSession:
      return 3;
  }
  return 2;
}

std::vector<double> CopyDoubles(JNIEnv* env, jdoubleArray values) {
  if (!values) {
    return {};
  }
  const jsize count = env->GetArrayLength(values);
  std::vector<double> result(static_cast<size_t>(count));
  env->GetDoubleArrayRegion(values, 0, count, result.data());
  return result;
}

std::vector<jlong> CopyLongs(JNIEnv* env, jlongArray values) {
  if (!values) {
    return {};
  }
  const jsize count = env->GetArrayLength(values);
  std::vector<jlong> result(static_cast<size_t>(count));
  env->GetLongArrayRegion(values, 0, count, result.data());
  return result;
}

std::vector<jint> CopyInts(JNIEnv* env, jintArray values) {
  if (!values) {
    return {};
  }
  const jsize count = env->GetArrayLength(values);
  std::vector<jint> result(static_cast<size_t>(count));
  env->GetIntArrayRegion(values, 0, count, result.data());
  return result;
}

std::string StringAt(JNIEnv* env, jobjectArray values, jsize index,
                     const char* fallback) {
  if (!values || index >= env->GetArrayLength(values)) {
    return fallback;
  }
  auto value = static_cast<jstring>(env->GetObjectArrayElement(values, index));
  if (!value) {
    return fallback;
  }
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string result = chars ? chars : fallback;
  if (chars) {
    env->ReleaseStringUTFChars(value, chars);
  }
  env->DeleteLocalRef(value);
  return result;
}

std::string CopyString(JNIEnv* env, jstring value) {
  if (!value) {
    return {};
  }
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string result = chars ? chars : "";
  if (chars) {
    env->ReleaseStringUTFChars(value, chars);
  }
  return result;
}

struct SeriesTransportPayload {
  std::array<double, kSeriesNumberCount> numbers{};
  std::array<float, kSeriesColorCount> colors{};
  std::array<std::string, kSeriesStringCount> strings{};
};

bool ThrowInvalidTransportPayload(JNIEnv* env, const char* message) {
  jclass exception_class = env->FindClass("java/lang/IllegalArgumentException");
  if (exception_class) {
    env->ThrowNew(exception_class, message);
    env->DeleteLocalRef(exception_class);
  }
  return false;
}

bool ReadSeriesTransportPayload(JNIEnv* env, jobjectArray strings,
                                jdoubleArray numbers, jfloatArray colors,
                                SeriesTransportPayload* payload) {
  if (!strings || !numbers || !colors || !payload) {
    return ThrowInvalidTransportPayload(env, "Series payload must not be null");
  }
  if (env->GetArrayLength(strings) != static_cast<jsize>(kSeriesStringCount) ||
      env->GetArrayLength(numbers) != static_cast<jsize>(kSeriesNumberCount) ||
      env->GetArrayLength(colors) != static_cast<jsize>(kSeriesColorCount)) {
    return ThrowInvalidTransportPayload(env,
                                        "Invalid exact series payload sizes");
  }
  env->GetDoubleArrayRegion(numbers, 0, static_cast<jsize>(kSeriesNumberCount),
                            payload->numbers.data());
  env->GetFloatArrayRegion(colors, 0, static_cast<jsize>(kSeriesColorCount),
                           payload->colors.data());
  for (size_t index = 0; index < kSeriesStringCount; ++index) {
    payload->strings[index] =
        StringAt(env, strings, static_cast<jsize>(index), "");
  }

  const auto number_at = [&](SeriesNumberIndex index) {
    return payload->numbers[ToIndex(index)];
  };
  const auto color_at = [&](SeriesColorIndex index) {
    return payload->colors[ToIndex(index)];
  };
  const bool valid_number_header =
      number_at(SeriesNumberIndex::kAbiVersion) ==
          kChartEngineTransportAbiVersion &&
      number_at(SeriesNumberIndex::kNumberSize) == kSeriesNumberCount &&
      number_at(SeriesNumberIndex::kColorSize) == kSeriesColorCount &&
      number_at(SeriesNumberIndex::kStringSize) == kSeriesStringCount;
  const bool valid_color_header =
      color_at(SeriesColorIndex::kAbiVersion) ==
          kChartEngineTransportAbiVersion &&
      color_at(SeriesColorIndex::kNumberSize) == kSeriesNumberCount &&
      color_at(SeriesColorIndex::kColorSize) == kSeriesColorCount &&
      color_at(SeriesColorIndex::kStringSize) == kSeriesStringCount;
  if (!valid_number_header || !valid_color_header ||
      payload->strings[ToIndex(SeriesStringIndex::kMarker)] !=
          kSeriesTransportMarker) {
    return ThrowInvalidTransportPayload(
        env, "Incompatible ChartEngine series payload ABI");
  }
  return true;
}

std::vector<double> VersionedRecordPayload(size_t record_width,
                                           size_t record_count) {
  std::vector<double> packed(kSnapshotRecordHeaderCount +
                             record_width * record_count);
  packed[ToIndex(SnapshotRecordHeaderIndex::kAbiVersion)] =
      kChartEngineTransportAbiVersion;
  packed[ToIndex(SnapshotRecordHeaderIndex::kRecordWidth)] =
      static_cast<double>(record_width);
  packed[ToIndex(SnapshotRecordHeaderIndex::kRecordCount)] =
      static_cast<double>(record_count);
  return packed;
}

size_t RecordOffset(size_t record_width, size_t record_index) {
  return kSnapshotRecordHeaderCount + record_width * record_index;
}

jdoubleArray NewDoubleArray(JNIEnv* env, const std::vector<double>& values) {
  jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(values.size()));
  if (!values.empty()) {
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(values.size()),
                              values.data());
  }
  return result;
}

}  // namespace

extern "C" {

JNIEXPORT jintArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeTransportAbi(JNIEnv* env,
                                                            jclass) {
  const std::array<jint, 8> descriptor{
      static_cast<jint>(kChartEngineTransportAbiVersion),
      static_cast<jint>(kSeriesNumberCount),
      static_cast<jint>(kSeriesColorCount),
      static_cast<jint>(kSeriesStringCount),
      static_cast<jint>(kSnapshotRecordHeaderCount),
      static_cast<jint>(kTickRecordWidth),
      static_cast<jint>(kPaneSnapshotRecordWidth),
      static_cast<jint>(kIndicatorLegendRecordWidth),
  };
  jintArray result = env->NewIntArray(static_cast<jsize>(descriptor.size()));
  env->SetIntArrayRegion(result, 0, static_cast<jsize>(descriptor.size()),
                         descriptor.data());
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeRoundTripSeriesPayload(
    JNIEnv* env, jclass, jobjectArray strings, jdoubleArray numbers,
    jfloatArray colors) {
  SeriesTransportPayload payload;
  if (!ReadSeriesTransportPayload(env, strings, numbers, colors, &payload)) {
    return nullptr;
  }
  constexpr size_t kRoundTripNumberCount =
      kSeriesNumberCount - ToIndex(SeriesNumberIndex::kType);
  constexpr size_t kRoundTripColorCount =
      kSeriesColorCount - ToIndex(SeriesColorIndex::kColor);
  constexpr size_t kRoundTripStringCount =
      kSeriesStringCount - ToIndex(SeriesStringIndex::kSeriesId);
  constexpr size_t kRoundTripHeaderCount = 4;
  std::vector<double> result(kRoundTripHeaderCount + kRoundTripNumberCount +
                             kRoundTripColorCount + kRoundTripStringCount);
  result[0] = kChartEngineTransportAbiVersion;
  result[1] = static_cast<double>(kRoundTripNumberCount);
  result[2] = static_cast<double>(kRoundTripColorCount);
  result[3] = static_cast<double>(kRoundTripStringCount);
  size_t target = kRoundTripHeaderCount;
  for (size_t index = ToIndex(SeriesNumberIndex::kType);
       index < kSeriesNumberCount; ++index) {
    result[target++] = payload.numbers[index];
  }
  for (size_t index = ToIndex(SeriesColorIndex::kColor);
       index < kSeriesColorCount; ++index) {
    result[target++] = payload.colors[index];
  }
  for (size_t index = ToIndex(SeriesStringIndex::kSeriesId);
       index < kSeriesStringCount; ++index) {
    result[target++] = static_cast<double>(payload.strings[index].size());
  }
  return NewDoubleArray(env, result);
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeCreate(JNIEnv*, jclass) {
  return reinterpret_cast<jlong>(new ChartEngine());
}

JNIEXPORT void JNICALL Java_com_tradingcharts_ChartEngineNative_nativeDestroy(
    JNIEnv*, jclass, jlong handle) {
  delete EngineFromHandle(handle);
}

JNIEXPORT void JNICALL Java_com_tradingcharts_ChartEngineNative_nativeSetConfig(
    JNIEnv* env, jclass, jlong handle, jdoubleArray numbers, jfloatArray colors,
    jobjectArray strings) {
  ChartEngine* instance = EngineFromHandle(handle);
  if (!instance || !numbers ||
      env->GetArrayLength(numbers) < kLegacyConfigNumberCount || !colors ||
      env->GetArrayLength(colors) < kLegacyConfigColorCount) {
    return;
  }
  const jsize number_count = env->GetArrayLength(numbers);
  const jsize color_count = env->GetArrayLength(colors);
  std::array<jdouble, kConfigNumberCount> config_numbers{};
  std::array<jfloat, kAreaConfigColorCount> config_colors{};
  env->GetDoubleArrayRegion(
      numbers, 0,
      std::min(number_count, static_cast<jsize>(config_numbers.size())),
      config_numbers.data());
  env->GetFloatArrayRegion(
      colors, 0,
      std::min(color_count, static_cast<jsize>(config_colors.size())),
      config_colors.data());

  const auto number_at = [&](ConfigNumberIndex index) {
    return config_numbers[ToIndex(index)];
  };
  const auto color_at = [&](ConfigColorIndex index) {
    const size_t offset = ToIndex(index);
    return Color{config_colors[offset], config_colors[offset + 1],
                 config_colors[offset + 2], config_colors[offset + 3]};
  };
  ChartConfig config;
  config.initial_visible_count =
      static_cast<int>(number_at(ConfigNumberIndex::kInitialVisibleCount));
  config.show_x_axis = number_at(ConfigNumberIndex::kShowXAxis) != 0;
  config.x_axis_height =
      static_cast<float>(number_at(ConfigNumberIndex::kXAxisHeight));
  config.show_seconds = number_at(ConfigNumberIndex::kShowSeconds) != 0;
  config.show_y_axis = number_at(ConfigNumberIndex::kShowYAxis) != 0;
  config.y_axis_on_right = number_at(ConfigNumberIndex::kYAxisOnRight) != 0;
  config.y_axis_width =
      static_cast<float>(number_at(ConfigNumberIndex::kYAxisWidth));
  config.compact_values = number_at(ConfigNumberIndex::kCompactValues) != 0;
  config.precision = static_cast<int>(number_at(ConfigNumberIndex::kPrecision));
  config.min_move = number_at(ConfigNumberIndex::kMinMove);
  config.use_grouping = number_at(ConfigNumberIndex::kUseGrouping) != 0;
  config.allow_pan = number_at(ConfigNumberIndex::kAllowPan) != 0;
  config.allow_zoom = number_at(ConfigNumberIndex::kAllowZoom) != 0;
  config.show_current_price =
      number_at(ConfigNumberIndex::kShowCurrentPrice) != 0;
  config.show_current_price_label =
      number_at(ConfigNumberIndex::kShowCurrentPriceLabel) != 0;
  config.crosshair_enabled =
      number_at(ConfigNumberIndex::kCrosshairEnabled) != 0;
  config.show_tooltip = number_at(ConfigNumberIndex::kShowTooltip) != 0;
  config.y_scale_margin_top = number_at(ConfigNumberIndex::kYScaleMarginTop);
  config.y_scale_margin_bottom =
      number_at(ConfigNumberIndex::kYScaleMarginBottom);
  config.display_scale =
      static_cast<float>(number_at(ConfigNumberIndex::kDisplayScale));
  config.logical_spacing = number_at(ConfigNumberIndex::kLogicalSpacing) != 0;
  config.pin_current_price_to_edge =
      number_count < 23 ||
      number_at(ConfigNumberIndex::kPinCurrentPriceToEdge) != 0;
  config.show_price_extremes =
      number_count < 24 ||
      number_at(ConfigNumberIndex::kShowPriceExtremes) != 0;
  config.default_scale =
      number_count < 25 ? 1.0 : number_at(ConfigNumberIndex::kDefaultScale);
  config.crosshair_dashed =
      number_count >= 26 && number_at(ConfigNumberIndex::kCrosshairDashed) != 0;
  config.tooltip_background_opacity =
      number_count < 27 ? 1.0f
                        : static_cast<float>(number_at(
                              ConfigNumberIndex::kTooltipBackgroundOpacity));
  config.grid_opacity =
      number_count < 29
          ? 0.75f
          : static_cast<float>(number_at(ConfigNumberIndex::kGridOpacity));
  config.crosshair_opacity =
      number_count < 29
          ? 0.85f
          : static_cast<float>(number_at(ConfigNumberIndex::kCrosshairOpacity));
  config.default_y_scale =
      number_count < 30 ? 1.0 : number_at(ConfigNumberIndex::kDefaultYScale);
  config.allow_y_axis_scale =
      number_count < 31 ? config.allow_zoom
                        : number_at(ConfigNumberIndex::kAllowYAxisScale) != 0;
  config.series_type = SeriesType::kCandlestick;
  if (number_count >= 32) {
    const double series_type = number_at(ConfigNumberIndex::kSeriesType);
    if (series_type == 1.0) {
      config.series_type = SeriesType::kBar;
    } else if (series_type == 2.0) {
      config.series_type = SeriesType::kHollowCandlestick;
    } else if (series_type == 4.0) {
      config.series_type = SeriesType::kLine;
    } else if (series_type == 5.0) {
      config.series_type = SeriesType::kArea;
    }
  }
  config.bar_line_width =
      number_count < 33
          ? config.display_scale
          : static_cast<float>(number_at(ConfigNumberIndex::kBarLineWidth));
  if (number_count >= 37) {
    const int source =
        static_cast<int>(number_at(ConfigNumberIndex::kLineSource));
    config.line_source = source == 0   ? OhlcValueSource::kOpen
                         : source == 1 ? OhlcValueSource::kHigh
                         : source == 2 ? OhlcValueSource::kLow
                                       : OhlcValueSource::kClose;
    config.line_width =
        static_cast<float>(number_at(ConfigNumberIndex::kLineWidth));
    config.line_gradient_enabled =
        number_at(ConfigNumberIndex::kLineGradientEnabled) != 0.0;
    config.line_gap_threshold_ms =
        number_at(ConfigNumberIndex::kLineGapThresholdMs);
  }
  if (number_count >
      static_cast<jsize>(ToIndex(ConfigNumberIndex::kCandleTimestamp))) {
    const int unit =
        static_cast<int>(number_at(ConfigNumberIndex::kResolutionUnit));
    config.resolution.unit = unit == 1   ? ResolutionUnit::kSecond
                             : unit == 2 ? ResolutionUnit::kMinute
                             : unit == 3 ? ResolutionUnit::kHour
                             : unit == 4 ? ResolutionUnit::kDay
                             : unit == 5 ? ResolutionUnit::kWeek
                             : unit == 6 ? ResolutionUnit::kMonth
                                         : ResolutionUnit::kFixed;
    config.resolution.multiplier = static_cast<std::uint32_t>(
        std::max(number_at(ConfigNumberIndex::kResolutionMultiplier), 1.0));
    config.resolution.fixed_duration_ms = static_cast<std::int64_t>(std::max(
        number_at(ConfigNumberIndex::kFixedResolutionDurationMs), 1.0));
    const int origin =
        static_cast<int>(number_at(ConfigNumberIndex::kBucketOrigin));
    config.trade_aggregation.bucket_origin =
        origin == 1   ? BucketOrigin::kSession
        : origin == 2 ? BucketOrigin::kTimestamp
                      : BucketOrigin::kEpoch;
    config.trade_aggregation.origin_timestamp_ms = static_cast<std::int64_t>(
        number_at(ConfigNumberIndex::kOriginTimestampMs));
    config.trade_aggregation.outside_session =
        number_at(ConfigNumberIndex::kOutsideSession) == 1.0
            ? OutsideSessionPolicy::kReject
            : OutsideSessionPolicy::kIgnore;
    config.trade_aggregation.candle_timestamp =
        number_at(ConfigNumberIndex::kCandleTimestamp) == 1.0
            ? CandleTimestampPolicy::kTradingDateUtc
            : CandleTimestampPolicy::kBucketStart;
  }
  if (number_count >
      static_cast<jsize>(ToIndex(ConfigNumberIndex::kLineDashed))) {
    config.line_dashed = number_at(ConfigNumberIndex::kLineDashed) != 0.0;
  }
  config.candle_radius =
      number_count >
              static_cast<jsize>(ToIndex(ConfigNumberIndex::kCandleRadius))
          ? static_cast<float>(number_at(ConfigNumberIndex::kCandleRadius))
          : 0.0f;
  config.background = color_at(ConfigColorIndex::kBackground);
  config.grid = color_at(ConfigColorIndex::kGrid);
  config.axis_text = color_at(ConfigColorIndex::kAxisText);
  config.up = color_at(ConfigColorIndex::kUp);
  config.down = color_at(ConfigColorIndex::kDown);
  config.crosshair = color_at(ConfigColorIndex::kCrosshair);
  config.tooltip_background = color_at(ConfigColorIndex::kTooltipBackground);
  config.tooltip_text = color_at(ConfigColorIndex::kTooltipText);
  if (color_count >= kExtendedConfigColorCount) {
    config.current_price_line_up =
        color_at(ConfigColorIndex::kCurrentPriceLineUp);
    config.current_price_line_down =
        color_at(ConfigColorIndex::kCurrentPriceLineDown);
    config.current_price_label_up =
        color_at(ConfigColorIndex::kCurrentPriceLabelUp);
    config.current_price_label_down =
        color_at(ConfigColorIndex::kCurrentPriceLabelDown);
  } else {
    config.current_price_line_up = config.up;
    config.current_price_line_down = config.down;
    config.current_price_label_up = config.up;
    config.current_price_label_down = config.down;
  }
  if (color_count >= kLineConfigColorCount) {
    config.line = color_at(ConfigColorIndex::kLine);
    config.line_gradient_top = color_at(ConfigColorIndex::kLineGradientTop);
    config.line_gradient_bottom =
        color_at(ConfigColorIndex::kLineGradientBottom);
  } else {
    config.line = config.up;
    config.line_gradient_top = config.line;
    config.line_gradient_bottom = config.line;
  }
  if (color_count >= kAreaConfigColorCount) {
    config.area_fill_top = color_at(ConfigColorIndex::kAreaFillTop);
    config.area_fill_bottom = color_at(ConfigColorIndex::kAreaFillBottom);
  }
  config.x_locale = StringAt(env, strings, 0, "en-GB");
  config.x_time_zone = StringAt(env, strings, 1, "UTC");
  config.y_locale = StringAt(env, strings, 2, "en-GB");
  config.currency_symbol = StringAt(env, strings, 3, "");
  instance->SetConfig(config);
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetTradingCalendar(
    JNIEnv* env, jclass, jlong handle, jboolean configured, jstring time_zone,
    jlong transition_range_end_ms, jlongArray transition_times,
    jintArray transition_offsets, jintArray sessions, jlongArray holiday_days,
    jlongArray override_days, jintArray override_session_offsets,
    jintArray override_sessions, jint week_starts_on) {
  ChartEngine* instance = EngineFromHandle(handle);
  if (!instance) {
    return;
  }
  const std::vector<jlong> times = CopyLongs(env, transition_times);
  const std::vector<jint> offsets = CopyInts(env, transition_offsets);
  const std::vector<jint> session_values = CopyInts(env, sessions);
  const std::vector<jlong> holidays = CopyLongs(env, holiday_days);
  const std::vector<jlong> override_dates = CopyLongs(env, override_days);
  const std::vector<jint> override_offsets =
      CopyInts(env, override_session_offsets);
  const std::vector<jint> override_values = CopyInts(env, override_sessions);
  constexpr size_t kSessionWidth = 5;
  constexpr size_t kOverrideSessionWidth = 4;
  if (times.size() != offsets.size() ||
      session_values.size() % kSessionWidth != 0 ||
      override_offsets.size() != override_dates.size() + 1 ||
      override_values.size() % kOverrideSessionWidth != 0) {
    return;
  }

  TradingCalendarConfig calendar;
  calendar.configured = configured == JNI_TRUE;
  calendar.time_zone = CopyString(env, time_zone);
  calendar.transition_range_start_ms = 0;
  calendar.transition_range_end_ms =
      static_cast<std::int64_t>(transition_range_end_ms);
  calendar.week_starts_on = week_starts_on == 7 ? 7 : 1;
  calendar.transitions.reserve(times.size());
  for (size_t index = 0; index < times.size(); ++index) {
    calendar.transitions.push_back(TimeZoneTransition{
        static_cast<std::int64_t>(times[index]),
        static_cast<int>(offsets[index]),
    });
  }
  calendar.sessions.reserve(session_values.size() / kSessionWidth);
  for (size_t index = 0; index < session_values.size();
       index += kSessionWidth) {
    calendar.sessions.push_back(TradingSessionConfig{
        static_cast<std::uint8_t>(session_values[index]),
        static_cast<int>(session_values[index + 1]),
        static_cast<int>(session_values[index + 2]),
        static_cast<int>(session_values[index + 3]),
        static_cast<int>(session_values[index + 4]),
    });
  }
  calendar.holidays.reserve(holidays.size());
  for (jlong day : holidays) {
    calendar.holidays.push_back(trading_charts::internal::CivilFromDays(
        static_cast<std::int64_t>(day)));
  }
  calendar.overrides.reserve(override_dates.size());
  for (size_t index = 0; index < override_dates.size(); ++index) {
    const int first = override_offsets[index];
    const int last = override_offsets[index + 1];
    const size_t session_count = override_values.size() / kOverrideSessionWidth;
    if (first < 0 || last < first ||
        static_cast<size_t>(last) > session_count) {
      return;
    }
    TradingCalendarOverrideConfig override_config;
    override_config.date = trading_charts::internal::CivilFromDays(
        static_cast<std::int64_t>(override_dates[index]));
    override_config.sessions.reserve(static_cast<size_t>(last - first));
    for (int session_index = first; session_index < last; ++session_index) {
      const size_t offset =
          static_cast<size_t>(session_index) * kOverrideSessionWidth;
      override_config.sessions.push_back(TradingSessionConfig{
          0,
          static_cast<int>(override_values[offset]),
          static_cast<int>(override_values[offset + 1]),
          static_cast<int>(override_values[offset + 2]),
          static_cast<int>(override_values[offset + 3]),
      });
    }
    calendar.overrides.push_back(std::move(override_config));
  }
  instance->SetTradingCalendar(calendar);
}

JNIEXPORT void JNICALL Java_com_tradingcharts_ChartEngineNative_nativeSetPanes(
    JNIEnv* env, jclass, jlong handle, jobjectArray strings,
    jdoubleArray numbers, jboolean resizable) {
  auto* instance = EngineFromHandle(handle);
  if (!instance || !strings || !numbers) {
    return;
  }
  constexpr jsize kNumberWidth = 8;
  const jsize pane_count = env->GetArrayLength(strings) / 2;
  if (env->GetArrayLength(numbers) < pane_count * kNumberWidth) {
    return;
  }
  const auto values = CopyDoubles(env, numbers);
  std::vector<PaneConfig> panes;
  panes.reserve(static_cast<size_t>(pane_count));
  for (jsize index = 0; index < pane_count; ++index) {
    const size_t offset =
        static_cast<size_t>(index) * static_cast<size_t>(kNumberWidth);
    PaneConfig pane;
    pane.pane_id = StringAt(env, strings, index * 2, "");
    pane.price_scale_id = StringAt(env, strings, index * 2 + 1, "");
    pane.height_weight = values[offset];
    pane.min_height = static_cast<float>(values[offset + 1]);
    pane.scale_visible = values[offset + 2] != 0.0;
    pane.scale_margin_top = values[offset + 3];
    pane.scale_margin_bottom = values[offset + 4];
    pane.volume_format = values[offset + 5] != 0.0;
    pane.precision = static_cast<int>(values[offset + 6]);
    pane.min_move = values[offset + 7];
    panes.push_back(std::move(pane));
  }
  instance->SetPanes(panes, resizable == JNI_TRUE);
}

JNIEXPORT jint JNICALL Java_com_tradingcharts_ChartEngineNative_nativeAddSeries(
    JNIEnv* env, jclass, jlong handle, jobjectArray strings,
    jdoubleArray numbers, jfloatArray colors) {
  auto* instance = EngineFromHandle(handle);
  if (!instance) {
    return 2;
  }
  SeriesTransportPayload payload;
  if (!ReadSeriesTransportPayload(env, strings, numbers, colors, &payload)) {
    return 2;
  }
  const auto number_at = [&](SeriesNumberIndex index) {
    return payload.numbers[ToIndex(index)];
  };
  const auto color_at = [&](SeriesColorIndex index) {
    const size_t offset = ToIndex(index);
    return Color{payload.colors[offset], payload.colors[offset + 1],
                 payload.colors[offset + 2], payload.colors[offset + 3]};
  };
  SeriesConfig series;
  series.series_id = payload.strings[ToIndex(SeriesStringIndex::kSeriesId)];
  series.pane_id = payload.strings[ToIndex(SeriesStringIndex::kPaneId)];
  series.price_scale_id =
      payload.strings[ToIndex(SeriesStringIndex::kPriceScaleId)];
  series.source_series_id =
      payload.strings[ToIndex(SeriesStringIndex::kSourceSeriesId)];
  const int type = static_cast<int>(number_at(SeriesNumberIndex::kType));
  if (type == 1) {
    series.type = SeriesType::kBar;
  } else if (type == 2) {
    series.type = SeriesType::kHollowCandlestick;
  } else if (type == 3) {
    series.type = SeriesType::kHistogram;
  } else if (type == 4) {
    series.type = SeriesType::kLine;
  } else if (type == 5) {
    series.type = SeriesType::kArea;
  }
  const double source_value = number_at(SeriesNumberIndex::kSource);
  series.source = source_value == 1.0   ? SeriesSource::kOhlcvVolume
                  : source_value == 2.0 ? SeriesSource::kOhlcvRsi
                  : source_value == 3.0 ? SeriesSource::kOhlcvSma
                  : source_value == 4.0 ? SeriesSource::kOhlcvEma
                  : source_value == 5.0 ? SeriesSource::kOhlcvMacd
                                        : SeriesSource::kData;
  series.visible = number_at(SeriesNumberIndex::kVisible) != 0.0;
  series.declarative = number_at(SeriesNumberIndex::kDeclarative) != 0.0;
  series.line_width =
      static_cast<float>(number_at(SeriesNumberIndex::kLineWidth));
  series.color = color_at(SeriesColorIndex::kColor);
  series.up = color_at(SeriesColorIndex::kUp);
  series.down = color_at(SeriesColorIndex::kDown);
  const int line_source =
      static_cast<int>(number_at(SeriesNumberIndex::kLineSource));
  series.line_source = line_source == 0   ? OhlcValueSource::kOpen
                       : line_source == 1 ? OhlcValueSource::kHigh
                       : line_source == 2 ? OhlcValueSource::kLow
                                          : OhlcValueSource::kClose;
  series.line_gradient_enabled =
      number_at(SeriesNumberIndex::kLineGradientEnabled) != 0.0;
  series.line_gap_threshold_ms =
      number_at(SeriesNumberIndex::kLineGapThresholdMs);
  series.line_gradient_top = color_at(SeriesColorIndex::kLineGradientTop);
  series.line_gradient_bottom = color_at(SeriesColorIndex::kLineGradientBottom);
  series.area_fill_top = color_at(SeriesColorIndex::kAreaFillTop);
  series.area_fill_bottom = color_at(SeriesColorIndex::kAreaFillBottom);
  series.rsi_period = static_cast<std::uint32_t>(
      std::max(number_at(SeriesNumberIndex::kRsiPeriod), 0.0));
  series.rsi_oversold = number_at(SeriesNumberIndex::kRsiOversold);
  series.rsi_overbought = number_at(SeriesNumberIndex::kRsiOverbought);
  series.rsi_level_line = color_at(SeriesColorIndex::kRsiLevelLine);
  series.rsi_band = color_at(SeriesColorIndex::kRsiBand);
  series.rsi_text_color_set =
      number_at(SeriesNumberIndex::kRsiTextColorSet) != 0.0;
  series.rsi_text_color = color_at(SeriesColorIndex::kRsiText);
  series.line_dashed = number_at(SeriesNumberIndex::kLineDashed) != 0.0;
  const double moving_average_period =
      number_at(SeriesNumberIndex::kMovingAveragePeriod);
  series.moving_average_period =
      std::isfinite(moving_average_period) && moving_average_period >= 1.0 &&
              moving_average_period <=
                  static_cast<double>(
                      std::numeric_limits<std::uint32_t>::max()) &&
              std::floor(moving_average_period) == moving_average_period
          ? static_cast<std::uint32_t>(moving_average_period)
          : 0;
  series.macd_fast_period = static_cast<std::uint32_t>(
      std::max(number_at(SeriesNumberIndex::kMacdFastPeriod), 0.0));
  series.macd_slow_period = static_cast<std::uint32_t>(
      std::max(number_at(SeriesNumberIndex::kMacdSlowPeriod), 0.0));
  series.macd_signal_period = static_cast<std::uint32_t>(
      std::max(number_at(SeriesNumberIndex::kMacdSignalPeriod), 0.0));
  series.macd_text_color_set =
      number_at(SeriesNumberIndex::kMacdTextColorSet) != 0.0;
  series.macd_signal_line_width =
      static_cast<float>(number_at(SeriesNumberIndex::kMacdSignalLineWidth));
  series.macd_signal_gradient_enabled =
      number_at(SeriesNumberIndex::kMacdSignalGradientEnabled) != 0.0;
  series.macd_signal_line_dashed =
      number_at(SeriesNumberIndex::kMacdSignalLineDashed) != 0.0;
  series.macd_signal_color = color_at(SeriesColorIndex::kMacdSignal);
  series.macd_signal_gradient_top =
      color_at(SeriesColorIndex::kMacdSignalGradientTop);
  series.macd_signal_gradient_bottom =
      color_at(SeriesColorIndex::kMacdSignalGradientBottom);
  series.macd_positive_increasing =
      color_at(SeriesColorIndex::kMacdPositiveIncreasing);
  series.macd_positive_decreasing =
      color_at(SeriesColorIndex::kMacdPositiveDecreasing);
  series.macd_negative_increasing =
      color_at(SeriesColorIndex::kMacdNegativeIncreasing);
  series.macd_negative_decreasing =
      color_at(SeriesColorIndex::kMacdNegativeDecreasing);
  series.macd_zero_line = color_at(SeriesColorIndex::kMacdZeroLine);
  series.macd_text_color = color_at(SeriesColorIndex::kMacdText);
  return StatusValue(instance->AddSeries(series));
}

JNIEXPORT jboolean JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeRemoveSeries(JNIEnv* env, jclass,
                                                            jlong handle,
                                                            jstring series_id) {
  auto* instance = EngineFromHandle(handle);
  return instance && instance->RemoveSeries(CopyString(env, series_id))
             ? JNI_TRUE
             : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetSeriesData(
    JNIEnv* env, jclass, jlong handle, jstring series_id, jboolean histogram,
    jdoubleArray values) {
  const auto data = CopyDoubles(env, values);
  auto* instance = EngineFromHandle(handle);
  return instance ? StatusValue(instance->SetSeriesData(
                        CopyString(env, series_id), data.data(), data.size(),
                        histogram == JNI_TRUE))
                  : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativePrependSeriesData(
    JNIEnv* env, jclass, jlong handle, jstring series_id, jboolean histogram,
    jdoubleArray values) {
  const auto data = CopyDoubles(env, values);
  auto* instance = EngineFromHandle(handle);
  return instance ? StatusValue(instance->PrependSeriesData(
                        CopyString(env, series_id), data.data(), data.size(),
                        histogram == JNI_TRUE))
                  : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateSeriesData(
    JNIEnv* env, jclass, jlong handle, jstring series_id, jboolean histogram,
    jdoubleArray values) {
  const auto data = CopyDoubles(env, values);
  auto* instance = EngineFromHandle(handle);
  return instance ? StatusValue(instance->UpdateSeriesData(
                        CopyString(env, series_id), data.data(), data.size(),
                        histogram == JNI_TRUE))
                  : 2;
}

JNIEXPORT jboolean JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetPaneHeight(
    JNIEnv* env, jclass, jlong handle, jstring pane_id, jdouble height_weight) {
  auto* instance = EngineFromHandle(handle);
  return instance && instance->SetPaneHeight(CopyString(env, pane_id),
                                             height_weight)
             ? JNI_TRUE
             : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_com_tradingcharts_ChartEngineNative_nativeSetSize(
    JNIEnv*, jclass, jlong handle, jfloat width, jfloat height) {
  if (auto* instance = EngineFromHandle(handle)) {
    instance->SetSize(width, height);
  }
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetHistory(JNIEnv* env, jclass,
                                                          jlong handle,
                                                          jdoubleArray values) {
  auto data = CopyDoubles(env, values);
  return EngineFromHandle(handle)
             ? StatusValue(EngineFromHandle(handle)->SetHistory(data.data(),
                                                                data.size()))
             : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativePrependHistory(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = CopyDoubles(env, values);
  return EngineFromHandle(handle)
             ? StatusValue(EngineFromHandle(handle)->PrependHistory(
                   data.data(), data.size()))
             : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateCandle(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = CopyDoubles(env, values);
  return EngineFromHandle(handle)
             ? StatusValue(EngineFromHandle(handle)->UpdateCandle(data.data(),
                                                                  data.size()))
             : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateTrade(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = CopyDoubles(env, values);
  return EngineFromHandle(handle)
             ? StatusValue(EngineFromHandle(handle)->UpdateTrade(data.data(),
                                                                 data.size()))
             : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateTrades(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = CopyDoubles(env, values);
  return EngineFromHandle(handle)
             ? StatusValue(EngineFromHandle(handle)->UpdateTrades(data.data(),
                                                                  data.size()))
             : 2;
}

JNIEXPORT void JNICALL Java_com_tradingcharts_ChartEngineNative_nativeClear(
    JNIEnv*, jclass, jlong handle) {
  if (auto* instance = EngineFromHandle(handle)) {
    instance->Clear();
  }
}

JNIEXPORT jboolean JNICALL Java_com_tradingcharts_ChartEngineNative_nativePan(
    JNIEnv*, jclass, jlong handle, jfloat delta) {
  if (auto* instance = EngineFromHandle(handle)) {
    return instance->Pan(delta) ? JNI_TRUE : JNI_FALSE;
  }
  return JNI_FALSE;
}

JNIEXPORT jboolean JNICALL Java_com_tradingcharts_ChartEngineNative_nativeZoom(
    JNIEnv*, jclass, jlong handle, jdouble scale, jfloat focus_x) {
  if (auto* instance = EngineFromHandle(handle)) {
    return instance->Zoom(scale, focus_x) ? JNI_TRUE : JNI_FALSE;
  }
  return JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeZoomAtRightEdge(JNIEnv*, jclass,
                                                               jlong handle,
                                                               jdouble scale) {
  if (auto* instance = EngineFromHandle(handle)) {
    instance->ZoomAtRightEdge(scale);
  }
}

JNIEXPORT jboolean JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeScaleY(JNIEnv*, jclass,
                                                      jlong handle,
                                                      jfloat delta) {
  if (auto* instance = EngineFromHandle(handle)) {
    return instance->ScaleY(delta) ? JNI_TRUE : JNI_FALSE;
  }
  return JNI_FALSE;
}

JNIEXPORT jboolean JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeScaleYAt(JNIEnv*, jclass,
                                                        jlong handle,
                                                        jfloat delta,
                                                        jfloat y) {
  if (auto* instance = EngineFromHandle(handle)) {
    return instance->ScaleYAt(delta, y) ? JNI_TRUE : JNI_FALSE;
  }
  return JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSeparatorAt(JNIEnv*, jclass,
                                                           jlong handle,
                                                           jfloat y,
                                                           jfloat hit_slop) {
  if (auto* instance = EngineFromHandle(handle)) {
    const auto index = instance->SeparatorAt(y, hit_slop);
    return index ? static_cast<jint>(*index) : -1;
  }
  return -1;
}

JNIEXPORT jboolean JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeResizePaneSeparator(
    JNIEnv*, jclass, jlong handle, jint separator_index, jfloat delta) {
  if (separator_index < 0) {
    return JNI_FALSE;
  }
  if (auto* instance = EngineFromHandle(handle)) {
    return instance->ResizePaneSeparator(static_cast<size_t>(separator_index),
                                         delta)
               ? JNI_TRUE
               : JNI_FALSE;
  }
  return JNI_FALSE;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeCandles(JNIEnv* env, jclass,
                                                       jlong handle) {
  std::vector<double> packed;
  if (auto* instance = EngineFromHandle(handle)) {
    const auto candles = instance->Candles();
    packed.reserve(candles.size() * 6);
    for (const auto& candle : candles) {
      packed.push_back(candle.timestamp);
      packed.push_back(candle.open);
      packed.push_back(candle.high);
      packed.push_back(candle.low);
      packed.push_back(candle.close);
      packed.push_back(candle.volume);
    }
  }
  jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(packed.size()));
  if (!packed.empty()) {
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(packed.size()),
                              packed.data());
  }
  return result;
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeFitContent(JNIEnv*, jclass,
                                                          jlong handle) {
  if (auto* instance = EngineFromHandle(handle)) {
    instance->FitContent();
  }
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetCrosshair(
    JNIEnv*, jclass, jlong handle, jboolean active, jfloat x, jfloat y) {
  if (auto* instance = EngineFromHandle(handle)) {
    instance->SetCrosshair(active, x, y);
  }
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeEngineRevision(JNIEnv*, jclass,
                                                              jlong handle) {
  if (auto* instance = EngineFromHandle(handle)) {
    return static_cast<jlong>(instance->Revision());
  }
  return 0;
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeAcquireSnapshot(JNIEnv*, jclass,
                                                               jlong handle) {
  if (auto* instance = EngineFromHandle(handle)) {
    return reinterpret_cast<jlong>(
        new std::shared_ptr<const RenderSnapshot>(instance->Snapshot()));
  }
  return 0;
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeReleaseSnapshot(JNIEnv*, jclass,
                                                               jlong handle) {
  delete SnapshotFromHandle(handle);
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotRevision(JNIEnv*, jclass,
                                                                jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  return holder && *holder ? static_cast<jlong>((*holder)->revision) : 0;
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotContentRevision(
    JNIEnv*, jclass, jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  return holder && *holder ? static_cast<jlong>((*holder)->content_revision)
                           : 0;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotContentVertexCount(
    JNIEnv*, jclass, jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const std::vector<float>* vertices = value && value->content_vertices
                                           ? value->content_vertices.get()
                                           : nullptr;
  const size_t count = vertices ? vertices->size() : 0;
  if (count >
      static_cast<size_t>(std::numeric_limits<jint>::max()) / sizeof(float)) {
    return -1;
  }
  return static_cast<jint>(count);
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeCopySnapshotContentVertices(
    JNIEnv* env, jclass, jlong handle, jobject target) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const std::vector<float>* vertices = value && value->content_vertices
                                           ? value->content_vertices.get()
                                           : nullptr;
  const size_t count = vertices ? vertices->size() : 0;
  if (count >
      static_cast<size_t>(std::numeric_limits<jint>::max()) / sizeof(float)) {
    return -1;
  }
  if (count == 0) {
    return 0;
  }
  if (!target) {
    return -1;
  }
  void* destination = env->GetDirectBufferAddress(target);
  const jlong capacity = env->GetDirectBufferCapacity(target);
  const size_t byte_count = count * sizeof(float);
  if (!destination || capacity < 0 ||
      static_cast<size_t>(capacity) < byte_count) {
    return -1;
  }
  std::memcpy(destination, vertices->data(), byte_count);
  return static_cast<jint>(count);
}

JNIEXPORT jfloatArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotOverlayVertices(
    JNIEnv* env, jclass, jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const jsize count =
      value ? static_cast<jsize>(value->overlay_vertices.size()) : 0;
  jfloatArray result = env->NewFloatArray(count);
  if (count > 0) {
    env->SetFloatArrayRegion(result, 0, count, value->overlay_vertices.data());
  }
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotXTicks(JNIEnv* env,
                                                              jclass,
                                                              jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const size_t count = value ? value->x_ticks.size() : 0;
  auto packed = VersionedRecordPayload(kTickRecordWidth, count);
  if (value) {
    for (size_t index = 0; index < count; ++index) {
      const size_t offset = RecordOffset(kTickRecordWidth, index);
      packed[offset + ToIndex(TickRecordIndex::kValue)] =
          value->x_ticks[index].value;
      packed[offset + ToIndex(TickRecordIndex::kPosition)] =
          value->x_ticks[index].position;
    }
  }
  return NewDoubleArray(env, packed);
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotYTicks(JNIEnv* env,
                                                              jclass,
                                                              jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const size_t count = value ? value->y_ticks.size() : 0;
  auto packed = VersionedRecordPayload(kTickRecordWidth, count);
  if (value) {
    for (size_t index = 0; index < count; ++index) {
      const size_t offset = RecordOffset(kTickRecordWidth, index);
      packed[offset + ToIndex(TickRecordIndex::kValue)] =
          value->y_ticks[index].value;
      packed[offset + ToIndex(TickRecordIndex::kPosition)] =
          value->y_ticks[index].position;
    }
  }
  return NewDoubleArray(env, packed);
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotPaneYTicks(
    JNIEnv* env, jclass, jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const size_t count = value ? value->pane_y_ticks.size() : 0;
  auto packed = VersionedRecordPayload(kTickRecordWidth, count);
  if (value) {
    for (size_t index = 0; index < count; ++index) {
      const size_t offset = RecordOffset(kTickRecordWidth, index);
      packed[offset + ToIndex(TickRecordIndex::kValue)] =
          value->pane_y_ticks[index].value;
      packed[offset + ToIndex(TickRecordIndex::kPosition)] =
          value->pane_y_ticks[index].position;
    }
  }
  return NewDoubleArray(env, packed);
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotPanes(JNIEnv* env,
                                                             jclass,
                                                             jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const size_t count = value ? value->panes.size() : 0;
  auto packed = VersionedRecordPayload(kPaneSnapshotRecordWidth, count);
  if (value) {
    for (size_t index = 0; index < count; ++index) {
      const auto& pane = value->panes[index];
      const size_t offset = RecordOffset(kPaneSnapshotRecordWidth, index);
      const auto set = [&](PaneSnapshotRecordIndex field, double field_value) {
        packed[offset + ToIndex(field)] = field_value;
      };
      set(PaneSnapshotRecordIndex::kPlotLeft, pane.plot.left);
      set(PaneSnapshotRecordIndex::kPlotTop, pane.plot.top);
      set(PaneSnapshotRecordIndex::kPlotRight, pane.plot.right);
      set(PaneSnapshotRecordIndex::kPlotBottom, pane.plot.bottom);
      set(PaneSnapshotRecordIndex::kHeightWeight, pane.height_weight);
      set(PaneSnapshotRecordIndex::kVisibleYMin, pane.visible_y_min);
      set(PaneSnapshotRecordIndex::kVisibleYMax, pane.visible_y_max);
      set(PaneSnapshotRecordIndex::kYAxisScale, pane.y_axis_scale);
      set(PaneSnapshotRecordIndex::kYTickOffset,
          static_cast<double>(pane.y_tick_offset));
      set(PaneSnapshotRecordIndex::kYTickCount,
          static_cast<double>(pane.y_tick_count));
      set(PaneSnapshotRecordIndex::kScaleVisible,
          pane.scale_visible ? 1.0 : 0.0);
      set(PaneSnapshotRecordIndex::kVolumeFormat,
          pane.volume_format ? 1.0 : 0.0);
      set(PaneSnapshotRecordIndex::kPrecision,
          static_cast<double>(pane.precision));
      set(PaneSnapshotRecordIndex::kRsiScale, pane.rsi_scale ? 1.0 : 0.0);
    }
  }
  return NewDoubleArray(env, packed);
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotIndicatorLegends(
    JNIEnv* env, jclass, jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const size_t count = value ? value->indicator_legends.size() : 0;
  auto packed = VersionedRecordPayload(kIndicatorLegendRecordWidth, count);
  if (value) {
    for (size_t index = 0; index < count; ++index) {
      const auto& legend = value->indicator_legends[index];
      const size_t offset = RecordOffset(kIndicatorLegendRecordWidth, index);
      const auto set = [&](IndicatorLegendRecordIndex field,
                           double field_value) {
        packed[offset + ToIndex(field)] = field_value;
      };
      set(IndicatorLegendRecordIndex::kPaneIndex,
          static_cast<double>(legend.pane_index));
      set(IndicatorLegendRecordIndex::kKind, static_cast<double>(legend.kind));
      set(IndicatorLegendRecordIndex::kPeriod,
          static_cast<double>(legend.period));
      set(IndicatorLegendRecordIndex::kFastPeriod,
          static_cast<double>(legend.fast_period));
      set(IndicatorLegendRecordIndex::kSlowPeriod,
          static_cast<double>(legend.slow_period));
      set(IndicatorLegendRecordIndex::kSignalPeriod,
          static_cast<double>(legend.signal_period));
      set(IndicatorLegendRecordIndex::kValueSource,
          static_cast<double>(legend.value_source));
      set(IndicatorLegendRecordIndex::kValueCount,
          static_cast<double>(legend.value_count));
      set(IndicatorLegendRecordIndex::kTextColorSet,
          legend.text_color_set ? 1.0 : 0.0);
      set(IndicatorLegendRecordIndex::kTextColorR, legend.text_color.r);
      set(IndicatorLegendRecordIndex::kTextColorG, legend.text_color.g);
      set(IndicatorLegendRecordIndex::kTextColorB, legend.text_color.b);
      set(IndicatorLegendRecordIndex::kTextColorA, legend.text_color.a);
      const size_t value_count =
          std::min(legend.value_count, kIndicatorLegendValueCapacity);
      for (size_t value_index = 0; value_index < value_count; ++value_index) {
        const auto& legend_value = legend.values[value_index];
        const size_t value_offset =
            offset + ToIndex(IndicatorLegendRecordIndex::kValues) +
            value_index * kIndicatorLegendValueRecordWidth;
        packed[value_offset] = legend_value.value;
        packed[value_offset + 1] = legend_value.has_value ? 1.0 : 0.0;
        packed[value_offset + 2] = legend_value.color.r;
        packed[value_offset + 3] = legend_value.color.g;
        packed[value_offset + 4] = legend_value.color.b;
        packed[value_offset + 5] = legend_value.color.a;
      }
    }
  }
  return NewDoubleArray(env, packed);
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotActivePane(
    JNIEnv*, jclass, jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  return value ? static_cast<jint>(value->active_pane_index) : 0;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotMeta(JNIEnv* env, jclass,
                                                            jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* snapshot = holder && *holder ? holder->get() : nullptr;
  std::array<jdouble, kSnapshotMetaCount> meta{};
  const auto set_meta = [&](SnapshotMetaIndex index, double value) {
    meta[ToIndex(index)] = value;
  };
  set_meta(SnapshotMetaIndex::kAbiVersion, kChartEngineTransportAbiVersion);
  set_meta(SnapshotMetaIndex::kPayloadSize,
           static_cast<double>(kSnapshotMetaCount));
  if (snapshot) {
    set_meta(SnapshotMetaIndex::kWidth, snapshot->width);
    set_meta(SnapshotMetaIndex::kHeight, snapshot->height);
    set_meta(SnapshotMetaIndex::kPlotLeft, snapshot->plot.left);
    set_meta(SnapshotMetaIndex::kPlotTop, snapshot->plot.top);
    set_meta(SnapshotMetaIndex::kPlotRight, snapshot->plot.right);
    set_meta(SnapshotMetaIndex::kPlotBottom, snapshot->plot.bottom);
    set_meta(SnapshotMetaIndex::kVisibleXMin, snapshot->visible_x_min);
    set_meta(SnapshotMetaIndex::kVisibleXMax, snapshot->visible_x_max);
    set_meta(SnapshotMetaIndex::kVisibleYMin, snapshot->visible_y_min);
    set_meta(SnapshotMetaIndex::kVisibleYMax, snapshot->visible_y_max);
    set_meta(SnapshotMetaIndex::kCurrentPriceVisible,
             snapshot->current_price_visible ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kCurrentPrice, snapshot->current_price);
    set_meta(SnapshotMetaIndex::kCurrentPriceY, snapshot->current_price_y);
    set_meta(SnapshotMetaIndex::kCurrentPriceColorR,
             snapshot->current_price_color.r);
    set_meta(SnapshotMetaIndex::kCurrentPriceColorG,
             snapshot->current_price_color.g);
    set_meta(SnapshotMetaIndex::kCurrentPriceColorB,
             snapshot->current_price_color.b);
    set_meta(SnapshotMetaIndex::kCurrentPriceColorA,
             snapshot->current_price_color.a);
    set_meta(SnapshotMetaIndex::kCrosshairVisible,
             snapshot->crosshair_visible ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kCrosshairX, snapshot->crosshair_x);
    set_meta(SnapshotMetaIndex::kCrosshairY, snapshot->crosshair_y);
    set_meta(SnapshotMetaIndex::kCrosshairPrice, snapshot->crosshair_price);
    set_meta(SnapshotMetaIndex::kSelectedTimestamp,
             snapshot->selected_candle.timestamp);
    set_meta(SnapshotMetaIndex::kSelectedOpen, snapshot->selected_candle.open);
    set_meta(SnapshotMetaIndex::kSelectedHigh, snapshot->selected_candle.high);
    set_meta(SnapshotMetaIndex::kSelectedLow, snapshot->selected_candle.low);
    set_meta(SnapshotMetaIndex::kSelectedClose,
             snapshot->selected_candle.close);
    set_meta(SnapshotMetaIndex::kSelectedVolume,
             snapshot->selected_candle.volume);
    set_meta(SnapshotMetaIndex::kFirstVisibleIndex,
             static_cast<double>(snapshot->first_visible_index));
    set_meta(SnapshotMetaIndex::kLastVisibleIndex,
             static_cast<double>(snapshot->last_visible_index));
    set_meta(SnapshotMetaIndex::kTotalCandleCount,
             static_cast<double>(snapshot->total_candle_count));
    set_meta(SnapshotMetaIndex::kHasVisibleCandles,
             snapshot->has_visible_candles ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kVisibleMaximumVisible,
             snapshot->visible_maximum.visible ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kVisibleMaximumValue,
             snapshot->visible_maximum.value);
    set_meta(SnapshotMetaIndex::kVisibleMaximumX, snapshot->visible_maximum.x);
    set_meta(SnapshotMetaIndex::kVisibleMaximumY, snapshot->visible_maximum.y);
    set_meta(SnapshotMetaIndex::kVisibleMaximumLabelOnRight,
             snapshot->visible_maximum.label_on_right ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kVisibleMinimumVisible,
             snapshot->visible_minimum.visible ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kVisibleMinimumValue,
             snapshot->visible_minimum.value);
    set_meta(SnapshotMetaIndex::kVisibleMinimumX, snapshot->visible_minimum.x);
    set_meta(SnapshotMetaIndex::kVisibleMinimumY, snapshot->visible_minimum.y);
    set_meta(SnapshotMetaIndex::kVisibleMinimumLabelOnRight,
             snapshot->visible_minimum.label_on_right ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kSelectedChange, snapshot->selected_change);
    set_meta(SnapshotMetaIndex::kSelectedChangePercent,
             snapshot->selected_change_percent);
    set_meta(SnapshotMetaIndex::kSelectedAmplitudePercent,
             snapshot->selected_amplitude_percent);
    set_meta(SnapshotMetaIndex::kSelectedPercentagesValid,
             snapshot->selected_percentages_valid ? 1.0 : 0.0);
    set_meta(SnapshotMetaIndex::kCurrentPriceLabelColorR,
             snapshot->current_price_label_color.r);
    set_meta(SnapshotMetaIndex::kCurrentPriceLabelColorG,
             snapshot->current_price_label_color.g);
    set_meta(SnapshotMetaIndex::kCurrentPriceLabelColorB,
             snapshot->current_price_label_color.b);
    set_meta(SnapshotMetaIndex::kCurrentPriceLabelColorA,
             snapshot->current_price_label_color.a);
    set_meta(SnapshotMetaIndex::kHorizontalScale, snapshot->horizontal_scale);
    set_meta(SnapshotMetaIndex::kYAxisScale, snapshot->y_axis_scale);
  }
  jdoubleArray result =
      env->NewDoubleArray(static_cast<jsize>(kSnapshotMetaCount));
  env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(kSnapshotMetaCount),
                            meta.data());
  return result;
}

}  // extern "C"
