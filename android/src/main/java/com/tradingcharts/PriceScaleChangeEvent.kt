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

  // Already coalesced per scale by the view. React's shared event key would
  // otherwise merge changes belonging to different panes.
  override fun canCoalesce(): Boolean = false

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
