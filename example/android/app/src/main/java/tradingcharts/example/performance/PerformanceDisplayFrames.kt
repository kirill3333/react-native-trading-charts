package tradingcharts.example.performance

import android.os.Handler
import android.os.Looper
import android.view.Choreographer

/** Main-thread ownership, atomic snapshots, and no per-frame work queued to JS or the sampler. */
internal class PerformanceDisplayFrames : Choreographer.FrameCallback {
  private val main = Handler(Looper.getMainLooper())
  private val lock = Any()
  private var generation = 0L
  private var frames = 0L
  private var running = false
  // Accessed only from the sampler queue; avoid queueing repeated requests during a main-thread
  // stall.
  private var requested = false

  fun setRunning(value: Boolean) {
    if (requested == value) return
    requested = value
    main.post {
      synchronized(lock) {
        running = value
        generation++
        frames = 0
      }
      val choreographer = Choreographer.getInstance()
      choreographer.removeFrameCallback(this)
      if (value) choreographer.postFrameCallback(this)
    }
  }

  fun snapshot(): DisplaySample? =
      synchronized(lock) {
        if (running) DisplaySample(generation, frames) else null
      }

  override fun doFrame(frameTimeNanos: Long) {
    val repeat =
        synchronized(lock) {
          if (running) frames++
          running
        }
    if (repeat) Choreographer.getInstance().postFrameCallback(this)
  }
}
