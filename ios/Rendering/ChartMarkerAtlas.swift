// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Metal
import UIKit

/// Immutable ASCII atlas. Only alpha is sampled, so text color never changes it.
final class ChartMarkerAtlas {
  let texture: MTLTexture

  static func metrics(size: Double) -> [Double] {
    let font = UIFont.monospacedSystemFont(ofSize: size, weight: .bold)
    let advance = ("M" as NSString).size(withAttributes: [.font: font]).width
    let lineHeight = ceil(font.lineHeight)
    return [advance, lineHeight, ceil(advance + 4), lineHeight + 4]
  }

  init?(device: MTLDevice, size: Double, scale: CGFloat) {
    let metrics = Self.metrics(size: size)
    let cellWidth = metrics[2]
    let cellHeight = metrics[3]
    let width = cellWidth * 16
    let height = cellHeight * 6
    // Very large logical badges still use a bounded texture and GPU scaling.
    let format = UIGraphicsImageRendererFormat()
    format.scale = min(scale, 4096 / max(width, height))
    format.opaque = false
    format.preferredRange = .standard
    let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
      let font = UIFont.monospacedSystemFont(ofSize: size, weight: .bold)
      let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
      for glyph in 0..<95 {
        let character = String(UnicodeScalar(glyph + 32)!) as NSString
        character.draw(
          at: CGPoint(x: Double(glyph % 16) * cellWidth + 2, y: Double(glyph / 16) * cellHeight + 2),
          withAttributes: attributes
        )
      }
      context.cgContext.setFillColor(UIColor.white.cgColor)
      context.cgContext.fill(CGRect(x: 15 * cellWidth, y: 5 * cellHeight, width: cellWidth, height: cellHeight))
    }
    guard let cgImage = image.cgImage,
          let texture = Self.upload(cgImage, device: device) else { return nil }
    self.texture = texture
  }

  private static func upload(_ image: CGImage, device: MTLDevice) -> MTLTexture? {
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(
      pixelFormat: .rgba8Unorm, width: image.width, height: image.height, mipmapped: false
    )
    descriptor.usage = .shaderRead
    descriptor.storageMode = .shared
    guard let texture = device.makeTexture(descriptor: descriptor) else {
      NSLog("[TradingCharts] Could not allocate marker atlas texture")
      return nil
    }
    // UIKit can produce a grayscale/alpha CGImage that MTKTextureLoader rejects.
    // Convert explicitly, then upload the same RGBA8 format on device and simulator.
    let bytesPerRow = image.width * 4
    var pixels = [UInt8](repeating: 0, count: bytesPerRow * image.height)
    let uploaded = pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard let address = bytes.baseAddress,
            let context = CGContext(
              data: address, width: image.width, height: image.height, bitsPerComponent: 8,
              bytesPerRow: bytesPerRow, space: CGColorSpaceCreateDeviceRGB(),
              bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
      texture.replace(
        region: MTLRegionMake2D(0, 0, image.width, image.height), mipmapLevel: 0,
        withBytes: address, bytesPerRow: bytesPerRow
      )
      return true
    }
    if !uploaded { NSLog("[TradingCharts] Could not convert marker atlas to RGBA8") }
    return uploaded ? texture : nil
  }
}
