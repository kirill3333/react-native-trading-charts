package com.tradingcharts

/** Single owner transfers this immutable native snapshot from the UI mailbox to GL. */
internal class MarkerHitLease(
    private var handle: Long,
    val revision: Long,
    private val releaseNative: (Long) -> Unit,
    private val hitNative: (Long, Float, Float) -> String?,
) {
  fun hit(x: Float, y: Float): String? {
    check(handle != 0L)
    return hitNative(handle, x, y)
  }

  fun release() {
    check(handle != 0L)
    releaseNative(handle)
    handle = 0
  }
}

internal fun replacePendingMarkerHits(
    previous: MarkerHitLease?,
    incoming: MarkerHitLease?,
    revision: Long,
): MarkerHitLease? {
  val retained = incoming ?: previous?.takeIf { it.revision == revision }
  if (previous !== retained) previous?.release()
  return retained
}

/** Lock covers the JNI hit-test too: GL cannot free a snapshot while UI reads it. */
internal class MarkerHitState {
  private var displayed: MarkerHitLease? = null
  private var retry: MarkerHitLease? = null
  private var epoch = 0L
  private var available = false

  @Synchronized fun epoch(): Long = epoch

  @Synchronized
  fun reset() {
    epoch++
    displayed?.release()
    displayed = null
    retry?.release()
    retry = null
    available = false
  }

  @Synchronized
  fun hide() {
    available = false
  }

  @Synchronized
  fun prepare(frameEpoch: Long, revision: Long, incoming: MarkerHitLease?): MarkerHitLease? {
    if (frameEpoch != epoch) {
      incoming?.release()
      return null
    }
    val candidate = replacePendingMarkerHits(retry, incoming, revision)
    retry = null
    return candidate
  }

  @Synchronized
  fun failed(frameEpoch: Long, incoming: MarkerHitLease?) {
    if (frameEpoch != epoch) {
      incoming?.release()
      return
    }
    // Keep at most one failed candidate for a later requested redraw, without
    // publishing it or creating an automatic retry loop.
    retry?.release()
    retry = incoming
    available = false
  }

  @Synchronized
  fun commit(frameEpoch: Long, revision: Long, incoming: MarkerHitLease?) {
    if (frameEpoch != epoch) {
      incoming?.release()
      return
    }
    if (incoming != null) {
      displayed?.release()
      displayed = incoming
    }
    available = displayed?.revision == revision
  }

  @Synchronized fun hit(x: Float, y: Float): String? = if (available) displayed?.hit(x, y) else null
}
