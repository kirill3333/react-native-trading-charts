package com.tradingcharts

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.lang.ref.WeakReference

internal object TradingChartsRegistry {
  private sealed interface Command {
    data class History(val values: DoubleArray) : Command

    data class PrependHistory(val values: DoubleArray) : Command

    data class Candle(val values: DoubleArray) : Command

    data class Trade(val values: DoubleArray) : Command

    data class Trades(val values: DoubleArray) : Command

    data class AddSeries(val json: String) : Command

    data class SeriesData(
        val seriesId: String,
        val dataType: String,
        val values: DoubleArray,
        val prepend: Boolean,
        val update: Boolean,
    ) : Command

    data class RemoveSeries(val seriesId: String) : Command

    data class PaneHeight(val paneId: String, val heightWeight: Double) : Command

    data class Zoom(val scale: Double) : Command

    data object FitContent : Command
  }

  private data class Entry(
      var view: WeakReference<TradingChartsView>? = null,
      val pending: MutableList<Command> = mutableListOf(),
  )

  private val handler = Handler(Looper.getMainLooper())
  private val entries = mutableMapOf<String, Entry>()

  private const val MAX_PENDING_COMMANDS = 256

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

  fun setHistory(chartId: String, values: DoubleArray) =
      enqueue(chartId, Command.History(values.copyOf()))

  fun prependHistory(chartId: String, values: DoubleArray) =
      enqueue(chartId, Command.PrependHistory(values.copyOf()))

  fun updateCandle(chartId: String, values: DoubleArray) =
      enqueue(chartId, Command.Candle(values.copyOf()))

  fun updateTrade(chartId: String, values: DoubleArray) =
      enqueue(chartId, Command.Trade(values.copyOf()))

  fun updateTrades(chartId: String, values: DoubleArray) =
      enqueue(chartId, Command.Trades(values.copyOf()))

  fun addSeries(chartId: String, seriesJson: String) =
      enqueue(chartId, Command.AddSeries(seriesJson))

  @Suppress("LongParameterList")
  fun setSeriesData(
      chartId: String,
      seriesId: String,
      dataType: String,
      values: DoubleArray,
      prepend: Boolean = false,
      update: Boolean = false,
  ) =
      enqueue(
          chartId,
          Command.SeriesData(
              seriesId,
              dataType,
              values.copyOf(),
              prepend,
              update,
          ),
      )

  fun removeSeries(chartId: String, seriesId: String) =
      enqueue(chartId, Command.RemoveSeries(seriesId))

  fun setPaneHeight(chartId: String, paneId: String, heightWeight: Double) =
      enqueue(chartId, Command.PaneHeight(paneId, heightWeight))

  fun zoom(chartId: String, scale: Double) = enqueue(chartId, Command.Zoom(scale))

  fun fitContent(chartId: String) = enqueue(chartId, Command.FitContent)

  fun getCandles(
      chartId: String,
      onSuccess: (DoubleArray) -> Unit,
      onError: () -> Unit,
  ) = onMain {
    val view = entries[chartId]?.view?.get()
    if (view == null) {
      onError()
    } else {
      onSuccess(view.candles())
    }
  }

  fun clear(chartId: String) = onMain {
    val entry = entries[chartId] ?: return@onMain
    entry.pending.removeAll {
      it is Command.History ||
          it is Command.PrependHistory ||
          it is Command.Candle ||
          it is Command.Trade ||
          it is Command.Trades ||
          it is Command.SeriesData
    }
    entry.view?.get()?.clearData()
    if (entry.view?.get() == null) entries.remove(chartId)
  }

  private fun enqueue(chartId: String, command: Command) = onMain {
    val entry = entries.getOrPut(chartId) { Entry() }
    val view = entry.view?.get()
    if (view != null) {
      apply(view, command)
    } else {
      if (command is Command.History) {
        entry.pending.removeAll {
          it is Command.History ||
              it is Command.PrependHistory ||
              it is Command.Candle ||
              it is Command.Trade ||
              it is Command.Trades
        }
      } else if (command is Command.SeriesData && !command.prepend && !command.update) {
        entry.pending.removeAll {
          it is Command.SeriesData && it.seriesId == command.seriesId
        }
      } else if (command is Command.PaneHeight) {
        entry.pending.removeAll {
          it is Command.PaneHeight && it.paneId == command.paneId
        }
      } else if (command is Command.FitContent) {
        entry.pending.removeAll { it is Command.FitContent }
      }
      entry.pending += command
      trimPending(chartId, entry.pending)
    }
  }

  // Bound the backlog of a chartId whose view is not mounted: oldest
  // streaming updates are dropped first. If no streaming command remains,
  // drop the oldest command so the limit stays hard for every command mix.
  private fun trimPending(chartId: String, pending: MutableList<Command>) {
    while (pending.size > MAX_PENDING_COMMANDS) {
      val dropIndex = pending.indexOfFirst {
        it is Command.Candle || it is Command.Trade || it is Command.Trades
      }
      val dropped = pending.removeAt(if (dropIndex >= 0) dropIndex else 0)
      Log.w(
          "TradingCharts",
          "Pending command limit reached for '$chartId'; dropping ${dropped.javaClass.simpleName}",
      )
    }
  }

  private fun apply(view: TradingChartsView, command: Command) {
    when (command) {
      is Command.History -> view.applyHistory(command.values)
      is Command.PrependHistory -> view.prependHistory(command.values)
      is Command.Candle -> view.applyCandle(command.values)
      is Command.Trade -> view.applyTrade(command.values)
      is Command.Trades -> view.applyTrades(command.values)
      is Command.AddSeries -> view.addSeries(command.json)
      is Command.SeriesData ->
          view.setSeriesData(
              command.seriesId,
              command.dataType,
              command.values,
              command.prepend,
              command.update,
          )
      is Command.RemoveSeries -> view.removeSeries(command.seriesId)
      is Command.PaneHeight -> view.setPaneHeight(command.paneId, command.heightWeight)
      is Command.Zoom -> view.zoom(command.scale)
      is Command.FitContent -> view.fitContent()
    }
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else handler.post(block)
  }
}
