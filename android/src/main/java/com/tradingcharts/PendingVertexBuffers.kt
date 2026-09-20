package com.tradingcharts

/** Called under the frame mailbox lock, independently for content and markers. */
internal fun replacePendingVertices(
    previous: ContentVertexBufferLease?,
    incoming: ContentVertexBufferLease?,
    revision: Long,
): ContentVertexBufferLease? {
  val retained = incoming ?: previous?.takeIf { it.contentRevision == revision }
  if (previous !== retained) previous?.release()
  return retained
}
