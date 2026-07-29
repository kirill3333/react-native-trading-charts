package com.tradingcharts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentVertexBufferPoolTest {
  @Test
  fun poolIsBoundedAndReleasedSlotsCanBeReacquired() {
    val pool = ContentVertexBufferPool(slotCount = 3)
    val first = assertNotNullLease(pool.acquire(floatCount = 6, contentRevision = 1))
    val second = assertNotNullLease(pool.acquire(floatCount = 6, contentRevision = 2))
    val third = assertNotNullLease(pool.acquire(floatCount = 6, contentRevision = 3))

    assertNull(pool.acquire(floatCount = 6, contentRevision = 4))

    second.release()
    val replacement = assertNotNullLease(pool.acquire(floatCount = 6, contentRevision = 4))
    assertEquals(4, replacement.contentRevision)

    first.release()
    third.release()
    replacement.release()
  }

  @Test
  fun slotBufferIsReusedAndOnlyGrows() {
    val pool = ContentVertexBufferPool(slotCount = 2)
    val initial = assertNotNullLease(pool.acquire(floatCount = 12, contentRevision = 1))
    val initialBuffer = initial.writableBuffer()
    initial.release()

    val smaller = assertNotNullLease(pool.acquire(floatCount = 6, contentRevision = 2))
    assertSame(initialBuffer, smaller.writableBuffer())
    assertTrue(smaller.writableBuffer().capacity() >= 12 * Float.SIZE_BYTES)
    smaller.release()

    val larger = assertNotNullLease(pool.acquire(floatCount = 48, contentRevision = 3))
    assertTrue(larger.writableBuffer().capacity() >= 48 * Float.SIZE_BYTES)
    larger.release()
  }

  @Test
  fun releaseIsIdempotent() {
    val pool = ContentVertexBufferPool(slotCount = 2)
    val lease = assertNotNullLease(pool.acquire(floatCount = 6, contentRevision = 1))

    lease.release()
    lease.release()

    val reacquired = pool.acquire(floatCount = 6, contentRevision = 2)
    assertNotNull(reacquired)
    reacquired?.release()
  }

  private fun assertNotNullLease(lease: ContentVertexBufferLease?): ContentVertexBufferLease {
    assertNotNull(lease)
    return checkNotNull(lease)
  }
}
