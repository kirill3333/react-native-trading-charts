// Copyright 2026 The React Native Trading Charts Authors
// SPDX-License-Identifier: MIT

#include <jni.h>

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "cpp/chart_engine.h"

using trading_charts::ChartConfig;
using trading_charts::ChartEngine;
using trading_charts::Color;
using trading_charts::RenderSnapshot;
using trading_charts::UpdateStatus;

namespace {

template <typename Enum>
constexpr size_t ToIndex(Enum value) {
  return static_cast<size_t>(value);
}

enum class ConfigNumberIndex : std::uint8_t {
  kTimeframeMs,
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
};

enum class SnapshotMetaIndex : std::uint8_t {
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
inline constexpr jsize kColorChannelCount = 4;
inline constexpr size_t kConfigNumberCount = ToIndex(ConfigNumberIndex::kCount);
inline constexpr size_t kSnapshotMetaCount = ToIndex(SnapshotMetaIndex::kCount);

static_assert(kConfigNumberCount == 31);
static_assert(kSnapshotMetaCount == 51);
static_assert(ToIndex(ConfigColorIndex::kCurrentPriceLabelDown) +
                  kColorChannelCount ==
              kExtendedConfigColorCount);

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

}  // namespace

extern "C" {

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
  std::array<jfloat, kExtendedConfigColorCount> config_colors{};
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
  config.timeframe_ms = number_at(ConfigNumberIndex::kTimeframeMs);
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
  config.x_locale = StringAt(env, strings, 0, "en-GB");
  config.x_time_zone = StringAt(env, strings, 1, "UTC");
  config.y_locale = StringAt(env, strings, 2, "en-GB");
  config.currency_symbol = StringAt(env, strings, 3, "");
  instance->SetConfig(config);
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

JNIEXPORT jfloatArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotVertices(JNIEnv* env,
                                                                jclass,
                                                                jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const jsize count = value ? static_cast<jsize>(value->vertices.size()) : 0;
  jfloatArray result = env->NewFloatArray(count);
  if (count > 0) {
    env->SetFloatArrayRegion(result, 0, count, value->vertices.data());
  }
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotXTicks(JNIEnv* env,
                                                              jclass,
                                                              jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  std::vector<double> packed;
  if (value) {
    packed.reserve(value->x_ticks.size() * 2);
    for (const auto& tick : value->x_ticks) {
      packed.push_back(tick.value);
      packed.push_back(tick.position);
    }
  }
  jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(packed.size()));
  if (!packed.empty()) {
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(packed.size()),
                              packed.data());
  }
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotYTicks(JNIEnv* env,
                                                              jclass,
                                                              jlong handle) {
  auto* holder = SnapshotFromHandle(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  std::vector<double> packed;
  if (value) {
    packed.reserve(value->y_ticks.size() * 2);
    for (const auto& tick : value->y_ticks) {
      packed.push_back(tick.value);
      packed.push_back(tick.position);
    }
  }
  jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(packed.size()));
  if (!packed.empty()) {
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(packed.size()),
                              packed.data());
  }
  return result;
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
