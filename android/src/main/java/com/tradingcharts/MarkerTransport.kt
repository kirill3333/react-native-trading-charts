package com.tradingcharts

/** Separate versioned descriptor; the existing chart ABI is unchanged. */
internal fun validateMarkerTransport(descriptor: IntArray) {
  check(descriptor.contentEquals(intArrayOf(2, 26, 8, 3, 16, 6))) {
    "Incompatible native marker transport (version, values, vertex width, batch width, atlas grid)"
  }
}
