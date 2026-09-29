// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

#if MARKER_VARIANTS
import MetalKit

/// Owns the independent GPU pass for view-rasterized marker variants.
final class ChartMarkerVariantRenderer {
  struct Prepared {
    let slot: ChartVertexBufferPool<MTLBuffer>.Slot?
    let texture: MTLTexture?
  }

  private let atlas: ChartMarkerVariantAtlas
  private let pool: ChartVertexBufferPool<MTLBuffer>
  private let pipeline: MTLRenderPipelineState?

  init(view: MTKView, atlas: ChartMarkerVariantAtlas) {
    let device = view.device!
    self.atlas = atlas
    pool = ChartVertexBufferPool {
      device.makeBuffer(length: $0, options: .storageModeShared)
    }
    let library: MTLLibrary?
    do {
      library = try device.makeLibrary(source: Self.shader, options: nil)
    } catch {
      NSLog("[TradingCharts] Marker variant shader error: %@", String(describing: error))
      library = nil
    }
    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.vertexFunction = library?.makeFunction(name: "marker_variant_vertex")
    descriptor.fragmentFunction = library?.makeFunction(name: "marker_variant_fragment")
    descriptor.colorAttachments[0].pixelFormat = view.colorPixelFormat
    descriptor.colorAttachments[0].isBlendingEnabled = true
    descriptor.colorAttachments[0].sourceRGBBlendFactor = .one
    descriptor.colorAttachments[0].destinationRGBBlendFactor = .oneMinusSourceAlpha
    descriptor.colorAttachments[0].sourceAlphaBlendFactor = .one
    descriptor.colorAttachments[0].destinationAlphaBlendFactor = .oneMinusSourceAlpha
    do {
      pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
    } catch {
      NSLog("[TradingCharts] Marker variant pipeline error: %@", String(describing: error))
      pipeline = nil
    }
  }

  func prepare(_ frame: ChartRenderFrame) -> Prepared? {
    let texture = atlas.captureTexture()
    guard frame.variantVertexCount > 0, texture != nil else {
      return Prepared(slot: nil, texture: texture)
    }
    guard pipeline != nil else { return nil }
    let bytes = frame.variantVertexCount * MemoryLayout<Float>.stride
    guard let slot = pool.acquire(
      revision: frame.markerRevision,
      byteCount: bytes,
      upload: { buffer in
        frame.withVariantVertices { vertices in
          guard let source = vertices.baseAddress else { return false }
          memcpy(buffer.contents(), source, bytes)
          return true
        }
      }
    ) else { return nil }
    return Prepared(slot: slot, texture: texture)
  }

  func encode(_ prepared: Prepared, encoder: MTLRenderCommandEncoder, frame: ChartRenderFrame) {
    guard let pipeline,
          let texture = prepared.texture,
          let buffer = prepared.slot?.buffer,
          frame.variantVertexCount > 0
    else { return }
    encoder.setRenderPipelineState(pipeline)
    var viewport = SIMD2(frame.width, frame.height)
    encoder.setVertexBytes(&viewport, length: MemoryLayout<SIMD2<Float>>.stride, index: 1)
    encoder.setVertexBuffer(buffer, offset: 0, index: 0)
    encoder.setFragmentTexture(texture, index: 0)
    encoder.drawPrimitives(
      type: .triangle,
      vertexStart: 0,
      vertexCount: frame.variantVertexCount / ChartEngineClient.markerVariantFloatsPerVertex
    )
  }

  func release(_ prepared: Prepared) {
    if let slot = prepared.slot {
      pool.release(slot)
    }
  }

  private static let shader = """
    #include <metal_stdlib>
    using namespace metal;
    struct MarkerVariantVertex { float4 position [[position]]; float2 uv; };
    vertex MarkerVariantVertex marker_variant_vertex(uint id [[vertex_id]],
      const device float *data [[buffer(0)]], constant float2 &viewport [[buffer(1)]]) {
      uint offset = id * 4;
      float2 p = float2(data[offset], data[offset + 1]) / max(viewport, float2(1.0));
      MarkerVariantVertex out;
      out.position = float4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0, 1);
      out.uv = float2(data[offset + 2], data[offset + 3]);
      return out;
    }
    fragment float4 marker_variant_fragment(
      MarkerVariantVertex in [[stage_in]], texture2d<float> atlas [[texture(0)]]) {
      constexpr sampler s(filter::linear, address::clamp_to_edge);
      return atlas.sample(s, in.uv);
    }
    """
}
#endif
