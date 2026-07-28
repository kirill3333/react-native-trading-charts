package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

@Suppress("LongParameterList")
internal class PaneResizeEvent(
    surfaceId: Int,
    viewId: Int,
    private val firstPaneId: String,
    private val firstHeightWeight: Double,
    private val secondPaneId: String,
    private val secondHeightWeight: Double,
    private val finished: Boolean,
) : Event<PaneResizeEvent>(surfaceId, viewId) {
  override fun getEventName(): String = EVENT_NAME

  override fun canCoalesce(): Boolean = !finished

  override fun getCoalescingKey(): Short = 0

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putString("firstPaneId", firstPaneId)
        putDouble("firstHeightWeight", firstHeightWeight)
        putString("secondPaneId", secondPaneId)
        putDouble("secondHeightWeight", secondHeightWeight)
        putBoolean("finished", finished)
      }

  companion object {
    const val EVENT_NAME = "topPaneResize"
  }
}
