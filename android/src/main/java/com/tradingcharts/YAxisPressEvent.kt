package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

@Suppress("LongParameterList")
internal class YAxisPressEvent(
    surfaceId: Int,
    viewId: Int,
    private val x: Double,
    private val y: Double,
    private val price: Double,
    private val paneId: String,
    private val priceScaleId: String,
) : Event<YAxisPressEvent>(surfaceId, viewId) {
  override fun getEventName(): String = EVENT_NAME

  override fun canCoalesce(): Boolean = false

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putDouble("x", x)
        putDouble("y", y)
        putDouble("price", price)
        putString("paneId", paneId)
        putString("priceScaleId", priceScaleId)
      }

  companion object {
    const val EVENT_NAME = "topYAxisPress"
  }
}
