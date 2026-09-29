// Copyright 2026 Kirill Novikov
// SPDX-License-Identifier: MIT

import Metal
import UIKit

final class ChartMarkerVariantAtlas {
  enum FillResult {
    case filled, pendingLayout, failed
  }

  private static var capacity: Int { ChartEngineClient.markerVariantCapacity }
  private static var cell: CGFloat { CGFloat(ChartEngineClient.markerVariantCell) }

  private let device: MTLDevice
  private var cells: [String: Int] = [:]
  private var mountedTemplates: [String: UIView] = [:]
  private var unmatchedNames = Set<String>()
  private var loggedUnmatchedNames = Set<String>()
  private var rasterizedNames = Set<String>()
  private var cellPixelWidth = 0
  private var cellPixelHeight = 0
  private var backingPixels: [UInt8] = []
  private var texture: MTLTexture?
  private var textureIsExposed = false

  init(device: MTLDevice) {
    self.device = device
  }

  func assign(_ name: String) -> Int? {
    if let cell = cells[name] {
      if mountedTemplates[name] == nil, !rasterizedNames.contains(name) {
        unmatchedNames.insert(name)
      }
      return cell
    }
    guard cells.count < Self.capacity else { return nil }
    let cell = cells.count
    cells[name] = cell
    if mountedTemplates[name] == nil {
      unmatchedNames.insert(name)
    }
    return cell
  }

  @discardableResult
  func mount(_ view: UIView, name: String) -> Bool {
    if let mounted = mountedTemplates[name], mounted !== view {
      NSLog(
        "[TradingCharts] duplicate marker variant '%@'; keeping the first mounted template",
        name
      )
      return false
    }
    mountedTemplates[name] = view
    unmatchedNames.remove(name)
    loggedUnmatchedNames.remove(name)
    return true
  }

  func unmount(_ view: UIView) -> String? {
    guard let mounted = mountedTemplates.first(where: { $0.value === view }) else { return nil }
    mountedTemplates.removeValue(forKey: mounted.key)
    if cells[mounted.key] != nil, !rasterizedNames.contains(mounted.key) {
      unmatchedNames.insert(mounted.key)
    }
    return mounted.key
  }

  func clearMountedTemplates() {
    mountedTemplates.removeAll(keepingCapacity: true)
    unmatchedNames.removeAll(keepingCapacity: true)
    loggedUnmatchedNames.removeAll(keepingCapacity: true)
  }

  func logUnmatchedTemplates() {
    for name in unmatchedNames where loggedUnmatchedNames.insert(name).inserted {
      NSLog(
        "[TradingCharts] variant '%@' has no mounted template and will remain transparent",
        name
      )
    }
  }

  /// Templates are rasterized once. Later content changes at the same size are not observed.
  func fill(_ view: UIView, name: String, scale: CGFloat) -> FillResult {
    if rasterizedNames.contains(name) {
      return .filled
    }
    guard let cellIndex = assign(name) else {
      NSLog("[TradingCharts] marker variant atlas is full; could not assign '%@'", name)
      return .failed
    }

    view.layoutIfNeeded()
    guard view.bounds.width > 0, view.bounds.height > 0 else { return .pendingLayout }
    if view.bounds.width != Self.cell || view.bounds.height != Self.cell {
      NSLog(
        "[TradingCharts] marker variant '%@' is %.2fx%.2f points; expected %.2fx%.2f and will clip",
        name,
        view.bounds.width,
        view.bounds.height,
        Self.cell,
        Self.cell
      )
    }

    let format = UIGraphicsImageRendererFormat()
    format.scale = scale
    format.opaque = false
    format.preferredRange = .standard
    let image = UIGraphicsImageRenderer(
      size: CGSize(width: Self.cell, height: Self.cell),
      format: format
    ).image { context in
      view.layer.render(in: context.cgContext)
    }
    guard let cgImage = image.cgImage,
          let pixels = Self.rgbaPixels(from: cgImage)
    else {
      NSLog("[TradingCharts] Could not convert marker variant '%@' to RGBA8", name)
      return .failed
    }
    guard prepareBacking(width: cgImage.width, height: cgImage.height) else {
      NSLog("[TradingCharts] marker variant '%@' raster scale changed; keeping the existing atlas", name)
      return .failed
    }
    writeCell(pixels, at: cellIndex)

    if texture == nil || textureIsExposed {
      guard let replacement = makeTexture() else {
        NSLog("[TradingCharts] Could not allocate marker variant atlas texture")
        return .failed
      }
      uploadAll(to: replacement)
      texture = replacement
      textureIsExposed = false
    } else if let texture {
      uploadCell(at: cellIndex, to: texture)
    }
    rasterizedNames.insert(name)
    return .filled
  }

  func captureTexture() -> MTLTexture? {
    if texture != nil {
      textureIsExposed = true
    }
    return texture
  }

  private func prepareBacking(width: Int, height: Int) -> Bool {
    if cellPixelWidth == 0 {
      cellPixelWidth = width
      cellPixelHeight = height
      backingPixels = [UInt8](
        repeating: 0,
        count: width * Self.capacity * height * MemoryLayout<UInt32>.stride
      )
      return true
    }
    return cellPixelWidth == width && cellPixelHeight == height
  }

  private func writeCell(_ pixels: [UInt8], at cellIndex: Int) {
    let cellBytesPerRow = cellPixelWidth * 4
    let atlasBytesPerRow = cellBytesPerRow * Self.capacity
    backingPixels.withUnsafeMutableBytes { destination in
      pixels.withUnsafeBytes { source in
        guard let destinationBase = destination.baseAddress,
              let sourceBase = source.baseAddress else { return }
        for row in 0..<cellPixelHeight {
          memcpy(
            destinationBase.advanced(by: row * atlasBytesPerRow + cellIndex * cellBytesPerRow),
            sourceBase.advanced(by: row * cellBytesPerRow),
            cellBytesPerRow
          )
        }
      }
    }
  }

  private func makeTexture() -> MTLTexture? {
    let descriptor = MTLTextureDescriptor.texture2DDescriptor(
      pixelFormat: .rgba8Unorm,
      width: cellPixelWidth * Self.capacity,
      height: cellPixelHeight,
      mipmapped: false
    )
    descriptor.usage = .shaderRead
    descriptor.storageMode = .shared
    return device.makeTexture(descriptor: descriptor)
  }

  private func uploadAll(to texture: MTLTexture) {
    let width = cellPixelWidth * Self.capacity
    backingPixels.withUnsafeBytes { bytes in
      guard let address = bytes.baseAddress else { return }
      texture.replace(
        region: MTLRegionMake2D(0, 0, width, cellPixelHeight),
        mipmapLevel: 0,
        withBytes: address,
        bytesPerRow: width * 4
      )
    }
  }

  private func uploadCell(at cellIndex: Int, to texture: MTLTexture) {
    let cellBytesPerRow = cellPixelWidth * 4
    let atlasBytesPerRow = cellBytesPerRow * Self.capacity
    backingPixels.withUnsafeBytes { bytes in
      guard let address = bytes.baseAddress else { return }
      texture.replace(
        region: MTLRegionMake2D(
          cellIndex * cellPixelWidth,
          0,
          cellPixelWidth,
          cellPixelHeight
        ),
        mipmapLevel: 0,
        withBytes: address.advanced(by: cellIndex * cellBytesPerRow),
        bytesPerRow: atlasBytesPerRow
      )
    }
  }

  private static func rgbaPixels(from image: CGImage) -> [UInt8]? {
    let bytesPerRow = image.width * 4
    var pixels = [UInt8](repeating: 0, count: bytesPerRow * image.height)
    let converted = pixels.withUnsafeMutableBytes { bytes -> Bool in
      guard let address = bytes.baseAddress,
            let context = CGContext(
              data: address,
              width: image.width,
              height: image.height,
              bitsPerComponent: 8,
              bytesPerRow: bytesPerRow,
              space: CGColorSpaceCreateDeviceRGB(),
              bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue
                | CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
      return true
    }
    return converted ? pixels : nil
  }
}
