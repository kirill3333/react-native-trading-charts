package com.tradingcharts

import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

internal class ChartRenderer : GLSurfaceView.Renderer {
  @Volatile var snapshot: ChartSnapshot? = null
  private var program = 0
  private var buffer = 0
  private var uploadedRevision = -1L
  private var vertexCount = 0

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    val vertexShader = compile(
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
      """.trimIndent(),
    )
    val fragmentShader = compile(
      GLES30.GL_FRAGMENT_SHADER,
      """
        #version 300 es
        precision mediump float;
        in vec4 vColor;
        out vec4 fragmentColor;
        void main() { fragmentColor = vColor; }
      """.trimIndent(),
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
    val buffers = IntArray(1)
    GLES30.glGenBuffers(1, buffers, 0)
    buffer = buffers[0]
    GLES30.glEnable(GLES30.GL_BLEND)
    GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    GLES30.glViewport(0, 0, width, height)
  }

  override fun onDrawFrame(gl: GL10?) {
    val frame = snapshot
    val bg = frame?.config?.backgroundColor ?: 0xFF100C18.toInt()
    GLES30.glClearColor(
      android.graphics.Color.red(bg) / 255f,
      android.graphics.Color.green(bg) / 255f,
      android.graphics.Color.blue(bg) / 255f,
      android.graphics.Color.alpha(bg) / 255f,
    )
    GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
    if (frame == null || frame.vertices.isEmpty() || program == 0) return

    if (uploadedRevision != frame.revision) {
      val data = ByteBuffer.allocateDirect(frame.vertices.size * 4)
        .order(ByteOrder.nativeOrder())
        .asFloatBuffer()
      data.put(frame.vertices).position(0)
      GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, buffer)
      GLES30.glBufferData(
        GLES30.GL_ARRAY_BUFFER,
        frame.vertices.size * 4,
        data,
        GLES30.GL_DYNAMIC_DRAW,
      )
      vertexCount = frame.vertices.size / 6
      uploadedRevision = frame.revision
    }

    GLES30.glUseProgram(program)
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, buffer)
    GLES30.glEnableVertexAttribArray(0)
    GLES30.glEnableVertexAttribArray(1)
    GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 24, 0)
    GLES30.glVertexAttribPointer(1, 4, GLES30.GL_FLOAT, false, 24, 8)
    GLES30.glUniform2f(
      GLES30.glGetUniformLocation(program, "uViewport"),
      frame.width,
      frame.height,
    )
    GLES30.glDrawArrays(GLES30.GL_TRIANGLES, 0, vertexCount)
    GLES30.glDisableVertexAttribArray(0)
    GLES30.glDisableVertexAttribArray(1)
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
  }
}
