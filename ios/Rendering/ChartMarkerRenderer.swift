// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import MetalKit

/// Owns only marker GPU resources; placement comes from the shared snapshot.
final class ChartMarkerRenderer {
  struct Prepared {
    let slot: ChartVertexBufferPool<MTLBuffer>.Slot
    let batches: [ChartMarkerBatch]
    let atlases: [ChartMarkerAtlas]
  }

  private let device: MTLDevice
  private let pool: ChartVertexBufferPool<MTLBuffer>
  private let pipeline: MTLRenderPipelineState?
  private var atlases: [Double: ChartMarkerAtlas] = [:]
  private var atlasScale: CGFloat = 0
  private var cachedRevision: UInt64?
  private var cachedBatches: [ChartMarkerBatch] = []
  private var cachedAtlases: [ChartMarkerAtlas] = []

  init(view: MTKView) {
    let device = view.device!
    self.device = device
    pool = ChartVertexBufferPool { device.makeBuffer(length: $0, options: .storageModeShared) }
    let library: MTLLibrary?
    do {
      library = try device.makeLibrary(source: Self.shader, options: nil)
    } catch {
      NSLog("[TradingCharts] Marker shader error: %@", String(describing: error))
      library = nil
    }
    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.vertexFunction = library?.makeFunction(name: "marker_vertex")
    descriptor.fragmentFunction = library?.makeFunction(name: "marker_fragment")
    descriptor.colorAttachments[0].pixelFormat = view.colorPixelFormat
    descriptor.colorAttachments[0].isBlendingEnabled = true
    descriptor.colorAttachments[0].sourceRGBBlendFactor = .sourceAlpha
    descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
    descriptor.colorAttachments[0].sourceAlphaBlendFactor = .one
    descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
    do {
      pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
    } catch {
      NSLog("[TradingCharts] Marker pipeline error: %@", String(describing: error))
      pipeline = nil
    }
  }

  func prepare(_ frame: ChartRenderFrame, scale: CGFloat) -> Prepared? {
    guard frame.markerVertexCount == 0 || pipeline != nil else { return nil }
    if atlasScale != scale {
      // Submitted commands retain their immutable old atlases through Prepared.
      atlases.removeAll()
      atlasScale = scale
      cachedRevision = nil
    }
    if cachedRevision != frame.markerRevision {
      var batches: [ChartMarkerBatch] = []
      var textures: [ChartMarkerAtlas] = []
      for index in 0..<frame.markerBatchCount {
        let batch = frame.markerBatch(at: index)
        if atlases[batch.fontSize] == nil {
          atlases[batch.fontSize] = ChartMarkerAtlas(device: device, size: batch.fontSize, scale: scale)
        }
        guard let atlas = atlases[batch.fontSize] else { return nil }
        batches.append(batch)
        textures.append(atlas)
      }
      cachedBatches = batches
      cachedAtlases = textures
      cachedRevision = frame.markerRevision
      if atlases.count > 64 {
        let active = Set(batches.map(\.fontSize))
        atlases = atlases.filter { active.contains($0.key) }
      }
    }
    let bytes = frame.markerVertexCount * MemoryLayout<Float>.stride
    guard let slot = pool.acquire(revision: frame.markerRevision, byteCount: bytes, upload: { buffer in
      frame.withMarkerVertices { vertices in
        guard let source = vertices.baseAddress else { return false }
        memcpy(buffer.contents(), source, bytes)
        return true
      }
    }) else { return nil }
    return Prepared(slot: slot, batches: cachedBatches, atlases: cachedAtlases)
  }

  func encode(_ prepared: Prepared, encoder: MTLRenderCommandEncoder, frame: ChartRenderFrame) {
    guard let pipeline, let buffer = prepared.slot.buffer, !prepared.batches.isEmpty else { return }
    encoder.setRenderPipelineState(pipeline)
    var viewport = SIMD2(frame.width, frame.height)
    encoder.setVertexBytes(&viewport, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
    encoder.setVertexBuffer(buffer, offset: 0, index: 0)
    for (index, batch) in prepared.batches.enumerated() {
      encoder.setFragmentTexture(prepared.atlases[index].texture, index: 0)
      encoder.drawPrimitives(type: .triangle, vertexStart: batch.firstVertex, vertexCount: batch.vertexCount)
    }
  }

  func release(_ prepared: Prepared) { pool.release(prepared.slot) }

  private static let shader = """
    #include <metal_stdlib>
    using namespace metal;
    struct MarkerVertex { float4 position [[position]]; float2 uv; float4 color; };
    vertex MarkerVertex marker_vertex(uint id [[vertex_id]],
      const device float *data [[buffer(0)]], constant float2 &viewport [[buffer(1)]]) {
      uint offset = id * 8;
      float2 p = float2(data[offset], data[offset + 1]) / max(viewport, float2(1.0));
      MarkerVertex out;
      out.position = float4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0, 1);
      out.uv = float2(data[offset + 2], data[offset + 3]);
      out.color = float4(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
      return out;
    }
    fragment float4 marker_fragment(MarkerVertex in [[stage_in]], texture2d<float> atlas [[texture(0)]]) {
      constexpr sampler sample(filter::linear, address::clamp_to_edge);
      return float4(in.color.rgb, in.color.a * atlas.sample(sample, in.uv).a);
    }
    """
}
