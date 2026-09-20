package com.tradingcharts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertNull
import org.junit.Test

class MarkerVertexBufferTest {
  @Test
  fun validatesMarkerTransportIndependently() {
    validateMarkerTransport(intArrayOf(2, 26, 8, 3, 16, 6))
  }

  @Test(expected = IllegalStateException::class)
  fun rejectsStaleMarkerTransport() {
    validateMarkerTransport(intArrayOf(1, 25, 8, 3, 16, 6))
  }

  @Test
  fun crosshairReplacementKeepsPendingMarkerUpload() {
    val pool = ContentVertexBufferPool()
    val marker = checkNotNull(pool.acquire(48, 7))
    marker.writableBuffer().putFloat(12f)
    val retained = replacePendingVertices(marker, null, 7)
    assertSame(marker, retained)
    assertEquals(12f, retained!!.bufferForGl().asFloatBuffer().get(), 0f)
    retained.release()
  }

  @Test
  fun newerMarkerRevisionReleasesDiscardedLease() {
    val pool = ContentVertexBufferPool(2)
    val first = checkNotNull(pool.acquire(48, 7))
    val latest = checkNotNull(pool.acquire(96, 8))
    assertNull(pool.acquire(48, 9))
    assertSame(latest, replacePendingVertices(first, latest, 8))
    val available = checkNotNull(pool.acquire(48, 9))
    available.release()
    latest.release()
  }

  @Test
  fun markerAndContentLifetimesAreIndependent() {
    val contentPool = ContentVertexBufferPool(2)
    val markerPool = ContentVertexBufferPool(2)
    val content = checkNotNull(contentPool.acquire(36, 1))
    val marker = checkNotNull(markerPool.acquire(48, 1))
    val nextMarker = checkNotNull(markerPool.acquire(48, 2))
    assertSame(nextMarker, replacePendingVertices(marker, nextMarker, 2))
    assertSame(content, replacePendingVertices(content, null, 1))
    assertEquals(36 * 4, content.bufferForGl().limit())
    content.release()
    nextMarker.release()
  }
}
