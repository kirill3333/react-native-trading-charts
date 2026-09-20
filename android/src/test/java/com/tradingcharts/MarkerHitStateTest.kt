package com.tradingcharts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class MarkerHitStateTest {
  private val released = mutableListOf<Long>()
  private fun lease(id: Long) = MarkerHitLease(id, id, { released.add(it) }, { value, _, _ -> "$value" })

  @Test fun pendingReplacementPreservesMatchingLease() {
    val first = lease(1)
    assertSame(first, replacePendingMarkerHits(first, null, 1))
    val second = lease(2)
    assertSame(second, replacePendingMarkerHits(first, second, 2))
    assertEquals(listOf(1L), released)
    second.release()
  }

  @Test fun hitsUseDisplayedFrameUntilNextCommit() {
    val state = MarkerHitState()
    val epoch = state.epoch()
    state.commit(epoch, 1, lease(1))
    val pending = lease(2)
    assertEquals("1", state.hit(0f, 0f))
    state.commit(epoch, 2, pending)
    assertEquals("2", state.hit(0f, 0f))
    assertEquals(listOf(1L), released)
    state.reset()
    assertEquals(listOf(1L, 2L), released)
  }

  @Test fun resetRejectsInFlightFrameFromPreviousChart() {
    val state = MarkerHitState()
    val oldEpoch = state.epoch()
    val pending = lease(1)
    state.reset()
    state.commit(oldEpoch, 1, pending)
    assertNull(state.hit(0f, 0f))
    assertEquals(listOf(1L), released)
  }

  @Test fun contextLossRetainsSnapshotButDisablesHitsUntilRedraw() {
    val state = MarkerHitState()
    val epoch = state.epoch()
    state.commit(epoch, 1, lease(1))
    state.hide()
    assertNull(state.hit(0f, 0f))
    assertEquals(emptyList<Long>(), released)
    state.commit(epoch, 1, null)
    assertEquals("1", state.hit(0f, 0f))
    state.reset()
  }

  @Test fun failedDrawRetainsOnlyOneUnpublishedCandidate() {
    val state = MarkerHitState()
    val epoch = state.epoch()
    state.commit(epoch, 1, lease(1))
    val next = lease(2)
    val candidate = state.prepare(epoch, 2, next)
    state.failed(epoch, candidate)
    assertNull(state.hit(0f, 0f))
    assertEquals(emptyList<Long>(), released)
    val retry = state.prepare(epoch, 2, null)
    assertSame(next, retry)
    state.commit(epoch, 2, retry)
    assertEquals("2", state.hit(0f, 0f))
    assertEquals(listOf(1L), released)
    state.failed(epoch, state.prepare(epoch, 3, lease(3)))
    state.reset()
    assertEquals(listOf(1L, 2L, 3L), released)
  }
}
