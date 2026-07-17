#include <metal_stdlib>
using namespace metal;

struct VertexOut {
  float4 position [[position]];
  float4 color;
};

struct Uniforms {
  float2 viewportSize;
};

vertex VertexOut trading_charts_vertex(uint vertexId [[vertex_id]],
                                       const device float *vertices [[buffer(0)]],
                                       constant Uniforms &uniforms [[buffer(1)]]) {
  uint offset = vertexId * 6;
  float2 point = float2(vertices[offset], vertices[offset + 1]);
  float2 safeSize = max(uniforms.viewportSize, float2(1.0));
  float2 normalized = point / safeSize;
  VertexOut out;
  out.position = float4(normalized.x * 2.0 - 1.0,
                        1.0 - normalized.y * 2.0,
                        0.0,
                        1.0);
  out.color = float4(vertices[offset + 2], vertices[offset + 3],
                     vertices[offset + 4], vertices[offset + 5]);
  return out;
}

fragment float4 trading_charts_fragment(VertexOut in [[stage_in]]) {
  return in.color;
}
