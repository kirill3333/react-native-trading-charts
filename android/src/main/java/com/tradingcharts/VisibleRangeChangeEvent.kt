package com.tradingcharts

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

internal class VisibleRangeChangeEvent(
    surfaceId: Int,
    viewId: Int,
    private val snapshot: ChartSnapshot,
) : Event<VisibleRangeChangeEvent>(surfaceId, viewId) {
  override fun getEventName(): String = EVENT_NAME

  override fun canCoalesce(): Boolean = true

  override fun getCoalescingKey(): Short = 0

  override fun getEventData(): WritableMap =
      Arguments.createMap().apply {
        putDouble("from", snapshot.visibleXMin)
        putDouble("to", snapshot.visibleXMax)
        putInt("firstVisibleIndex", snapshot.firstVisibleIndex)
        putInt("lastVisibleIndex", snapshot.lastVisibleIndex)
        putInt("totalCount", snapshot.totalCandleCount)
        putBoolean("atStart", snapshot.firstVisibleIndex == 0)
        putBoolean("atEnd", snapshot.lastVisibleIndex == snapshot.totalCandleCount - 1)
      }

  companion object {
    const val EVENT_NAME = "topVisibleRangeChange"
  }
}
