package com.tradingcharts

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.opengl.GLES30
import android.opengl.GLUtils
import kotlin.math.ceil

/** Alpha-only sampling keeps this immutable atlas independent of marker colors. */
internal class ChartMarkerAtlas(size: Float, scale: Float) {
  private val bitmap: Bitmap
  private var texture = 0

  init {
    val metrics = metrics(size)
    val cellWidth = metrics[2].toFloat()
    val cellHeight = metrics[3].toFloat()
    val rasterScale = minOf(scale, 4096f / maxOf(cellWidth * 16, cellHeight * 6))
    bitmap =
        Bitmap.createBitmap(
            ceil(cellWidth * 16 * rasterScale).toInt().coerceAtLeast(1),
            ceil(cellHeight * 6 * rasterScale).toInt().coerceAtLeast(1),
            Bitmap.Config.ARGB_8888,
        )
    val canvas = Canvas(bitmap)
    canvas.scale(bitmap.width / (cellWidth * 16), bitmap.height / (cellHeight * 6))
    val paint = fontPaint(size)
    for (glyph in 0 until 95) {
      canvas.drawText(
          (glyph + 32).toChar().toString(),
          (glyph % 16) * cellWidth + 2,
          (glyph / 16) * cellHeight + 2 - paint.fontMetrics.ascent,
          paint,
      )
    }
    canvas.drawRect(15 * cellWidth, 5 * cellHeight, 16 * cellWidth, 6 * cellHeight, paint)
  }

  fun bind() {
    if (texture == 0) {
      val names = IntArray(1)
      GLES30.glGenTextures(1, names, 0)
      texture = names[0]
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
      GLES30.glTexParameteri(
          GLES30.GL_TEXTURE_2D,
          GLES30.GL_TEXTURE_WRAP_S,
          GLES30.GL_CLAMP_TO_EDGE,
      )
      GLES30.glTexParameteri(
          GLES30.GL_TEXTURE_2D,
          GLES30.GL_TEXTURE_WRAP_T,
          GLES30.GL_CLAMP_TO_EDGE,
      )
      GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bitmap, 0)
    } else {
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
    }
  }

  fun contextLost() {
    texture = 0
  }

  fun dispose() {
    if (texture != 0) GLES30.glDeleteTextures(1, intArrayOf(texture), 0)
    texture = 0
    bitmap.recycle()
  }

  companion object {
    private fun fontPaint(size: Float) =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          textSize = size
          typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
          color = Color.WHITE
        }

    fun metrics(size: Float): DoubleArray {
      val paint = fontPaint(size)
      val advance = paint.measureText("M").toDouble()
      val height = ceil((paint.fontMetrics.descent - paint.fontMetrics.ascent).toDouble())
      return doubleArrayOf(advance, height, ceil(advance + 4), height + 4)
    }
  }
}
