package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class SelectedCandleChangeEvent(
  surfaceId: Int,
  viewId: Int,
  private val active: Boolean,
  private val candle: DoubleArray,
) : Event<SelectedCandleChangeEvent>(surfaceId, viewId) {
  override fun getEventName(): String = EVENT_NAME

  override fun canCoalesce(): Boolean = true

  override fun getCoalescingKey(): Short = (if (active) 1 else 0).toShort()

  override fun getEventData(): WritableMap = Arguments.createMap().apply {
    putBoolean("active", active)
    putDouble("timestamp", candle.getOrElse(0) { 0.0 })
    putDouble("open", candle.getOrElse(1) { 0.0 })
    putDouble("high", candle.getOrElse(2) { 0.0 })
    putDouble("low", candle.getOrElse(3) { 0.0 })
    putDouble("close", candle.getOrElse(4) { 0.0 })
    putDouble("volume", candle.getOrElse(5) { 0.0 })
  }

  companion object {
    const val EVENT_NAME = "topSelectedCandleChange"
  }
}
