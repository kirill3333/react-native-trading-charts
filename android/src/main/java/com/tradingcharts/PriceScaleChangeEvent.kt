package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class PriceScaleChangeEvent(
    surfaceId: Int,
    viewId: Int,
    private val paneId: String,
    private val priceScaleId: String,
    private val scale: Double,
) : Event<PriceScaleChangeEvent>(surfaceId, viewId) {
  override fun getEventName(): String = EVENT_NAME

  override fun canCoalesce(): Boolean = true

  override fun getCoalescingKey(): Short = 0

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putString("paneId", paneId)
        putString("priceScaleId", priceScaleId)
        putDouble("scale", scale)
      }

  companion object {
    const val EVENT_NAME = "topPriceScaleChange"
  }
}
