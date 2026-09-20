package com.tradingcharts

import android.opengl.GLES30
import android.util.Log

/** GL-thread marker pass, with its own VBO, atlas cache and retained direct-buffer lease. */
internal class ChartMarkerRenderer {
  private var program = 0
  private var buffer = 0
  private var capacity = 0
  private var uploadedRevision = -1L
  private var current: ContentVertexBufferLease? = null
  private var viewportUniform = 0
  private var atlasScale = 0f
  private val atlases = mutableMapOf<Float, ChartMarkerAtlas>()

  fun surfaceCreated() {
    uploadedRevision = -1L
    capacity = 0
    atlases.values.forEach { it.contextLost() }
    program = makeProgram()
    viewportUniform = GLES30.glGetUniformLocation(program, "uViewport")
    val buffers = IntArray(1)
    GLES30.glGenBuffers(1, buffers, 0)
    buffer = buffers[0]
  }

  fun update(frame: ChartSnapshot, incoming: ContentVertexBufferLease?): Boolean {
    var unconsumed = incoming
    try {
      if (uploadedRevision == frame.markerRevision) return true
      val data =
          (incoming?.takeIf { it.contentRevision == frame.markerRevision }
                  ?: current?.takeIf { it.contentRevision == frame.markerRevision })
              .takeIf { program != 0 || frame.markerBatches.isEmpty() } ?: return false
      if (data === incoming) {
        current?.release()
        current = data
        unconsumed = null
      }
      if (data.floatCount > 0) {
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, buffer)
        val bytes = data.floatCount * Float.SIZE_BYTES
        if (bytes > capacity) {
          GLES30.glBufferData(
              GLES30.GL_ARRAY_BUFFER,
              bytes,
              data.bufferForGl(),
              GLES30.GL_DYNAMIC_DRAW,
          )
          capacity = bytes
        } else {
          GLES30.glBufferSubData(GLES30.GL_ARRAY_BUFFER, 0, bytes, data.bufferForGl())
        }
      }
      uploadedRevision = frame.markerRevision
      return true
    } finally {
      unconsumed?.release()
    }
  }

  fun draw(frame: ChartSnapshot) {
    if (frame.markerBatches.isEmpty() || program == 0) return
    if (atlasScale != frame.config.displayScale) {
      atlases.values.forEach { it.dispose() }
      atlases.clear()
      atlasScale = frame.config.displayScale
    }
    GLES30.glUseProgram(program)
    GLES30.glUniform2f(viewportUniform, frame.width, frame.height)
    GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, buffer)
    GLES30.glEnableVertexAttribArray(0)
    GLES30.glEnableVertexAttribArray(1)
    GLES30.glEnableVertexAttribArray(2)
    GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 32, 0)
    GLES30.glVertexAttribPointer(1, 2, GLES30.GL_FLOAT, false, 32, 8)
    GLES30.glVertexAttribPointer(2, 4, GLES30.GL_FLOAT, false, 32, 16)
    val batches = frame.markerBatches
    for (offset in batches.indices step 3) {
      val size = batches[offset].toFloat()
      val atlas = atlases.getOrPut(size) { ChartMarkerAtlas(size, atlasScale) }
      atlas.bind()
      GLES30.glDrawArrays(
          GLES30.GL_TRIANGLES,
          batches[offset + 1].toInt(),
          batches[offset + 2].toInt(),
      )
    }
    GLES30.glDisableVertexAttribArray(2)
    if (atlases.size > 64) {
      val active = (batches.indices step 3).mapTo(mutableSetOf()) { batches[it].toFloat() }
      val iterator = atlases.iterator()
      while (iterator.hasNext()) {
        val entry = iterator.next()
        if (entry.key !in active) {
          entry.value.dispose()
          iterator.remove()
        }
      }
    }
  }

  fun dispose() {
    current?.release()
    current = null
    atlases.values.forEach { it.dispose() }
    atlases.clear()
    if (buffer != 0) GLES30.glDeleteBuffers(1, intArrayOf(buffer), 0)
    if (program != 0) GLES30.glDeleteProgram(program)
    buffer = 0
    program = 0
  }

  private fun makeProgram(): Int {
    val vertex = compile(GLES30.GL_VERTEX_SHADER, VERTEX)
    val fragment = compile(GLES30.GL_FRAGMENT_SHADER, FRAGMENT)
    if (vertex == 0 || fragment == 0) {
      if (vertex != 0) GLES30.glDeleteShader(vertex)
      if (fragment != 0) GLES30.glDeleteShader(fragment)
      return 0
    }
    val result = GLES30.glCreateProgram()
    GLES30.glAttachShader(result, vertex)
    GLES30.glAttachShader(result, fragment)
    GLES30.glLinkProgram(result)
    GLES30.glDeleteShader(vertex)
    GLES30.glDeleteShader(fragment)
    val status = IntArray(1)
    GLES30.glGetProgramiv(result, GLES30.GL_LINK_STATUS, status, 0)
    if (status[0] == 0) {
      Log.e("TradingCharts", "Marker program: ${GLES30.glGetProgramInfoLog(result)}")
      GLES30.glDeleteProgram(result)
      return 0
    }
    return result
  }

  private fun compile(type: Int, source: String): Int {
    val shader = GLES30.glCreateShader(type)
    GLES30.glShaderSource(shader, source)
    GLES30.glCompileShader(shader)
    val status = IntArray(1)
    GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, status, 0)
    if (status[0] == 0) {
      Log.e("TradingCharts", "Marker shader: ${GLES30.glGetShaderInfoLog(shader)}")
      GLES30.glDeleteShader(shader)
      return 0
    }
    return shader
  }

  companion object {
    private val VERTEX =
        """
        #version 300 es
        uniform vec2 uViewport;
        layout(location = 0) in vec2 aPosition;
        layout(location = 1) in vec2 aUv;
        layout(location = 2) in vec4 aColor;
        out vec2 vUv;
        out vec4 vColor;
        void main() {
          vec2 p = aPosition / max(uViewport, vec2(1.0));
          gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
          vUv = aUv;
          vColor = aColor;
        }
        """
            .trimIndent()
    private val FRAGMENT =
        """
        #version 300 es
        precision mediump float;
        uniform sampler2D uAtlas;
        in vec2 vUv;
        in vec4 vColor;
        out vec4 fragmentColor;
        void main() { fragmentColor = vec4(vColor.rgb, vColor.a * texture(uAtlas, vUv).a); }
        """
            .trimIndent()
  }
}
