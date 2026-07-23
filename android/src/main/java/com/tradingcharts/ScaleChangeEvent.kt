package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class ScaleChangeEvent(
    surfaceId: Int,
    viewId: Int,
    private val nativeEventName: String,
    private val scale: Double,
) : Event<ScaleChangeEvent>(surfaceId, viewId) {
  override fun getEventName(): String = nativeEventName

  override fun canCoalesce(): Boolean = true

  override fun getCoalescingKey(): Short = 0

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putDouble("scale", scale)
      }

  companion object {
    const val HORIZONTAL_EVENT_NAME = "topScaleChange"
    const val Y_AXIS_EVENT_NAME = "topYAxisScaleChange"
  }
}
