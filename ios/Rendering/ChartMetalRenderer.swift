// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import MetalKit
import os
import simd

private struct MetalUniforms {
  var viewportSize: SIMD2<Float>
}

final class ChartMetalRenderer: NSObject, MTKViewDelegate {
  private let device: MTLDevice
  private let commandQueue: MTLCommandQueue?
  private var pipeline: MTLRenderPipelineState?
  private let contentPool: ChartVertexBufferPool<MTLBuffer>
  private let overlayPool: ChartVertexBufferPool<MTLBuffer>
  private let flightState = ChartFrameFlightState()
  private var frame: ChartRenderFrame?
  private var background = NativeColor()
  var onDidCommit: ((ChartRenderFrame) -> Void)?
  var onNeedsFrame: (() -> Void)? {
    didSet { flightState.onNeedsFrame = onNeedsFrame }
  }

  init(view: MTKView) {
    let device = view.device!
    self.device = device
    commandQueue = device.makeCommandQueue()
    contentPool = ChartVertexBufferPool {
      device.makeBuffer(length: $0, options: .storageModeShared)
    }
    overlayPool = ChartVertexBufferPool {
      device.makeBuffer(length: $0, options: .storageModeShared)
    }
    super.init()
    pipeline = makePipeline(view: view)
  }

  func submit(_ frame: ChartRenderFrame, background: NativeColor) {
    precondition(Thread.isMainThread)
    self.frame = frame
    self.background = background
    flightState.submit(revision: frame.revision)
  }

  func resetDrawableRetry() {
    flightState.resetDrawableRetry()
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  func draw(in view: MTKView) {
    precondition(Thread.isMainThread)
    guard let frame, let pipeline, let commandQueue, flightState.beginFrame() else { return }
    var committed = false
    var contentSlot: ChartVertexBufferPool<MTLBuffer>.Slot?
    var overlaySlot: ChartVertexBufferPool<MTLBuffer>.Slot?
    defer {
      if !committed {
        if let contentSlot { contentPool.release(contentSlot) }
        if let overlaySlot { overlayPool.release(overlaySlot) }
        flightState.finishFrame()
      }
    }
    view.clearColor = MTLClearColor(
      red: Double(background.r),
      green: Double(background.g),
      blue: Double(background.b),
      alpha: Double(background.a)
    )

    let acquireId = OSSignpostID(log: ChartPerformance.log)
    os_signpost(
      .begin,
      log: ChartPerformance.log,
      name: "Metal Acquire Drawable",
      signpostID: acquireId,
      "revision=%{public}llu",
      frame.revision
    )
    let drawable = view.currentDrawable
    let pass = view.currentRenderPassDescriptor
    os_signpost(
      .end,
      log: ChartPerformance.log,
      name: "Metal Acquire Drawable",
      signpostID: acquireId
    )
    guard let drawable, let pass else {
      flightState.retryDrawable()
      return
    }

    let contentBytes = frame.contentVertexCount * MemoryLayout<Float>.stride
    let overlayBytes = frame.overlayVertexCount * MemoryLayout<Float>.stride
    contentSlot = contentPool.acquire(
      revision: frame.contentRevision,
      byteCount: contentBytes
    ) { contentBuffer in
      let uploadId = OSSignpostID(log: ChartPerformance.log)
      os_signpost(
        .begin,
        log: ChartPerformance.log,
        name: "Metal Vertex Memcpy",
        signpostID: uploadId,
        "bytes=%{public}lu",
        contentBytes
      )
      defer {
        os_signpost(
          .end,
          log: ChartPerformance.log,
          name: "Metal Vertex Memcpy",
          signpostID: uploadId
        )
      }
      return frame.withContentVertices { vertices in
        guard let source = vertices.baseAddress else { return false }
        memcpy(contentBuffer.contents(), source, contentBytes)
        return true
      }
    }
    guard contentSlot != nil else {
      NSLog("[TradingCharts] Could not prepare Metal content buffer")
      return
    }
    overlaySlot = overlayPool.acquire(revision: frame.revision, byteCount: overlayBytes) { overlayBuffer in
      frame.withOverlayVertices { vertices in
        guard let source = vertices.baseAddress else { return false }
        memcpy(overlayBuffer.contents(), source, overlayBytes)
        return true
      }
    }
    guard let contentSlot, let overlaySlot else {
      NSLog("[TradingCharts] Could not prepare Metal overlay buffer")
      return
    }

    do {
      let encodeId = OSSignpostID(log: ChartPerformance.log)
      os_signpost(
        .begin,
        log: ChartPerformance.log,
        name: "Metal Encode Commit",
        signpostID: encodeId,
        "vertices=%{public}lu",
        (contentBytes + overlayBytes) / MemoryLayout<Float>.stride / 6
      )
      defer {
        os_signpost(
          .end,
          log: ChartPerformance.log,
          name: "Metal Encode Commit",
          signpostID: encodeId
        )
      }
      guard
        let command = commandQueue.makeCommandBuffer(),
        let encoder = command.makeRenderCommandEncoder(descriptor: pass)
      else {
        NSLog("[TradingCharts] Could not create Metal command buffer or encoder")
        return
      }
      encoder.setRenderPipelineState(pipeline)
      var uniforms = MetalUniforms(viewportSize: SIMD2(frame.width, frame.height))
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<MetalUniforms>.stride, index: 1)
      if contentBytes > 0, let contentBuffer = contentSlot.buffer {
        encoder.setVertexBuffer(contentBuffer, offset: 0, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: frame.contentVertexCount / 6)
      }
      if overlayBytes > 0, let overlayBuffer = overlaySlot.buffer {
        encoder.setVertexBuffer(overlayBuffer, offset: 0, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: frame.overlayVertexCount / 6)
      }
      encoder.endEncoding()
      command.present(drawable)
      command.addCompletedHandler { [contentPool, overlayPool, flightState, frame] command in
        if command.status == .error {
          NSLog("[TradingCharts] Metal command failed: %@", String(describing: command.error))
        }
        DispatchQueue.main.async {
          withExtendedLifetime(frame) {
            contentPool.release(contentSlot)
            overlayPool.release(overlaySlot)
            flightState.finishFrame()
          }
        }
      }
      committed = true
      command.commit()
    }
    onDidCommit?(frame)
  }

  private func makePipeline(view: MTKView) -> MTLRenderPipelineState? {
    var library = device.makeDefaultLibrary()
    var vertex = library?.makeFunction(name: "trading_charts_vertex")
    var fragment = library?.makeFunction(name: "trading_charts_fragment")
    if vertex == nil || fragment == nil {
      do {
        library = try device.makeLibrary(source: Self.fallbackShader, options: nil)
        vertex = library?.makeFunction(name: "trading_charts_vertex")
        fragment = library?.makeFunction(name: "trading_charts_fragment")
      } catch {
        NSLog("[TradingCharts] Metal shader error: %@", String(describing: error))
      }
    }
    guard let vertex, let fragment else { return nil }
    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.vertexFunction = vertex
    descriptor.fragmentFunction = fragment
    descriptor.colorAttachments[0].pixelFormat = view.colorPixelFormat
    descriptor.colorAttachments[0].isBlendingEnabled = true
    descriptor.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
    descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
    descriptor.colorAttachments[0].sourceAlphaBlendFactor = .one
    descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
    do {
      return try device.makeRenderPipelineState(descriptor: descriptor)
    } catch {
      NSLog("[TradingCharts] Metal pipeline error: %@", String(describing: error))
      return nil
    }
  }

  private static let fallbackShader = """
    #include <metal_stdlib>
    using namespace metal;
    struct VertexOut { float4 position [[position]]; float4 color; };
    struct Uniforms { float2 viewportSize; };
    vertex VertexOut trading_charts_vertex(uint vertexId [[vertex_id]],
        const device float *vertices [[buffer(0)]],
        constant Uniforms &uniforms [[buffer(1)]]) {
      uint offset = vertexId * 6;
      float2 point = float2(vertices[offset], vertices[offset + 1]);
      float2 safeSize = max(uniforms.viewportSize, float2(1.0));
      float2 normalized = point / safeSize;
      VertexOut out;
      out.position = float4(normalized.x * 2.0 - 1.0,
          1.0 - normalized.y * 2.0, 0.0, 1.0);
      out.color = float4(vertices[offset + 2], vertices[offset + 3],
          vertices[offset + 4], vertices[offset + 5]);
      return out;
    }
    fragment float4 trading_charts_fragment(VertexOut in [[stage_in]]) {
      return in.color;
    }
    """
}
