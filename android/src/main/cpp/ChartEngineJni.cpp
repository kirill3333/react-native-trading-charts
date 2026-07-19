#include <jni.h>

#include <memory>
#include <string>
#include <vector>

#include "ChartEngine.h"

using tradingcharts::ChartConfig;
using tradingcharts::ChartEngine;
using tradingcharts::Color;
using tradingcharts::RenderSnapshot;
using tradingcharts::UpdateStatus;

namespace {

ChartEngine* engine(jlong handle) {
  return reinterpret_cast<ChartEngine*>(handle);
}

std::shared_ptr<const RenderSnapshot>* snapshot(jlong handle) {
  return reinterpret_cast<std::shared_ptr<const RenderSnapshot>*>(handle);
}

int statusValue(UpdateStatus status) {
  switch (status) {
    case UpdateStatus::Applied: return 0;
    case UpdateStatus::IgnoredOldTimestamp: return 1;
    case UpdateStatus::InvalidInput: return 2;
  }
  return 2;
}

std::vector<double> doubles(JNIEnv* env, jdoubleArray values) {
  if (!values) return {};
  const jsize count = env->GetArrayLength(values);
  std::vector<double> result(static_cast<size_t>(count));
  env->GetDoubleArrayRegion(values, 0, count, result.data());
  return result;
}

std::string stringAt(JNIEnv* env, jobjectArray values, jsize index, const char* fallback) {
  if (!values || index >= env->GetArrayLength(values)) return fallback;
  auto value = static_cast<jstring>(env->GetObjectArrayElement(values, index));
  if (!value) return fallback;
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string result = chars ? chars : fallback;
  if (chars) env->ReleaseStringUTFChars(value, chars);
  env->DeleteLocalRef(value);
  return result;
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeCreate(JNIEnv*, jclass) {
  return reinterpret_cast<jlong>(new ChartEngine());
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeDestroy(JNIEnv*, jclass, jlong handle) {
  delete engine(handle);
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetConfig(
    JNIEnv* env,
    jclass,
    jlong handle,
    jdoubleArray numbers,
    jfloatArray colors,
    jobjectArray strings) {
  ChartEngine* instance = engine(handle);
  if (!instance || !numbers || env->GetArrayLength(numbers) < 22 ||
      !colors || env->GetArrayLength(colors) < 32) return;
  const jsize numberCount = env->GetArrayLength(numbers);
  jdouble n[27] = {};
  jfloat c[32];
  env->GetDoubleArrayRegion(numbers, 0, 22, n);
  if (numberCount >= 23) env->GetDoubleArrayRegion(numbers, 22, 1, n + 22);
  if (numberCount >= 24) env->GetDoubleArrayRegion(numbers, 23, 1, n + 23);
  if (numberCount >= 25) env->GetDoubleArrayRegion(numbers, 24, 1, n + 24);
  if (numberCount >= 26) env->GetDoubleArrayRegion(numbers, 25, 1, n + 25);
  if (numberCount >= 27) env->GetDoubleArrayRegion(numbers, 26, 1, n + 26);
  env->GetFloatArrayRegion(colors, 0, 32, c);
  auto colorAt = [&](int offset) {
    return Color{c[offset], c[offset + 1], c[offset + 2], c[offset + 3]};
  };
  ChartConfig config;
  config.timeframeMs = n[0];
  config.initialVisibleCount = static_cast<int>(n[1]);
  config.showXAxis = n[2] != 0;
  config.xAxisHeight = static_cast<float>(n[3]);
  config.showSeconds = n[4] != 0;
  config.showYAxis = n[5] != 0;
  config.yAxisOnRight = n[6] != 0;
  config.yAxisWidth = static_cast<float>(n[7]);
  config.compactValues = n[8] != 0;
  config.precision = static_cast<int>(n[9]);
  config.minMove = n[10];
  config.useGrouping = n[11] != 0;
  config.allowPan = n[12] != 0;
  config.allowZoom = n[13] != 0;
  config.showCurrentPrice = n[14] != 0;
  config.showCurrentPriceLabel = n[15] != 0;
  config.crosshairEnabled = n[16] != 0;
  config.showTooltip = n[17] != 0;
  config.yScaleMarginTop = n[18];
  config.yScaleMarginBottom = n[19];
  config.displayScale = static_cast<float>(n[20]);
  config.logicalSpacing = n[21] != 0;
  config.pinCurrentPriceToEdge = numberCount < 23 || n[22] != 0;
  config.showPriceExtremes = numberCount < 24 || n[23] != 0;
  config.defaultScale = numberCount < 25 ? 1.0 : n[24];
  config.crosshairDashed = numberCount >= 26 && n[25] != 0;
  config.tooltipBackgroundOpacity =
      numberCount < 27 ? 1.0f : static_cast<float>(n[26]);
  config.background = colorAt(0);
  config.grid = colorAt(4);
  config.axisText = colorAt(8);
  config.up = colorAt(12);
  config.down = colorAt(16);
  config.crosshair = colorAt(20);
  config.tooltipBackground = colorAt(24);
  config.tooltipText = colorAt(28);
  config.xLocale = stringAt(env, strings, 0, "en-GB");
  config.xTimeZone = stringAt(env, strings, 1, "UTC");
  config.yLocale = stringAt(env, strings, 2, "en-GB");
  config.currencySymbol = stringAt(env, strings, 3, "");
  instance->setConfig(config);
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetSize(
    JNIEnv*, jclass, jlong handle, jfloat width, jfloat height) {
  if (auto* instance = engine(handle)) instance->setSize(width, height);
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetHistory(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = doubles(env, values);
  return engine(handle) ? statusValue(engine(handle)->setHistory(data.data(), data.size())) : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativePrependHistory(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = doubles(env, values);
  return engine(handle) ? statusValue(engine(handle)->prependHistory(data.data(), data.size())) : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateCandle(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = doubles(env, values);
  return engine(handle) ? statusValue(engine(handle)->updateCandle(data.data(), data.size())) : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateTrade(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = doubles(env, values);
  return engine(handle) ? statusValue(engine(handle)->updateTrade(data.data(), data.size())) : 2;
}

JNIEXPORT jint JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeUpdateTrades(
    JNIEnv* env, jclass, jlong handle, jdoubleArray values) {
  auto data = doubles(env, values);
  return engine(handle) ? statusValue(engine(handle)->updateTrades(data.data(), data.size())) : 2;
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeClear(JNIEnv*, jclass, jlong handle) {
  if (auto* instance = engine(handle)) instance->clear();
}

JNIEXPORT jboolean JNICALL
Java_com_tradingcharts_ChartEngineNative_nativePan(JNIEnv*, jclass, jlong handle, jfloat delta) {
  if (auto* instance = engine(handle)) {
    return instance->pan(delta) ? JNI_TRUE : JNI_FALSE;
  }
  return JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeZoom(
    JNIEnv*, jclass, jlong handle, jdouble scale, jfloat focusX) {
  if (auto* instance = engine(handle)) instance->zoom(scale, focusX);
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeZoomAtRightEdge(
    JNIEnv*, jclass, jlong handle, jdouble scale) {
  if (auto* instance = engine(handle)) instance->zoomAtRightEdge(scale);
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeScaleY(
    JNIEnv*, jclass, jlong handle, jfloat delta) {
  if (auto* instance = engine(handle)) instance->scaleY(delta);
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeResetViewport(JNIEnv*, jclass, jlong handle) {
  if (auto* instance = engine(handle)) instance->resetViewport();
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeFitContent(JNIEnv*, jclass, jlong handle) {
  if (auto* instance = engine(handle)) instance->fitContent();
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSetCrosshair(
    JNIEnv*, jclass, jlong handle, jboolean active, jfloat x, jfloat y) {
  if (auto* instance = engine(handle)) instance->setCrosshair(active, x, y);
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeAcquireSnapshot(JNIEnv*, jclass, jlong handle) {
  if (auto* instance = engine(handle)) {
    return reinterpret_cast<jlong>(
        new std::shared_ptr<const RenderSnapshot>(instance->snapshot()));
  }
  return 0;
}

JNIEXPORT void JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeReleaseSnapshot(JNIEnv*, jclass, jlong handle) {
  delete snapshot(handle);
}

JNIEXPORT jlong JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotRevision(JNIEnv*, jclass, jlong handle) {
  auto* holder = snapshot(handle);
  return holder && *holder ? static_cast<jlong>((*holder)->revision) : 0;
}

JNIEXPORT jfloatArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotVertices(JNIEnv* env, jclass, jlong handle) {
  auto* holder = snapshot(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  const jsize count = value ? static_cast<jsize>(value->vertices.size()) : 0;
  jfloatArray result = env->NewFloatArray(count);
  if (count > 0) env->SetFloatArrayRegion(result, 0, count, value->vertices.data());
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotXTicks(JNIEnv* env, jclass, jlong handle) {
  auto* holder = snapshot(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  std::vector<double> packed;
  if (value) {
    packed.reserve(value->xTicks.size() * 2);
    for (const auto& tick : value->xTicks) {
      packed.push_back(tick.value);
      packed.push_back(tick.position);
    }
  }
  jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(packed.size()));
  if (!packed.empty()) env->SetDoubleArrayRegion(result, 0, packed.size(), packed.data());
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotYTicks(JNIEnv* env, jclass, jlong handle) {
  auto* holder = snapshot(handle);
  const auto* value = holder && *holder ? holder->get() : nullptr;
  std::vector<double> packed;
  if (value) {
    packed.reserve(value->yTicks.size() * 2);
    for (const auto& tick : value->yTicks) {
      packed.push_back(tick.value);
      packed.push_back(tick.position);
    }
  }
  jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(packed.size()));
  if (!packed.empty()) env->SetDoubleArrayRegion(result, 0, packed.size(), packed.data());
  return result;
}

JNIEXPORT jdoubleArray JNICALL
Java_com_tradingcharts_ChartEngineNative_nativeSnapshotMeta(JNIEnv* env, jclass, jlong handle) {
  auto* holder = snapshot(handle);
  const auto* s = holder && *holder ? holder->get() : nullptr;
  double m[45] = {};
  if (s) {
    m[0] = s->width;
    m[1] = s->height;
    m[2] = s->plot.left;
    m[3] = s->plot.top;
    m[4] = s->plot.right;
    m[5] = s->plot.bottom;
    m[6] = s->visibleXMin;
    m[7] = s->visibleXMax;
    m[8] = s->visibleYMin;
    m[9] = s->visibleYMax;
    m[10] = s->currentPriceVisible ? 1.0 : 0.0;
    m[11] = s->currentPrice;
    m[12] = s->currentPriceY;
    m[13] = s->currentPriceColor.r;
    m[14] = s->currentPriceColor.g;
    m[15] = s->currentPriceColor.b;
    m[16] = s->currentPriceColor.a;
    m[17] = s->crosshairVisible ? 1.0 : 0.0;
    m[18] = s->crosshairX;
    m[19] = s->crosshairY;
    m[20] = s->crosshairPrice;
    m[21] = s->selectedCandle.timestamp;
    m[22] = s->selectedCandle.open;
    m[23] = s->selectedCandle.high;
    m[24] = s->selectedCandle.low;
    m[25] = s->selectedCandle.close;
    m[26] = s->selectedCandle.volume;
    m[27] = static_cast<double>(s->firstVisibleIndex);
    m[28] = static_cast<double>(s->lastVisibleIndex);
    m[29] = static_cast<double>(s->totalCandleCount);
    m[30] = s->hasVisibleCandles ? 1.0 : 0.0;
    m[31] = s->visibleMaximum.visible ? 1.0 : 0.0;
    m[32] = s->visibleMaximum.value;
    m[33] = s->visibleMaximum.x;
    m[34] = s->visibleMaximum.y;
    m[35] = s->visibleMaximum.labelOnRight ? 1.0 : 0.0;
    m[36] = s->visibleMinimum.visible ? 1.0 : 0.0;
    m[37] = s->visibleMinimum.value;
    m[38] = s->visibleMinimum.x;
    m[39] = s->visibleMinimum.y;
    m[40] = s->visibleMinimum.labelOnRight ? 1.0 : 0.0;
    m[41] = s->selectedChange;
    m[42] = s->selectedChangePercent;
    m[43] = s->selectedAmplitudePercent;
    m[44] = s->selectedPercentagesValid ? 1.0 : 0.0;
  }
  jdoubleArray result = env->NewDoubleArray(45);
  env->SetDoubleArrayRegion(result, 0, 45, m);
  return result;
}

}  // extern "C"
