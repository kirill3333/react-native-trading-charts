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
  private var contentBuffer: MTLBuffer?
  private var contentCapacity = 0
  private var overlayBuffer: MTLBuffer?
  private var overlayCapacity = 0
  private var frame: ChartRenderFrame?
  private var background = NativeColor()
  private var uploadedContentRevision: UInt64 = 0
  private var uploadedRevision: UInt64 = 0

  init(view: MTKView) {
    device = view.device!
    commandQueue = device.makeCommandQueue()
    super.init()
    pipeline = makePipeline(view: view)
  }

  func submit(_ frame: ChartRenderFrame, background: NativeColor) {
    self.frame = frame
    self.background = background
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  func draw(in view: MTKView) {
    guard let frame else { return }
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
    guard let drawable, let pass, let pipeline else { return }

    let contentBytes = frame.contentVertexCount * MemoryLayout<Float>.stride
    let overlayBytes = frame.overlayVertexCount * MemoryLayout<Float>.stride
    if frame.contentRevision != uploadedContentRevision {
      if contentBytes > contentCapacity {
        contentCapacity = max(contentBytes + 4_096, 4_096)
        contentBuffer = device.makeBuffer(length: contentCapacity, options: .storageModeShared)
      }
      if contentBytes > 0, let contentBuffer {
        let uploadId = OSSignpostID(log: ChartPerformance.log)
        os_signpost(
          .begin,
          log: ChartPerformance.log,
          name: "Metal Vertex Memcpy",
          signpostID: uploadId,
          "bytes=%{public}lu",
          contentBytes
        )
        frame.withContentVertices { vertices in
          if let source = vertices.baseAddress {
            memcpy(contentBuffer.contents(), source, contentBytes)
          }
        }
        os_signpost(
          .end,
          log: ChartPerformance.log,
          name: "Metal Vertex Memcpy",
          signpostID: uploadId
        )
      }
      uploadedContentRevision = frame.contentRevision
    }
    if frame.revision != uploadedRevision {
      if overlayBytes > overlayCapacity {
        overlayCapacity = max(overlayBytes + 4_096, 4_096)
        overlayBuffer = device.makeBuffer(length: overlayCapacity, options: .storageModeShared)
      }
      if overlayBytes > 0, let overlayBuffer {
        frame.withOverlayVertices { vertices in
          if let source = vertices.baseAddress {
            memcpy(overlayBuffer.contents(), source, overlayBytes)
          }
        }
      }
      uploadedRevision = frame.revision
    }

    let encodeId = OSSignpostID(log: ChartPerformance.log)
    os_signpost(
      .begin,
      log: ChartPerformance.log,
      name: "Metal Encode Commit",
      signpostID: encodeId,
      "vertices=%{public}lu",
      (contentBytes + overlayBytes) / MemoryLayout<Float>.stride / 6
    )
    guard
      let command = commandQueue?.makeCommandBuffer(),
      let encoder = command.makeRenderCommandEncoder(descriptor: pass)
    else { return }
    encoder.setRenderPipelineState(pipeline)
    var uniforms = MetalUniforms(viewportSize: SIMD2(frame.width, frame.height))
    encoder.setVertexBytes(&uniforms, length: MemoryLayout<MetalUniforms>.stride, index: 1)
    if contentBytes > 0, let contentBuffer {
      encoder.setVertexBuffer(contentBuffer, offset: 0, index: 0)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: frame.contentVertexCount / 6)
    }
    if overlayBytes > 0, let overlayBuffer {
      encoder.setVertexBuffer(overlayBuffer, offset: 0, index: 0)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: frame.overlayVertexCount / 6)
    }
    encoder.endEncoding()
    command.present(drawable)
    command.commit()
    os_signpost(
      .end,
      log: ChartPerformance.log,
      name: "Metal Encode Commit",
      signpostID: encodeId
    )
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
