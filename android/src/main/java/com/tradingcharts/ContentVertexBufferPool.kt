package com.tradingcharts

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A bounded pool of grow-only direct buffers shared between the UI and GL threads.
 *
 * A lease is the exclusive owner of its slot until [ContentVertexBufferLease.release] is called.
 * The renderer retains the latest uploaded lease so it can restore the VBO after EGL recreation.
 */
internal class ContentVertexBufferPool(slotCount: Int = DEFAULT_SLOT_COUNT) {
  internal class Slot {
    var buffer: ByteBuffer = allocate(0)
    var leased = false

    fun ensureCapacity(requiredBytes: Int) {
      if (buffer.capacity() >= requiredBytes) return
      val doubled = buffer.capacity().toLong() * 2L
      val nextCapacity = maxOf(requiredBytes.toLong(), doubled).coerceAtMost(Int.MAX_VALUE.toLong())
      buffer = allocate(nextCapacity.toInt())
    }

    companion object {
      private fun allocate(byteCount: Int) =
          ByteBuffer.allocateDirect(byteCount).order(ByteOrder.nativeOrder())
    }
  }

  private val slots: Array<Slot>

  init {
    require(slotCount >= 2) { "Content vertex buffer pool requires at least two slots" }
    slots = Array(slotCount) { Slot() }
  }

  @Synchronized
  fun acquire(floatCount: Int, contentRevision: Long): ContentVertexBufferLease? {
    require(floatCount >= 0) { "Content vertex count must not be negative" }
    val requiredBytes =
        try {
          Math.multiplyExact(floatCount, Float.SIZE_BYTES)
        } catch (error: ArithmeticException) {
          throw IllegalArgumentException("Content vertex buffer is too large", error)
        }
    val slot = slots.firstOrNull { !it.leased } ?: return null
    slot.ensureCapacity(requiredBytes)
    slot.leased = true
    slot.buffer.clear()
    return ContentVertexBufferLease(this, slot, floatCount, contentRevision)
  }

  @Synchronized
  internal fun release(slot: Slot) {
    check(slot.leased) { "Content vertex buffer slot was released twice" }
    slot.leased = false
  }

  companion object {
    const val DEFAULT_SLOT_COUNT = 3
  }
}

internal class ContentVertexBufferLease
internal constructor(
    private val pool: ContentVertexBufferPool,
    private val slot: ContentVertexBufferPool.Slot,
    val floatCount: Int,
    val contentRevision: Long,
) {
  private val released = AtomicBoolean(false)

  fun writableBuffer(): ByteBuffer {
    check(!released.get()) { "Content vertex buffer lease is already released" }
    return slot.buffer
  }

  fun bufferForGl(): ByteBuffer {
    check(!released.get()) { "Content vertex buffer lease is already released" }
    return slot.buffer.apply {
      position(0)
      limit(floatCount * Float.SIZE_BYTES)
    }
  }

  fun release() {
    if (released.compareAndSet(false, true)) {
      pool.release(slot)
    }
  }
}
