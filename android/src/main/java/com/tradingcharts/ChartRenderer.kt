package com.tradingcharts

import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.util.Log
import java.nio.Buffer
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

internal class ChartRenderer : GLSurfaceView.Renderer {
  private val pendingLock = Any()
  private var pendingFrame: ChartFrame? = null
  private var renderedSnapshot: ChartSnapshot? = null
  private var currentContent: ContentVertexBufferLease? = null
  private var program = 0
  private var uniformViewport = 0
  private val contentSlot = VertexSlot()
  private val overlaySlot = VertexSlot()
  private var uploadedContentRevision = -1L
  private var uploadedRevision = -1L

  /** One grow-only VBO; only Java-array uploads use the grow-only staging buffer. */
  private class VertexSlot {
    var buffer = 0
    var vertexCount = 0
    private var gpuCapacityFloats = 0
    private var staging: FloatBuffer? = null

    fun upload(vertices: FloatArray) {
      var data = staging
      if (data == null || data.capacity() < vertices.size) {
        data =
            ByteBuffer.allocateDirect(vertices.size * 4)
                .order(ByteOrder.nativeOrder())
                .asFloatBuffer()
        staging = data
      }
      data.clear()
      data.put(vertices).position(0)
      upload(data, vertices.size)
    }

    fun upload(vertices: ContentVertexBufferLease) {
      upload(vertices.bufferForGl(), vertices.floatCount)
    }

    private fun upload(data: Buffer, floatCount: Int) {
      GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, buffer)
      if (floatCount > gpuCapacityFloats) {
        gpuCapacityFloats = floatCount
        GLES30.glBufferData(
            GLES30.GL_ARRAY_BUFFER,
            floatCount * Float.SIZE_BYTES,
            data,
            GLES30.GL_DYNAMIC_DRAW,
        )
      } else {
        GLES30.glBufferSubData(
            GLES30.GL_ARRAY_BUFFER,
            0,
            floatCount * Float.SIZE_BYTES,
            data,
        )
      }
      vertexCount = floatCount / FLOATS_PER_VERTEX
    }

    /** GL objects are gone after surface recreation; force the next upload. */
    fun reset() {
      buffer = 0
      gpuCapacityFloats = 0
      vertexCount = 0
    }
  }

  /**
   * Publishes the newest UI-thread frame without queueing stale frames.
   *
   * A metadata-only frame inherits a pending content lease with the same content revision so a
   * crosshair update cannot discard geometry that the GL thread has not uploaded yet.
   */
  fun submit(frame: ChartFrame) {
    var discardedContent: ContentVertexBufferLease? = null
    synchronized(pendingLock) {
      val previous = pendingFrame
      val content =
          frame.contentVertices
              ?: previous?.contentVertices?.takeIf {
                previous.snapshot.contentRevision == frame.snapshot.contentRevision
              }
      pendingFrame =
          if (content === frame.contentVertices) {
            frame
          } else {
            frame.copy(contentVertices = content)
          }
      if (previous?.contentVertices != null && previous.contentVertices !== content) {
        discardedContent = previous.contentVertices
      }
    }
    discardedContent?.release()
  }

  fun clearPending() {
    val discarded =
        synchronized(pendingLock) {
          val frame = pendingFrame
          pendingFrame = null
          frame?.contentVertices
        }
    discarded?.release()
  }

  private fun takePending(): ChartFrame? =
      synchronized(pendingLock) {
        val frame = pendingFrame
        pendingFrame = null
        frame
      }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    val vertexShader =
        compile(
            GLES30.GL_VERTEX_SHADER,
            """
            #version 300 es
            uniform vec2 uViewport;
            layout(location = 0) in vec2 aPosition;
            layout(location = 1) in vec4 aColor;
            out vec4 vColor;
            void main() {
              vec2 safeSize = max(uViewport, vec2(1.0));
              vec2 p = aPosition / safeSize;
              gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
              vColor = aColor;
            }
            """
                .trimIndent(),
        )
    val fragmentShader =
        compile(
            GLES30.GL_FRAGMENT_SHADER,
            """
            #version 300 es
            precision mediump float;
            in vec4 vColor;
            out vec4 fragmentColor;
            void main() { fragmentColor = vColor; }
            """
                .trimIndent(),
        )
    if (vertexShader == 0 || fragmentShader == 0) return
    program = GLES30.glCreateProgram()
    GLES30.glAttachShader(program, vertexShader)
    GLES30.glAttachShader(program, fragmentShader)
    GLES30.glLinkProgram(program)
    val linkStatus = IntArray(1)
    GLES30.glGetProgramiv(program, GLES30.GL_LINK_STATUS, linkStatus, 0)
    if (linkStatus[0] == 0) {
      Log.e(TAG, "GLES program link failed: ${GLES30.glGetProgramInfoLog(program)}")
      GLES30.glDeleteProgram(program)
      program = 0
      return
    }
    uniformViewport = GLES30.glGetUniformLocation(program, "uViewport")
    val buffers = IntArray(2)
    GLES30.glGenBuffers(2, buffers, 0)
    // Surface (and its EGL context) may have been recreated: previous uploads
    // are gone, so cached revisions must not suppress the next upload.
    contentSlot.reset()
    overlaySlot.reset()
    contentSlot.buffer = buffers[0]
    overlaySlot.buffer = buffers[1]
    uploadedContentRevision = -1L
    uploadedRevision = -1L
    GLES30.glEnable(GLES30.GL_BLEND)
    GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    GLES30.glViewport(0, 0, width, height)
  }

  override fun onDrawFrame(gl: GL10?) {
    val pending = takePending()
    val frame = pending?.snapshot ?: renderedSnapshot
    if (pending != null) {
      renderedSnapshot = pending.snapshot
    }
    val bg = frame?.config?.backgroundColor ?: 0xFF100C18.toInt()
    GLES30.glClearColor(
        android.graphics.Color.red(bg) / 255f,
        android.graphics.Color.green(bg) / 255f,
        android.graphics.Color.blue(bg) / 255f,
        android.graphics.Color.alpha(bg) / 255f,
    )
    GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
    if (frame == null || program == 0) {
      pending?.contentVertices?.release()
      return
    }

    if (!updateContent(frame, pending?.contentVertices)) return
    updateOverlay(frame)
    drawFrame(frame)
  }

  /**
   * Content geometry changes only with contentRevision, while crosshair-only frames reuse it.
   * Retain the latest lease so an EGL context recreation can repopulate the VBO.
   */
  private fun updateContent(
      frame: ChartSnapshot,
      incoming: ContentVertexBufferLease?,
  ): Boolean {
    var unconsumed = incoming
    try {
      if (uploadedContentRevision == frame.contentRevision) return true
      val content =
          incoming?.takeIf { it.contentRevision == frame.contentRevision }
              ?: currentContent?.takeIf { it.contentRevision == frame.contentRevision }
      if (content == null) {
        Log.e(TAG, "Missing content buffer for revision ${frame.contentRevision}")
        return false
      }
      if (content.floatCount > 0) {
        contentSlot.upload(content)
      } else {
        contentSlot.vertexCount = 0
      }
      if (content === incoming) {
        val previousContent = currentContent
        currentContent = content
        unconsumed = null
        previousContent?.release()
      }
      uploadedContentRevision = frame.contentRevision
      return true
    } finally {
      unconsumed?.release()
    }
  }

  private fun updateOverlay(frame: ChartSnapshot) {
    if (uploadedRevision == frame.revision) return
    if (frame.overlayVertices.isNotEmpty()) {
      overlaySlot.upload(frame.overlayVertices)
    } else {
      overlaySlot.vertexCount = 0
    }
    uploadedRevision = frame.revision
  }

  private fun drawFrame(frame: ChartSnapshot) {
    if (contentSlot.vertexCount == 0 && overlaySlot.vertexCount == 0) return
    GLES30.glUseProgram(program)
    GLES30.glUniform2f(uniformViewport, frame.width, frame.height)
    drawSlot(contentSlot)
    drawSlot(overlaySlot)
    GLES30.glDisableVertexAttribArray(0)
    GLES30.glDisableVertexAttribArray(1)
  }

  private fun drawSlot(slot: VertexSlot) {
    if (slot.vertexCount == 0 || slot.buffer == 0) return
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, slot.buffer)
    GLES30.glEnableVertexAttribArray(0)
    GLES30.glEnableVertexAttribArray(1)
    GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 24, 0)
    GLES30.glVertexAttribPointer(1, 4, GLES30.GL_FLOAT, false, 24, 8)
    GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, slot.vertexCount)
  }

  private fun compile(type: Int, source: String): Int {
    val shader = GLES30.glCreateShader(type)
    GLES30.glShaderSource(shader, source)
    GLES30.glCompileShader(shader)
    val status = IntArray(1)
    GLES30.glGetShaderiv(shader, GLES30.GL_COMPILE_STATUS, status, 0)
    if (status[0] == 0) {
      Log.e(TAG, "GLES shader compile failed: ${GLES30.glGetShaderInfoLog(shader)}")
      GLES30.glDeleteShader(shader)
      return 0
    }
    return shader
  }

  companion object {
    private const val TAG = "TradingCharts"
    private const val FLOATS_PER_VERTEX = 6
  }
}
