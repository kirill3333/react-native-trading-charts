package com.tradingcharts

import android.graphics.Color
import org.json.JSONArray
import org.json.JSONObject

internal data class MarkerPayload(val strings: Array<String>, val numbers: DoubleArray)

internal class ChartMarkerDecoder {
  private val metrics = mutableMapOf<Float, DoubleArray>()

  fun decode(json: String, replace: Boolean): MarkerPayload {
    val records = if (replace) JSONArray(json) else JSONArray().put(JSONObject(json))
    val strings = Array(records.length() * 3) { "" }
    val numbers = DoubleArray(records.length() * VALUE_COUNT)
    val ids = mutableSetOf<String>()
    for (index in 0 until records.length()) {
      val record = records.getJSONObject(index)
      val id = record.getString("id")
      val text = record.getString("text")
      require(id.isNotBlank() && ids.add(id)) { "Invalid or duplicate marker id" }
      require(text.length in 1..5 && text.isNotBlank() && text.all { it.code in 32..126 }) {
        "Marker text must contain 1–5 printable ASCII characters"
      }
      val position = record.getString("position")
      require(position == "above" || position == "below") { "Invalid marker position" }
      strings[index * 3] = id
      strings[index * 3 + 1] = text
      strings[index * 3 + 2] = record.toString()
      val values = KEYS.map { key ->
        val raw = record.get(key)
        require(raw is Number) { "Marker $key must be a number" }
        raw.toDouble().also { require(it.isFinite() && it >= 0) }
      }
      val size = values[1].toFloat()
      require(size.isFinite() && size > 0) { "Invalid marker font size" }
      val offset = index * VALUE_COUNT
      numbers[offset] = values[0]
      numbers[offset + 1] = if (position == "below") 1.0 else 0.0
      values.drop(1).forEachIndexed { field, value -> numbers[offset + 2 + field] = value }
      val font = metrics.getOrPut(size) { ChartMarkerAtlas.metrics(size) }
      font.copyInto(numbers, offset + 10)
      listOf("backgroundColor", "textColor", "borderColor").forEachIndexed { colorIndex, key ->
        val hex = record.getString(key)
        require(COLOR_PATTERN.matches(hex)) { "Invalid marker color" }
        // Public hex is RRGGBBAA; Android's parser expects AARRGGBB.
        val argb = if (hex.length == 9) "#${hex.takeLast(2)}${hex.substring(1, 7)}" else hex
        val color = Color.parseColor(argb)
        val start = offset + 14 + colorIndex * 4
        numbers[start] = Color.red(color) / 255.0
        numbers[start + 1] = Color.green(color) / 255.0
        numbers[start + 2] = Color.blue(color) / 255.0
        numbers[start + 3] = Color.alpha(color) / 255.0
      }
    }
    if (metrics.size > 64) metrics.clear()
    return MarkerPayload(strings, numbers)
  }

  companion object {
    const val VALUE_COUNT = 26
    private val COLOR_PATTERN = Regex("^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$")
    private val KEYS =
        listOf(
            "timestamp",
            "fontSize",
            "borderWidth",
            "paddingHorizontal",
            "paddingVertical",
            "minWidth",
            "minHeight",
            "borderRadius",
            "offset",
        )
  }
}
