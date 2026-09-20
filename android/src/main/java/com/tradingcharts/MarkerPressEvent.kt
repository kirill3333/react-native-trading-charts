package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class MarkerPressEvent(
    surfaceId: Int,
    viewId: Int,
    private val chartId: String,
    private val markerJson: String,
    private val x: Double,
    private val y: Double,
) : Event<MarkerPressEvent>(surfaceId, viewId) {
  override fun getEventName(): String = "topMarkerPress"

  override fun canCoalesce(): Boolean = false

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putString("chartId", chartId)
        putString("markerJson", markerJson)
        putDouble("x", x)
        putDouble("y", y)
      }
}
