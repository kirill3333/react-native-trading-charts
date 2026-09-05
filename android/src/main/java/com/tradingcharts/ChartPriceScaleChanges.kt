package com.tradingcharts

internal data class ChartPriceScaleChange(
    val paneId: String,
    val priceScaleId: String,
    val scale: Double,
    val isMainPane: Boolean,
)

// Reused per view. These small output arrays carry ScaleYResult across JNI;
// they are independent of the snapshot's positional ABI.
internal class ChartScaleYResult {
  val numbers = DoubleArray(NUMBER_COUNT)
  val strings = arrayOf("", "")

  fun priceScaleChange(): ChartPriceScaleChange? =
      if (numbers[SCALE_CHANGED] == 0.0) null
      else
          ChartPriceScaleChange(
              strings[PANE_ID],
              strings[PRICE_SCALE_ID],
              numbers[SCALE],
              numbers[IS_MAIN_PANE] != 0.0,
          )

  companion object {
    const val SCALE_CHANGED = 0
    const val SCALE = 1
    const val IS_MAIN_PANE = 2
    const val NUMBER_COUNT = 3
    const val PANE_ID = 0
    const val PRICE_SCALE_ID = 1
  }
}

internal class ChartPriceScaleChanges {
  private val changes = mutableListOf<ChartPriceScaleChange>()

  val isPending: Boolean
    get() = changes.isNotEmpty()

  fun record(change: ChartPriceScaleChange?) {
    if (change == null) return
    val index = changes.indexOfFirst {
      it.paneId == change.paneId && it.priceScaleId == change.priceScaleId
    }
    if (index >= 0) changes[index] = change else changes.add(change)
  }

  fun clear() = changes.clear()

  fun emit(mainScale: (Double) -> Unit, priceScale: (ChartPriceScaleChange) -> Unit) {
    if (changes.isEmpty()) return
    val pending = changes.toList()
    clear()
    for (change in pending) {
      if (change.isMainPane) mainScale(change.scale)
      priceScale(change)
    }
  }
}
