package com.tradingcharts

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.lang.ref.WeakReference

internal object TradingChartsRegistry {
  private sealed interface Command {
    val values: DoubleArray
    data class History(override val values: DoubleArray) : Command
    data class Candle(override val values: DoubleArray) : Command
    data class Trade(override val values: DoubleArray) : Command
    data class Trades(override val values: DoubleArray) : Command
  }

  private data class Entry(
    var view: WeakReference<TradingChartsView>? = null,
    val pending: MutableList<Command> = mutableListOf(),
  )

  private val handler = Handler(Looper.getMainLooper())
  private val entries = mutableMapOf<String, Entry>()

  fun register(view: TradingChartsView, chartId: String) = onMain {
    val entry = entries.getOrPut(chartId) { Entry() }
    val current = entry.view?.get()
    if (current != null && current !== view) {
      Log.w("TradingCharts", "Duplicate chartId '$chartId'; newest view receives updates")
    }
    entry.view = WeakReference(view)
    entry.pending.toList().forEach { apply(view, it) }
    entry.pending.clear()
  }

  fun unregister(view: TradingChartsView, chartId: String) = onMain {
    val entry = entries[chartId] ?: return@onMain
    if (entry.view?.get() === view) entry.view = null
    if (entry.view?.get() == null && entry.pending.isEmpty()) entries.remove(chartId)
  }

  fun setHistory(chartId: String, values: DoubleArray) = enqueue(chartId, Command.History(values.copyOf()))
  fun updateCandle(chartId: String, values: DoubleArray) = enqueue(chartId, Command.Candle(values.copyOf()))
  fun updateTrade(chartId: String, values: DoubleArray) = enqueue(chartId, Command.Trade(values.copyOf()))
  fun updateTrades(chartId: String, values: DoubleArray) = enqueue(chartId, Command.Trades(values.copyOf()))

  fun clear(chartId: String) = onMain {
    val entry = entries[chartId] ?: return@onMain
    entry.pending.clear()
    entry.view?.get()?.clearData()
    if (entry.view?.get() == null) entries.remove(chartId)
  }

  private fun enqueue(chartId: String, command: Command) = onMain {
    val entry = entries.getOrPut(chartId) { Entry() }
    val view = entry.view?.get()
    if (view != null) {
      apply(view, command)
    } else {
      if (command is Command.History) entry.pending.clear()
      entry.pending += command
    }
  }

  private fun apply(view: TradingChartsView, command: Command) {
    when (command) {
      is Command.History -> view.applyHistory(command.values)
      is Command.Candle -> view.applyCandle(command.values)
      is Command.Trade -> view.applyTrade(command.values)
      is Command.Trades -> view.applyTrades(command.values)
    }
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else handler.post(block)
  }
}
