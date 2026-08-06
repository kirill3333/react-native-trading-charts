#import "TradingChartsView.h"

#import <MetalKit/MetalKit.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTConversions.h>
#import <os/signpost.h>
#import <simd/simd.h>

#import <react/renderer/components/TradingChartsViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/TradingChartsViewSpec/EventEmitters.h>
#import <react/renderer/components/TradingChartsViewSpec/Props.h>
#import <react/renderer/components/TradingChartsViewSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"
#import "TradingChartsRegistry.h"

#include "cpp/chart_engine.h"
#include "cpp/internal/trading_time.h"

#include <array>
#include <cmath>
#include <cstdio>
#include <mutex>
#include <string>
#include <unordered_map>

using facebook::react::ComponentDescriptorProvider;
using facebook::react::Props;
using facebook::react::TradingChartsViewComponentDescriptor;
using facebook::react::TradingChartsViewEventEmitter;
using facebook::react::TradingChartsViewProps;
using facebook::react::concreteComponentDescriptorProvider;
using trading_charts::Candle;
using trading_charts::BucketOrigin;
using trading_charts::CandleTimestampPolicy;
using trading_charts::ChartConfig;
using trading_charts::ChartEngine;
using trading_charts::OhlcValueSource;
using trading_charts::OutsideSessionPolicy;
using trading_charts::PaneConfig;
using trading_charts::PriceExtremum;
using trading_charts::RenderSnapshot;
using trading_charts::ResolutionUnit;
using trading_charts::SeriesConfig;
using trading_charts::SeriesSource;
using trading_charts::SeriesType;
using trading_charts::UpdateStatus;
using trading_charts::TimeZoneTransition;
using trading_charts::TradingCalendarOverrideConfig;
using trading_charts::TradingSessionConfig;
using TCColor = trading_charts::Color;

static bool TCCandleEqual(const Candle &left, const Candle &right) {
  return left.timestamp == right.timestamp && left.open == right.open &&
      left.high == right.high && left.low == right.low &&
      left.close == right.close && left.volume == right.volume;
}

namespace {

constexpr CFTimeInterval TCPastEdgeDataWaitDuration = 1.5;

os_log_t TCPerformanceLog() {
  static os_log_t log = os_log_create("com.tradingcharts", "Rendering");
  return log;
}

UIColor *TCUIColor(const TCColor &color) {
  return [UIColor colorWithRed:color.r green:color.g blue:color.b alpha:color.a];
}

TCColor TCColorFromHex(NSString *value, TCColor fallback) {
  if (![value isKindOfClass:NSString.class]) return fallback;
  NSString *hex = [[value stringByReplacingOccurrencesOfString:@"#" withString:@""] uppercaseString];
  if (hex.length != 6 && hex.length != 8) return fallback;
  unsigned long long raw = 0;
  if (![[NSScanner scannerWithString:hex] scanHexLongLong:&raw]) return fallback;
  if (hex.length == 6) {
    return TCColor{static_cast<float>((raw >> 16) & 0xFF) / 255.0f,
                   static_cast<float>((raw >> 8) & 0xFF) / 255.0f,
                   static_cast<float>(raw & 0xFF) / 255.0f,
                   1.0f};
  }
  return TCColor{static_cast<float>((raw >> 24) & 0xFF) / 255.0f,
                 static_cast<float>((raw >> 16) & 0xFF) / 255.0f,
                 static_cast<float>((raw >> 8) & 0xFF) / 255.0f,
                 static_cast<float>(raw & 0xFF) / 255.0f};
}

struct TCBorderConfig {
  TCColor color;
  CGFloat width = 0;
  CGFloat radius = 0;
};

UIFontWeight TCFontWeightFromName(NSString *value, UIFontWeight fallback) {
  if ([value isEqualToString:@"regular"]) return UIFontWeightRegular;
  if ([value isEqualToString:@"medium"]) return UIFontWeightMedium;
  if ([value isEqualToString:@"semibold"]) return UIFontWeightSemibold;
  if ([value isEqualToString:@"bold"]) return UIFontWeightBold;
  return fallback;
}

NSDictionary<NSAttributedStringKey, id> *TCTextAttributes(
    NSDictionary *style, TCColor fallbackColor, CGFloat fallbackSize, UIFontWeight fallbackWeight) {
  const CGFloat size = style[@"fontSize"] ? [style[@"fontSize"] doubleValue] : fallbackSize;
  NSString *family = style[@"fontFamily"];
  UIFont *font = family.length > 0 ? [UIFont fontWithName:family size:size] : nil;
  if (!font) {
    font = [UIFont monospacedDigitSystemFontOfSize:size
                                           weight:TCFontWeightFromName(style[@"fontWeight"],
                                                                        fallbackWeight)];
  }
  return @{
    NSFontAttributeName : font,
    NSForegroundColorAttributeName : TCUIColor(TCColorFromHex(style[@"color"], fallbackColor)),
  };
}

TCBorderConfig TCBorderFromJson(NSDictionary *json, CGFloat fallbackRadius) {
  TCBorderConfig border;
  border.color = TCColorFromHex(json[@"color"], TCColor{0, 0, 0, 0});
  border.width = json[@"width"] ? [json[@"width"] doubleValue] : 0;
  border.radius = json[@"radius"] ? [json[@"radius"] doubleValue] : fallbackRadius;
  return border;
}

NSDateFormatter *TCDateFormatter(NSString *pattern, NSString *localeName,
                                 NSString *timeZoneName, NSString *fallbackPattern) {
  NSDateFormatter *formatter = [NSDateFormatter new];
  formatter.locale = [NSLocale localeWithLocaleIdentifier:localeName ?: @"en-GB"];
  formatter.timeZone = [NSTimeZone timeZoneWithName:timeZoneName ?: @"UTC"] ?: NSTimeZone.defaultTimeZone;
  @try {
    formatter.dateFormat = pattern.length > 0 ? pattern : fallbackPattern;
  } @catch (NSException *exception) {
    NSLog(@"[TradingCharts] Invalid date pattern %@; using %@", pattern, fallbackPattern);
    formatter.dateFormat = fallbackPattern;
  }
  return formatter;
}

NSArray<NSNumber *> *TCArrayOrEmpty(id value) {
  return [value isKindOfClass:NSArray.class] ? value : @[];
}

NSArray *TCJsonArrayOrEmpty(id value) {
  return [value isKindOfClass:NSArray.class] ? value : @[];
}

std::vector<double> TCDoubles(NSArray<NSNumber *> *values) {
  std::vector<double> result;
  result.reserve(values.count);
  for (NSNumber *value in values) result.push_back(value.doubleValue);
  return result;
}

ResolutionUnit TCResolutionUnit(NSString *value) {
  if ([value isEqualToString:@"second"]) return ResolutionUnit::kSecond;
  if ([value isEqualToString:@"minute"]) return ResolutionUnit::kMinute;
  if ([value isEqualToString:@"hour"]) return ResolutionUnit::kHour;
  if ([value isEqualToString:@"day"]) return ResolutionUnit::kDay;
  if ([value isEqualToString:@"week"]) return ResolutionUnit::kWeek;
  if ([value isEqualToString:@"month"]) return ResolutionUnit::kMonth;
  return ResolutionUnit::kFixed;
}

trading_charts::CivilDate TCCivilDate(NSString *value) {
  int year = 1970;
  int month = 1;
  int day = 1;
  if ([value isKindOfClass:NSString.class]) {
    std::sscanf(value.UTF8String, "%d-%d-%d", &year, &month, &day);
  }
  return trading_charts::CivilDate{year, month, day};
}

TradingSessionConfig TCSessionConfig(NSDictionary *value,
                                     std::uint8_t weekdayMask) {
  return TradingSessionConfig{
      weekdayMask,
      [value[@"startSeconds"] intValue],
      [value[@"endSeconds"] intValue],
      [value[@"startDayOffset"] intValue],
      [value[@"endDayOffset"] intValue],
  };
}

std::vector<TimeZoneTransition> TCTimeZoneTransitions(NSTimeZone *timeZone) {
  const std::string cacheKey = timeZone.name.UTF8String ?: "UTC";
  static std::mutex cacheMutex;
  static std::unordered_map<std::string, std::vector<TimeZoneTransition>> cache;
  {
    std::lock_guard<std::mutex> lock(cacheMutex);
    const auto existing = cache.find(cacheKey);
    if (existing != cache.end()) return existing->second;
  }

  constexpr NSTimeInterval kRangeEndSeconds = 4133980800.0;  // 2101-01-01.
  NSDate *epoch = [NSDate dateWithTimeIntervalSince1970:0];
  NSDate *rangeEnd = [NSDate dateWithTimeIntervalSince1970:kRangeEndSeconds];
  std::vector<TimeZoneTransition> result;
  result.push_back(TimeZoneTransition{
      0, static_cast<int>([timeZone secondsFromGMTForDate:epoch])});
  NSDate *cursor = [epoch dateByAddingTimeInterval:-1.0];
  while (true) {
    NSDate *transition =
        [timeZone nextDaylightSavingTimeTransitionAfterDate:cursor];
    if (!transition || [transition compare:rangeEnd] != NSOrderedAscending) break;
    NSDate *after = [transition dateByAddingTimeInterval:1.0];
    result.push_back(TimeZoneTransition{
        static_cast<std::int64_t>(
            std::llround(transition.timeIntervalSince1970 * 1000.0)),
        static_cast<int>([timeZone secondsFromGMTForDate:after]),
    });
    cursor = after;
  }
  {
    std::lock_guard<std::mutex> lock(cacheMutex);
    cache.emplace(cacheKey, result);
  }
  return result;
}

void TCLogStatus(UpdateStatus status, NSString *operation) {
  if (status == UpdateStatus::kIgnoredOldTimestamp) {
    NSLog(@"[TradingCharts] %@ ignored an out-of-order timestamp", operation);
  } else if (status == UpdateStatus::kInvalidInput) {
    NSLog(@"[TradingCharts] %@ received invalid data", operation);
  } else if (status == UpdateStatus::kIgnoredOutsideSession) {
    NSLog(@"[TradingCharts] %@ ignored a trade outside the configured session", operation);
  }
}

}  // namespace

typedef struct {
  vector_float2 viewportSize;
} TCMetalUniforms;

NSString *TCMetalShaderSource(void) {
  return @"#include <metal_stdlib>\n"
         "using namespace metal;\n"
         "struct VertexOut { float4 position [[position]]; float4 color; };\n"
         "struct Uniforms { float2 viewportSize; };\n"
         "vertex VertexOut trading_charts_vertex(uint vertexId [[vertex_id]], "
         "const device float *vertices [[buffer(0)]], "
         "constant Uniforms &uniforms [[buffer(1)]]) {\n"
         "  uint offset = vertexId * 6;\n"
         "  float2 point = float2(vertices[offset], vertices[offset + 1]);\n"
         "  float2 safeSize = max(uniforms.viewportSize, float2(1.0));\n"
         "  float2 normalized = point / safeSize;\n"
         "  VertexOut out;\n"
         "  out.position = float4(normalized.x * 2.0 - 1.0, "
         "1.0 - normalized.y * 2.0, 0.0, 1.0);\n"
         "  out.color = float4(vertices[offset + 2], vertices[offset + 3], "
         "vertices[offset + 4], vertices[offset + 5]);\n"
         "  return out;\n"
         "}\n"
         "fragment float4 trading_charts_fragment(VertexOut in [[stage_in]]) "
         "{ return in.color; }\n";
}

@interface TCMetalRenderer : NSObject <MTKViewDelegate>
- (instancetype)initWithView:(MTKView *)view;
- (void)setSnapshot:(std::shared_ptr<const RenderSnapshot>)snapshot;
@end

@implementation TCMetalRenderer {
  id<MTLDevice> _device;
  id<MTLCommandQueue> _commandQueue;
  id<MTLRenderPipelineState> _pipeline;
  id<MTLBuffer> _contentBuffer;
  NSUInteger _contentCapacity;
  id<MTLBuffer> _overlayBuffer;
  NSUInteger _overlayCapacity;
  std::shared_ptr<const RenderSnapshot> _snapshot;
  uint64_t _uploadedContentRevision;
  uint64_t _uploadedRevision;
}

- (instancetype)initWithView:(MTKView *)view {
  if (self = [super init]) {
    _device = view.device;
    _commandQueue = [_device newCommandQueue];
    id<MTLLibrary> library = [_device newDefaultLibrary];
    id<MTLFunction> vertex = [library newFunctionWithName:@"trading_charts_vertex"];
    id<MTLFunction> fragment = [library newFunctionWithName:@"trading_charts_fragment"];
    if (!vertex || !fragment) {
      NSError *libraryError = nil;
      library = [_device newLibraryWithSource:TCMetalShaderSource()
                                      options:nil
                                        error:&libraryError];
      vertex = [library newFunctionWithName:@"trading_charts_vertex"];
      fragment = [library newFunctionWithName:@"trading_charts_fragment"];
      if (!library) NSLog(@"[TradingCharts] Metal shader error: %@", libraryError);
    }
    if (!vertex || !fragment) return self;
    MTLRenderPipelineDescriptor *descriptor = [MTLRenderPipelineDescriptor new];
    descriptor.vertexFunction = vertex;
    descriptor.fragmentFunction = fragment;
    descriptor.colorAttachments[0].pixelFormat = view.colorPixelFormat;
    descriptor.colorAttachments[0].blendingEnabled = YES;
    descriptor.colorAttachments[0].sourceRGBBlendFactor = MTLBlendFactorSourceAlpha;
    descriptor.colorAttachments[0].destinationRGBBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
    descriptor.colorAttachments[0].sourceAlphaBlendFactor = MTLBlendFactorOne;
    descriptor.colorAttachments[0].destinationAlphaBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
    NSError *error = nil;
    _pipeline = [_device newRenderPipelineStateWithDescriptor:descriptor error:&error];
    if (!_pipeline) NSLog(@"[TradingCharts] Metal pipeline error: %@", error);
  }
  return self;
}

- (void)setSnapshot:(std::shared_ptr<const RenderSnapshot>)snapshot {
  _snapshot = std::move(snapshot);
}

- (void)mtkView:(MTKView *)view drawableSizeWillChange:(CGSize)size {}

- (void)drawInMTKView:(MTKView *)view {
  auto snapshot = _snapshot;
  if (!snapshot) return;
  const TCColor bg = snapshot->config.background;
  view.clearColor = MTLClearColorMake(bg.r, bg.g, bg.b, bg.a);

  os_log_t performanceLog = TCPerformanceLog();
  os_signpost_id_t acquireSignpostID = os_signpost_id_generate(performanceLog);
  os_signpost_interval_begin(performanceLog, acquireSignpostID, "Metal Acquire Drawable",
                             "revision=%{public}llu",
                             static_cast<unsigned long long>(snapshot->revision));
  id<CAMetalDrawable> drawable = view.currentDrawable;
  MTLRenderPassDescriptor *pass = view.currentRenderPassDescriptor;
  os_signpost_interval_end(performanceLog, acquireSignpostID, "Metal Acquire Drawable");
  if (!drawable || !pass || !_pipeline) return;

  const std::shared_ptr<const std::vector<float>> &content = snapshot->content_vertices;
  const NSUInteger contentBytes = content ? content->size() * sizeof(float) : 0;
  const NSUInteger overlayBytes = snapshot->overlay_vertices.size() * sizeof(float);
  // Content geometry changes only with content_revision (crosshair moves do
  // not re-upload it); the small overlay buffer follows every revision.
  if (snapshot->content_revision != _uploadedContentRevision) {
    if (contentBytes > _contentCapacity) {
      _contentCapacity = MAX(contentBytes + 4096, 4096);
      _contentBuffer = [_device newBufferWithLength:_contentCapacity options:MTLResourceStorageModeShared];
    }
    if (contentBytes > 0) {
      os_signpost_id_t uploadSignpostID = os_signpost_id_generate(performanceLog);
      os_signpost_interval_begin(performanceLog, uploadSignpostID, "Metal Vertex Memcpy",
                                 "bytes=%{public}lu", static_cast<unsigned long>(contentBytes));
      memcpy(_contentBuffer.contents, content->data(), contentBytes);
      os_signpost_interval_end(performanceLog, uploadSignpostID, "Metal Vertex Memcpy");
    }
    _uploadedContentRevision = snapshot->content_revision;
  }
  if (snapshot->revision != _uploadedRevision) {
    if (overlayBytes > _overlayCapacity) {
      _overlayCapacity = MAX(overlayBytes + 4096, 4096);
      _overlayBuffer = [_device newBufferWithLength:_overlayCapacity options:MTLResourceStorageModeShared];
    }
    if (overlayBytes > 0) {
      memcpy(_overlayBuffer.contents, snapshot->overlay_vertices.data(), overlayBytes);
    }
    _uploadedRevision = snapshot->revision;
  }

  os_signpost_id_t encodingSignpostID = os_signpost_id_generate(performanceLog);
  os_signpost_interval_begin(performanceLog, encodingSignpostID, "Metal Encode Commit",
                             "vertices=%{public}lu",
                             static_cast<unsigned long>((contentBytes + overlayBytes) / sizeof(float) / 6));
  id<MTLCommandBuffer> command = [_commandQueue commandBuffer];
  id<MTLRenderCommandEncoder> encoder = [command renderCommandEncoderWithDescriptor:pass];
  [encoder setRenderPipelineState:_pipeline];
  TCMetalUniforms uniforms{simd_make_float2(static_cast<float>(snapshot->width),
                                            static_cast<float>(snapshot->height))};
  [encoder setVertexBytes:&uniforms length:sizeof(uniforms) atIndex:1];
  if (contentBytes > 0 && _contentBuffer) {
    [encoder setVertexBuffer:_contentBuffer offset:0 atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle
                vertexStart:0
                vertexCount:content->size() / 6];
  }
  if (overlayBytes > 0 && _overlayBuffer) {
    [encoder setVertexBuffer:_overlayBuffer offset:0 atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle
                vertexStart:0
                vertexCount:snapshot->overlay_vertices.size() / 6];
  }
  [encoder endEncoding];
  [command presentDrawable:drawable];
  [command commit];
  os_signpost_interval_end(performanceLog, encodingSignpostID, "Metal Encode Commit");
}

@end

@interface TCTextLayout : NSObject
@property(nonatomic, strong, readonly) NSAttributedString *attributedString;
@property(nonatomic, assign, readonly) CGSize size;
- (instancetype)initWithText:(NSString *)text
                  attributes:(NSDictionary<NSAttributedStringKey, id> *)attributes;
- (instancetype)initWithAttributedString:(NSAttributedString *)attributedString;
@end

@implementation TCTextLayout

- (instancetype)initWithText:(NSString *)text
                  attributes:(NSDictionary<NSAttributedStringKey, id> *)attributes {
  return [self initWithAttributedString:[[NSAttributedString alloc] initWithString:text
                                                                        attributes:attributes]];
}

- (instancetype)initWithAttributedString:(NSAttributedString *)attributedString {
  if (self = [super init]) {
    _attributedString = [attributedString copy];
    CGSize measured = _attributedString.size;
    _size = CGSizeMake(ceil(measured.width), ceil(measured.height));
  }
  return self;
}

@end

@interface TCTextLayerItem : NSObject
@property(nonatomic, strong, readonly) CATextLayer *layer;
@property(nonatomic, strong, nullable) TCTextLayout *layout;
- (instancetype)initWithParentLayer:(CALayer *)parentLayer;
@end

@implementation TCTextLayerItem

- (instancetype)initWithParentLayer:(CALayer *)parentLayer {
  if (self = [super init]) {
    _layer = [CATextLayer layer];
    _layer.contentsScale = UIScreen.mainScreen.scale;
    _layer.hidden = YES;
    _layer.wrapped = NO;
    _layer.truncationMode = kCATruncationNone;
    [parentLayer addSublayer:_layer];
  }
  return self;
}

@end

@interface TCValueFormatter : NSObject
@property(nonatomic, strong) NSNumberFormatter *numberFormatter;
@property(nonatomic, copy) NSString *currencySymbol;
@property(nonatomic, assign) BOOL compact;
@property(nonatomic, assign) BOOL significant;
@property(nonatomic, assign) NSInteger significantDigits;
@end

@implementation TCValueFormatter
@end

static double TCRoundToSignificant(double value, NSInteger digits) {
  const double magnitude = fabs(value);
  if (magnitude == 0.0 || !std::isfinite(magnitude)) return value;
  double exponent = floor(log10(magnitude));
  const double multiplier = pow(10.0, digits - 1);
  double normalized = magnitude / pow(10.0, exponent);
  normalized = round(normalized * multiplier) / multiplier;
  if (normalized >= 10.0) {
    normalized = 1.0;
    exponent += 1.0;
  }
  const double rounded = normalized * pow(10.0, exponent);
  return value < 0.0 ? -rounded : rounded;
}

static NSString *TCSubscriptInteger(NSUInteger value) {
  static NSString *const subscripts = @"₀₁₂₃₄₅₆₇₈₉";
  NSString *digits = [NSString stringWithFormat:@"%lu", (unsigned long)value];
  NSMutableString *result = [NSMutableString stringWithCapacity:digits.length];
  for (NSUInteger index = 0; index < digits.length; ++index) {
    const unichar digit = [digits characterAtIndex:index];
    [result appendString:[subscripts substringWithRange:NSMakeRange(digit - '0', 1)]];
  }
  return result;
}

static NSString *TCCryptoZeroCount(double value, TCValueFormatter *formatter) {
  constexpr NSInteger kMinimumZeroCount = 1;
  const double magnitude = fabs(value);
  if (magnitude == 0.0 || !std::isfinite(magnitude)) return nil;
  const NSInteger exponent = static_cast<NSInteger>(floor(log10(magnitude)));
  const NSInteger zeroCount = -exponent - 1;
  if (zeroCount < kMinimumZeroCount) return nil;

  const double multiplier = pow(10.0, formatter.significantDigits - 1);
  const double normalized = magnitude / pow(10.0, exponent);
  NSMutableString *significant = [[NSString
      stringWithFormat:@"%lld", llround(normalized * multiplier)] mutableCopy];
  while (significant.length > 1 && [significant hasSuffix:@"0"]) {
    [significant deleteCharactersInRange:NSMakeRange(significant.length - 1, 1)];
  }
  NSString *sign = value < 0.0 ? @"-" : @"";
  NSString *separator = formatter.numberFormatter.decimalSeparator ?: @".";
  return [NSString stringWithFormat:@"%@0%@0%@%@", sign, separator,
                                    TCSubscriptInteger(zeroCount), significant];
}

@interface TCBadgeLayerGroup : NSObject
@property(nonatomic, strong, readonly) CALayer *backgroundLayer;
@property(nonatomic, strong, readonly) TCTextLayerItem *textItem;
// Style-version of the last applied border/corner presentation. Static layer
// properties are re-applied only when the presentation changes, not per frame.
@property(nonatomic, assign) NSUInteger appliedStyleVersion;
- (instancetype)initWithParentLayer:(CALayer *)parentLayer cornerRadius:(CGFloat)cornerRadius;
@end

@implementation TCBadgeLayerGroup

- (instancetype)initWithParentLayer:(CALayer *)parentLayer cornerRadius:(CGFloat)cornerRadius {
  if (self = [super init]) {
    _backgroundLayer = [CALayer layer];
    _backgroundLayer.cornerRadius = cornerRadius;
    _backgroundLayer.hidden = YES;
    [parentLayer addSublayer:_backgroundLayer];
    _textItem = [[TCTextLayerItem alloc] initWithParentLayer:parentLayer];
  }
  return self;
}

@end

struct TCOverlayUpdateMetrics {
  NSUInteger textUpdates = 0;
  NSUInteger xTextUpdates = 0;
  NSUInteger yTextUpdates = 0;
  NSUInteger frameUpdates = 0;
  NSUInteger layoutCacheHits = 0;
  NSUInteger layoutCacheMisses = 0;
  NSUInteger layerReassignments = 0;
};

struct TCTextPresentation {
  __strong TCTextLayout *layout;
  CGRect frame;

  TCTextPresentation(TCTextLayout *textLayout, CGRect textFrame)
      : layout(textLayout), frame(textFrame) {}
};

@interface TCChartOverlayView : UIView
- (void)setSnapshot:(std::shared_ptr<const RenderSnapshot>)snapshot;
- (void)applyPresentationConfig:(NSDictionary *)root;
@end

@implementation TCChartOverlayView {
  std::shared_ptr<const RenderSnapshot> _snapshot;

  CALayer *_axisContainer;
  CALayer *_badgeContainer;
  CALayer *_tooltipContainer;
  CALayer *_extremaContainer;
  NSMutableArray<TCTextLayerItem *> *_xAxisLayers;
  NSMutableDictionary<NSString *, NSMutableArray<TCTextLayerItem *> *> *_yAxisLayerPools;
  NSMutableArray<TCTextLayerItem *> *_extremaLayers;
  NSMutableArray<CALayer *> *_extremaConnectorLayers;
  NSMutableArray<CALayer *> *_extremaBackgroundLayers;
  NSMutableArray<TCTextLayerItem *> *_tooltipLineLayers;
  NSMutableArray<TCTextLayerItem *> *_tooltipValueLayers;
  std::vector<TCTextPresentation> _xAxisPresentations;
  std::vector<TCTextPresentation> _extremaPresentations;
  std::vector<CGRect> _extremaConnectorFrames;
  std::vector<NSUInteger> _presentationAssignments;
  std::vector<uint8_t> _usedPoolItems;
  TCBadgeLayerGroup *_currentPriceBadge;
  TCBadgeLayerGroup *_crosshairPriceBadge;
  TCBadgeLayerGroup *_crosshairTimeBadge;
  CALayer *_tooltipBackgroundLayer;

  NSNumberFormatter *_numberFormatter;
  NSNumberFormatter *_percentageFormatter;
  NSNumberFormatter *_volumeFormatter;
  NSArray<NSDateFormatter *> *_axisDateFormatters;
  NSDateFormatter *_fullDateFormatter;
  NSDateFormatter *_crosshairTimeDateFormatter;
  NSDateFormatter *_tooltipHeaderDateFormatter;
  NSDictionary<NSString *, TCValueFormatter *> *_valueFormatters;
  NSString *_currencySymbol;
  std::string _xLocaleKey;
  std::string _xTimeZoneKey;
  std::string _yLocaleKey;
  std::string _currencySymbolKey;
  int _precisionKey;
  bool _compactValuesKey;
  bool _useGroupingKey;
  bool _formattersReady;

  NSDictionary<NSAttributedStringKey, id> *_axisAttributes;
  NSDictionary<NSAttributedStringKey, id> *_xAxisAttributes;
  NSDictionary<NSAttributedStringKey, id> *_yAxisAttributes;
  NSDictionary<NSAttributedStringKey, id> *_extremaAttributes;
  NSDictionary<NSAttributedStringKey, id> *_badgeAttributes;
  NSDictionary<NSAttributedStringKey, id> *_currentPriceBadgeAttributes;
  NSDictionary<NSAttributedStringKey, id> *_crosshairPriceBadgeAttributes;
  NSDictionary<NSAttributedStringKey, id> *_timeBadgeAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipUpAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipDownAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipBlockAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipValueBlockAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipBlockUpAttributes;
  NSDictionary<NSAttributedStringKey, id> *_tooltipBlockDownAttributes;
  TCColor _axisTextColorKey;
  TCColor _tooltipTextColorKey;
  TCColor _tooltipUpColorKey;
  TCColor _tooltipDownColorKey;
  bool _axisStyleReady;
  bool _tooltipStyleReady;
  NSDictionary *_appearanceConfig;
  NSDictionary *_formattersConfig;
  NSArray<NSDictionary *> *_panesConfig;
  NSUInteger _presentationVersion;
  NSUInteger _preparedFormatterVersion;
  NSUInteger _preparedStyleVersion;
  TCColor _extremaConnectorColor;
  TCColor _extremaBackgroundColor;
  TCColor _crosshairPriceBackgroundColor;
  TCColor _crosshairTimeBackgroundColor;
  TCColor _tooltipPresentationBackgroundColor;
  TCBorderConfig _currentPriceBorder;
  TCBorderConfig _crosshairPriceBorder;
  TCBorderConfig _crosshairTimeBorder;
  TCBorderConfig _tooltipBorder;
  UIColor *_currentPriceBorderColor;
  UIColor *_crosshairPriceBorderColor;
  UIColor *_crosshairTimeBorderColor;
  UIColor *_tooltipBorderColor;
  NSUInteger _appliedTooltipStyleVersion;

  NSCache<NSString *, NSString *> *_formattedValueCache;
  NSCache<NSString *, NSString *> *_formattedTimeCache;
  NSCache<NSNumber *, NSString *> *_formattedPercentageCache;
  NSCache<NSString *, NSString *> *_formattedVolumeCache;
  NSCache<NSString *, TCTextLayout *> *_axisLayoutCache;
  NSCache<NSString *, TCTextLayout *> *_badgeLayoutCache;
  NSCache<NSString *, TCTextLayout *> *_timeBadgeLayoutCache;
  NSCache<NSString *, TCTextLayout *> *_tooltipLayoutCache;
  NSCache<NSString *, TCTextLayout *> *_tooltipBlockLayoutCache;
  TCTextLayout *_tooltipLabelsLayout;
  std::vector<std::string> _tooltipLabelKeys;
  NSArray<NSString *> *_tooltipFields;
  BOOL _showTooltipHeader;
  CGFloat _tooltipMaxLabelWidth;
  CGFloat _tooltipRowHeight;
  bool _tooltipLabelsReady;

  uint64_t _appliedRevision;
  uint64_t _appliedContentRevision;
  Candle _appliedSelectedCandle;
  NSUInteger _visibleStaticLabels;
  NSUInteger _visibleSelectionLabels;
  bool _hasAppliedRevision;
  bool _hasAppliedContentRevision;
  bool _hasAppliedSelection;
  bool _appliedCrosshairVisible;
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    self.backgroundColor = UIColor.clearColor;
    self.opaque = NO;
    self.userInteractionEnabled = NO;
    self.layer.masksToBounds = YES;

    _axisContainer = [CALayer layer];
    _badgeContainer = [CALayer layer];
    _tooltipContainer = [CALayer layer];
    _extremaContainer = [CALayer layer];
    _tooltipContainer.zPosition = 100;
    [self.layer addSublayer:_axisContainer];
    [self.layer addSublayer:_badgeContainer];
    [self.layer addSublayer:_tooltipContainer];
    [self.layer addSublayer:_extremaContainer];

    _xAxisLayers = [NSMutableArray array];
    _yAxisLayerPools = [NSMutableDictionary dictionary];
    _extremaLayers = [NSMutableArray array];
    _extremaConnectorLayers = [NSMutableArray array];
    _extremaBackgroundLayers = [NSMutableArray array];
    _tooltipLineLayers = [NSMutableArray array];
    _tooltipValueLayers = [NSMutableArray array];
    _currentPriceBadge = [[TCBadgeLayerGroup alloc] initWithParentLayer:_badgeContainer cornerRadius:4];
    _crosshairPriceBadge = [[TCBadgeLayerGroup alloc] initWithParentLayer:_badgeContainer cornerRadius:4];
    _crosshairTimeBadge = [[TCBadgeLayerGroup alloc] initWithParentLayer:_badgeContainer cornerRadius:4];
    _tooltipBackgroundLayer = [CALayer layer];
    _tooltipBackgroundLayer.cornerRadius = 8;
    _tooltipBackgroundLayer.hidden = YES;
    [_tooltipContainer addSublayer:_tooltipBackgroundLayer];

    _formattedValueCache = [NSCache new];
    _formattedValueCache.countLimit = 512;
    _formattedTimeCache = [NSCache new];
    _formattedTimeCache.countLimit = 512;
    _formattedPercentageCache = [NSCache new];
    _formattedPercentageCache.countLimit = 256;
    _formattedVolumeCache = [NSCache new];
    _formattedVolumeCache.countLimit = 256;
    _axisLayoutCache = [NSCache new];
    _axisLayoutCache.countLimit = 512;
    _badgeLayoutCache = [NSCache new];
    _badgeLayoutCache.countLimit = 128;
    _timeBadgeLayoutCache = [NSCache new];
    _timeBadgeLayoutCache.countLimit = 128;
    _tooltipLayoutCache = [NSCache new];
    _tooltipLayoutCache.countLimit = 256;
    _tooltipBlockLayoutCache = [NSCache new];
    _tooltipBlockLayoutCache.countLimit = 256;
    _tooltipFields = @[
      @"open", @"close", @"high", @"low", @"amplitude",
      @"changePercent", @"change", @"volume"
    ];
    _showTooltipHeader = YES;

    _badgeAttributes = @{
      NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:11 weight:UIFontWeightSemibold],
      NSForegroundColorAttributeName: UIColor.blackColor,
    };
    _timeBadgeAttributes = @{
      NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:10.5 weight:UIFontWeightSemibold],
      NSForegroundColorAttributeName: UIColor.blackColor,
    };
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  _axisContainer.frame = self.bounds;
  _badgeContainer.frame = self.bounds;
  _tooltipContainer.frame = self.bounds;
  _extremaContainer.frame = self.bounds;
  [CATransaction commit];
}

- (TCValueFormatter *)valueFormatterFromJson:(NSDictionary *)json
                                      fallback:(const ChartConfig &)config {
  TCValueFormatter *result = [TCValueFormatter new];
  NSString *localeName = json[@"locale"] ?:
      ([NSString stringWithUTF8String:config.y_locale.c_str()] ?: @"en-GB");
  const BOOL compact = json[@"type"]
      ? [json[@"type"] isEqualToString:@"compact"]
      : config.compact_values;
  const BOOL significant = [json[@"type"] isEqualToString:@"significant"];
  const NSInteger precision = json[@"precision"] ? [json[@"precision"] integerValue]
                                                   : config.precision;
  result.numberFormatter = [NSNumberFormatter new];
  result.numberFormatter.locale = [NSLocale localeWithLocaleIdentifier:localeName];
  result.numberFormatter.numberStyle = NSNumberFormatterDecimalStyle;
  result.numberFormatter.usesGroupingSeparator = json[@"useGrouping"]
      ? [json[@"useGrouping"] boolValue]
      : config.use_grouping;
  result.numberFormatter.minimumFractionDigits = compact || significant ? 0 : precision;
  result.numberFormatter.maximumFractionDigits = significant ? 12 : precision;
  result.currencySymbol = json[@"currencySymbol"] ?:
      ([NSString stringWithUTF8String:config.currency_symbol.c_str()] ?: @"");
  result.compact = compact;
  result.significant = significant;
  result.significantDigits = json[@"significantDigits"]
      ? [json[@"significantDigits"] integerValue]
      : 3;
  return result;
}

- (void)applyPresentationConfig:(NSDictionary *)root {
  _appearanceConfig = [root[@"appearance"] isKindOfClass:NSDictionary.class]
      ? root[@"appearance"] : @{};
  _formattersConfig = [root[@"formatters"] isKindOfClass:NSDictionary.class]
      ? root[@"formatters"] : @{};
  _panesConfig = [root[@"panes"] isKindOfClass:NSArray.class]
      ? root[@"panes"] : @[];
  NSDictionary *crosshair = [root[@"crosshair"] isKindOfClass:NSDictionary.class]
      ? root[@"crosshair"] : @{};
  NSArray *tooltipFields = [crosshair[@"tooltipFields"] isKindOfClass:NSArray.class]
      ? crosshair[@"tooltipFields"] : nil;
  if (tooltipFields) {
    _tooltipFields = [tooltipFields copy];
  } else {
    _tooltipFields = @[
      @"open", @"close", @"high", @"low", @"amplitude",
      @"changePercent", @"change", @"volume"
    ];
  }
  _showTooltipHeader = crosshair[@"showTooltipHeader"]
      ? [crosshair[@"showTooltipHeader"] boolValue] : YES;
  ++_presentationVersion;
}

- (void)prepareFormatters:(const RenderSnapshot &)snapshot {
  if (_formattersReady && _preparedFormatterVersion == _presentationVersion) return;
  const ChartConfig &config = snapshot.config;
  _preparedFormatterVersion = _presentationVersion;
  _formattersReady = true;

  NSDictionary *price = _formattersConfig[@"price"] ?: @{};
  NSMutableDictionary<NSString *, TCValueFormatter *> *valueFormatters =
      [@{
    @"yAxis" : [self valueFormatterFromJson:price[@"yAxis"] ?: @{} fallback:config],
    @"priceExtremes" : [self valueFormatterFromJson:price[@"priceExtremes"] ?: @{} fallback:config],
    @"currentPrice" : [self valueFormatterFromJson:price[@"currentPrice"] ?: @{} fallback:config],
    @"crosshairPrice" : [self valueFormatterFromJson:price[@"crosshairPrice"] ?: @{} fallback:config],
    @"tooltip" : [self valueFormatterFromJson:price[@"tooltip"] ?: @{} fallback:config],
  } mutableCopy];
  for (NSDictionary *pane in _panesConfig) {
    NSDictionary *scale = pane[@"priceScale"];
    NSString *scaleId = scale[@"priceScaleId"];
    if (![scaleId isKindOfClass:NSString.class] || scaleId.length == 0) continue;
    NSString *key = [@"scale:" stringByAppendingString:scaleId];
    valueFormatters[key] =
        [self valueFormatterFromJson:scale[@"valueFormat"] ?: @{} fallback:config];
  }
  _valueFormatters = valueFormatters;

  TCValueFormatter *axisFormatter = _valueFormatters[@"yAxis"];
  _numberFormatter = axisFormatter.numberFormatter;
  _percentageFormatter = [NSNumberFormatter new];
  _percentageFormatter.locale = axisFormatter.numberFormatter.locale;
  _percentageFormatter.numberStyle = NSNumberFormatterDecimalStyle;
  _percentageFormatter.usesGroupingSeparator = NO;
  _percentageFormatter.minimumFractionDigits = 2;
  _percentageFormatter.maximumFractionDigits = 2;

  _volumeFormatter = [NSNumberFormatter new];
  _volumeFormatter.locale = axisFormatter.numberFormatter.locale;
  _volumeFormatter.numberStyle = NSNumberFormatterDecimalStyle;
  _volumeFormatter.usesGroupingSeparator = axisFormatter.numberFormatter.usesGroupingSeparator;
  _volumeFormatter.minimumFractionDigits = 0;
  _volumeFormatter.maximumFractionDigits = 2;

  NSDictionary *date = _formattersConfig[@"date"] ?: @{};
  NSDictionary *axisDate = date[@"xAxis"] ?: @{};
  NSString *axisLocale = axisDate[@"locale"] ?: @"en-GB";
  NSString *axisZone = axisDate[@"timeZone"] ?: @"UTC";
  NSArray<NSString *> *keys = @[@"seconds", @"time", @"day", @"month", @"year"];
  NSArray<NSString *> *fallbacks = @[@"HH:mm:ss", @"HH:mm", @"d MMM", @"MMM yyyy", @"yyyy"];
  NSMutableArray<NSDateFormatter *> *axisFormatters = [NSMutableArray arrayWithCapacity:5];
  for (NSUInteger index = 0; index < keys.count; ++index) {
    [axisFormatters addObject:TCDateFormatter(axisDate[keys[index]], axisLocale, axisZone,
                                               fallbacks[index])];
  }
  _axisDateFormatters = axisFormatters;
  NSDictionary *crosshairDate = date[@"crosshairTimeBadge"] ?: @{};
  _crosshairTimeDateFormatter = TCDateFormatter(
      crosshairDate[@"pattern"], crosshairDate[@"locale"] ?: axisLocale,
      crosshairDate[@"timeZone"] ?: axisZone, @"d MMM yyyy HH:mm:ss");
  NSDictionary *tooltipDate = date[@"tooltipHeader"] ?: @{};
  _tooltipHeaderDateFormatter = TCDateFormatter(
      tooltipDate[@"pattern"], tooltipDate[@"locale"] ?: axisLocale,
      tooltipDate[@"timeZone"] ?: axisZone, @"d MMM yyyy HH:mm:ss");
  _fullDateFormatter = _crosshairTimeDateFormatter;

  [_formattedValueCache removeAllObjects];
  [_formattedTimeCache removeAllObjects];
  [_formattedPercentageCache removeAllObjects];
  [_formattedVolumeCache removeAllObjects];
}

- (void)prepareStyles:(const RenderSnapshot &)snapshot {
  const ChartConfig &config = snapshot.config;
  if (_preparedStyleVersion == _presentationVersion && _axisStyleReady && _tooltipStyleReady) return;
  _preparedStyleVersion = _presentationVersion;
  _axisStyleReady = true;
  _tooltipStyleReady = true;
  NSDictionary *appearance = _appearanceConfig ?: @{};
  NSDictionary *xAxis = appearance[@"xAxis"] ?: @{};
  NSDictionary *yAxis = appearance[@"yAxis"] ?: @{};
  NSDictionary *extrema = appearance[@"priceExtremes"] ?: @{};
  NSDictionary *current = appearance[@"currentPrice"] ?: @{};
  NSDictionary *currentLabel = current[@"label"] ?: @{};
  NSDictionary *crosshair = appearance[@"crosshair"] ?: @{};
  NSDictionary *crosshairPrice = crosshair[@"priceLabel"] ?: @{};
  NSDictionary *crosshairTime = crosshair[@"timeLabel"] ?: @{};
  NSDictionary *tooltip = appearance[@"tooltip"] ?: @{};

  _xAxisAttributes = TCTextAttributes(xAxis[@"text"] ?: @{}, config.axis_text, 10.5,
                                      UIFontWeightRegular);
  _yAxisAttributes = TCTextAttributes(yAxis[@"text"] ?: @{}, config.axis_text, 10.5,
                                      UIFontWeightRegular);
  _extremaAttributes = TCTextAttributes(extrema[@"text"] ?: @{}, config.axis_text, 10.5,
                                        UIFontWeightRegular);
  _axisAttributes = _yAxisAttributes;
  _currentPriceBadgeAttributes = TCTextAttributes(
      currentLabel[@"text"] ?: @{}, TCColor{0, 0, 0, 1}, 11, UIFontWeightSemibold);
  _crosshairPriceBadgeAttributes = TCTextAttributes(
      crosshairPrice[@"text"] ?: @{}, TCColor{0, 0, 0, 1}, 11, UIFontWeightSemibold);
  _timeBadgeAttributes = TCTextAttributes(
      crosshairTime[@"text"] ?: @{}, TCColor{0, 0, 0, 1}, 10.5, UIFontWeightSemibold);
  _badgeAttributes = _currentPriceBadgeAttributes;
  _tooltipAttributes = TCTextAttributes(
      tooltip[@"headerText"] ?: @{}, config.tooltip_text, 11, UIFontWeightMedium);
  NSDictionary *tooltipLabelAttributes = TCTextAttributes(
      tooltip[@"labelText"] ?: @{}, config.tooltip_text, 11, UIFontWeightMedium);
  NSDictionary *tooltipValueAttributes = TCTextAttributes(
      tooltip[@"valueText"] ?: @{}, config.tooltip_text, 11, UIFontWeightMedium);
  TCColor positive = TCColorFromHex(tooltip[@"positiveValueColor"], config.up);
  TCColor negative = TCColorFromHex(tooltip[@"negativeValueColor"], config.down);
  NSMutableDictionary *positiveAttributes = [tooltipValueAttributes mutableCopy];
  positiveAttributes[NSForegroundColorAttributeName] = TCUIColor(positive);
  _tooltipUpAttributes = positiveAttributes;
  NSMutableDictionary *negativeAttributes = [tooltipValueAttributes mutableCopy];
  negativeAttributes[NSForegroundColorAttributeName] = TCUIColor(negative);
  _tooltipDownAttributes = negativeAttributes;

  _extremaConnectorColor = TCColorFromHex(extrema[@"connectorColor"], config.axis_text);
  _extremaBackgroundColor = TCColorFromHex(extrema[@"backgroundColor"], config.background);
  _crosshairPriceBackgroundColor = TCColorFromHex(crosshairPrice[@"backgroundColor"], config.crosshair);
  _crosshairTimeBackgroundColor = TCColorFromHex(crosshairTime[@"backgroundColor"], config.crosshair);
  _tooltipPresentationBackgroundColor = TCColorFromHex(tooltip[@"backgroundColor"],
                                                        config.tooltip_background);
  _currentPriceBorder = TCBorderFromJson(currentLabel[@"border"] ?: @{}, 4);
  _crosshairPriceBorder = TCBorderFromJson(crosshairPrice[@"border"] ?: @{}, 4);
  _crosshairTimeBorder = TCBorderFromJson(crosshairTime[@"border"] ?: @{}, 4);
  _tooltipBorder = TCBorderFromJson(tooltip[@"border"] ?: @{}, 8);
  _currentPriceBorderColor = TCUIColor(_currentPriceBorder.color);
  _crosshairPriceBorderColor = TCUIColor(_crosshairPriceBorder.color);
  _crosshairTimeBorderColor = TCUIColor(_crosshairTimeBorder.color);
  _tooltipBorderColor = TCUIColor(_tooltipBorder.color);

  [_axisLayoutCache removeAllObjects];
  [_badgeLayoutCache removeAllObjects];
  [_timeBadgeLayoutCache removeAllObjects];
  [_tooltipLayoutCache removeAllObjects];
  [_tooltipBlockLayoutCache removeAllObjects];
  _tooltipLabelsReady = false;

  UIFont *labelFont = tooltipLabelAttributes[NSFontAttributeName];
  UIFont *valueFont = tooltipValueAttributes[NSFontAttributeName];
  const CGFloat rowHeight = MAX(labelFont.lineHeight, valueFont.lineHeight);
  _tooltipRowHeight = rowHeight;
  {
    NSMutableParagraphStyle *tooltipBlockParagraph = [NSMutableParagraphStyle new];
    tooltipBlockParagraph.lineSpacing = MAX(0.0, rowHeight - labelFont.lineHeight);
    NSMutableDictionary<NSAttributedStringKey, id> *blockAttributes =
        [tooltipLabelAttributes mutableCopy];
    blockAttributes[NSParagraphStyleAttributeName] = tooltipBlockParagraph;
    _tooltipBlockAttributes = blockAttributes;
  }
  {
    NSMutableParagraphStyle *tooltipBlockParagraph = [NSMutableParagraphStyle new];
    tooltipBlockParagraph.lineSpacing = MAX(0.0, rowHeight - valueFont.lineHeight);
    NSMutableDictionary<NSAttributedStringKey, id> *blockValueAttributes =
        [tooltipValueAttributes mutableCopy];
    blockValueAttributes[NSParagraphStyleAttributeName] = tooltipBlockParagraph;
    _tooltipValueBlockAttributes = blockValueAttributes;
    NSMutableDictionary<NSAttributedStringKey, id> *blockUpAttributes =
        [_tooltipUpAttributes mutableCopy];
    blockUpAttributes[NSParagraphStyleAttributeName] = tooltipBlockParagraph;
    _tooltipBlockUpAttributes = blockUpAttributes;
    NSMutableDictionary<NSAttributedStringKey, id> *blockDownAttributes =
        [_tooltipDownAttributes mutableCopy];
    blockDownAttributes[NSParagraphStyleAttributeName] = tooltipBlockParagraph;
    _tooltipBlockDownAttributes = blockDownAttributes;
  }
}

- (void)prepareTooltipLabels:(const ChartConfig &)config metrics:(TCOverlayUpdateMetrics *)metrics {
  std::vector<std::string> keys;
  keys.reserve(_tooltipFields.count);
  NSMutableArray<NSString *> *labels =
      [NSMutableArray arrayWithCapacity:_tooltipFields.count];
  for (NSString *field in _tooltipFields) {
    const std::string *label = nullptr;
    if ([field isEqualToString:@"open"]) label = &config.tooltip_label_open;
    else if ([field isEqualToString:@"close"]) label = &config.tooltip_label_close;
    else if ([field isEqualToString:@"high"]) label = &config.tooltip_label_high;
    else if ([field isEqualToString:@"low"]) label = &config.tooltip_label_low;
    else if ([field isEqualToString:@"amplitude"]) label = &config.tooltip_label_amplitude;
    else if ([field isEqualToString:@"changePercent"])
      label = &config.tooltip_label_change_percent;
    else if ([field isEqualToString:@"change"]) label = &config.tooltip_label_change;
    else if ([field isEqualToString:@"volume"]) label = &config.tooltip_label_volume;
    if (!label) continue;
    NSString *text = [NSString stringWithUTF8String:label->c_str()] ?: @"";
    [labels addObject:text];
    keys.emplace_back(std::string(field.UTF8String ?: "") + "\x1f" + *label);
  }
  if (_tooltipLabelsReady && _tooltipLabelKeys == keys) return;

  if (labels.count == 0) {
    _tooltipLabelKeys = std::move(keys);
    _tooltipLabelsLayout = nil;
    _tooltipMaxLabelWidth = 0;
    _tooltipLabelsReady = true;
    return;
  }
  NSString *text = [labels componentsJoinedByString:@"\n"];
  NSString *cacheKey = [@"labels\x1f" stringByAppendingString:text];
  TCTextLayout *layout = [_tooltipBlockLayoutCache objectForKey:cacheKey];
  if (layout) {
    ++metrics->layoutCacheHits;
  } else {
    ++metrics->layoutCacheMisses;
    layout = [[TCTextLayout alloc] initWithText:text attributes:_tooltipBlockAttributes];
    [_tooltipBlockLayoutCache setObject:layout forKey:cacheKey];
  }
  _tooltipLabelKeys = keys;
  _tooltipLabelsLayout = layout;
  _tooltipMaxLabelWidth = layout.size.width;
  _tooltipLabelsReady = true;
}

- (TCTextLayout *)tooltipValuesLayout:(NSArray<NSString *> *)values
                               fields:(NSArray<NSString *> *)fields
                      changeDirection:(NSInteger)changeDirection
                              metrics:(TCOverlayUpdateMetrics *)metrics {
  NSString *text = [values componentsJoinedByString:@"\n"];
  NSString *fieldKey = [fields componentsJoinedByString:@","];
  NSString *cacheKey =
      [NSString stringWithFormat:@"values:%ld\x1f%@\x1f%@",
                                 static_cast<long>(changeDirection), fieldKey, text];
  TCTextLayout *layout = [_tooltipBlockLayoutCache objectForKey:cacheKey];
  if (layout) {
    ++metrics->layoutCacheHits;
    return layout;
  }

  ++metrics->layoutCacheMisses;
  NSDictionary<NSAttributedStringKey, id> *changeAttributes = _tooltipValueBlockAttributes;
  if (changeDirection > 0) {
    changeAttributes = _tooltipBlockUpAttributes;
  } else if (changeDirection < 0) {
    changeAttributes = _tooltipBlockDownAttributes;
  }
  NSMutableAttributedString *attributedString = [NSMutableAttributedString new];
  for (NSUInteger index = 0; index < values.count; ++index) {
    NSString *field = fields[index];
    const BOOL changeRow = [field isEqualToString:@"changePercent"] ||
        [field isEqualToString:@"change"];
    NSString *line = index == 0 ? values[index] : [@"\n" stringByAppendingString:values[index]];
    [attributedString
        appendAttributedString:[[NSAttributedString alloc]
                                   initWithString:line
                                       attributes:changeRow ? changeAttributes
                                                            : _tooltipValueBlockAttributes]];
  }
  layout = [[TCTextLayout alloc] initWithAttributedString:attributedString];
  [_tooltipBlockLayoutCache setObject:layout forKey:cacheKey];
  return layout;
}

- (NSString *)formatValue:(double)value
                     role:(NSString *)role
                 snapshot:(const RenderSnapshot &)snapshot {
  NSString *cacheKey = [NSString stringWithFormat:@"%@\x1f%@", role, @(value).stringValue];
  NSString *cached = [_formattedValueCache objectForKey:cacheKey];
  if (cached) return cached;

  TCValueFormatter *formatter = _valueFormatters[role] ?: _valueFormatters[@"yAxis"];
  if (formatter.significant) {
    const double rounded = TCRoundToSignificant(value, formatter.significantDigits);
    NSString *number = TCCryptoZeroCount(rounded, formatter) ?:
        ([formatter.numberFormatter stringFromNumber:@(rounded)] ?:
         [NSString stringWithFormat:@"%g", rounded]);
    NSString *result = [formatter.currencySymbol stringByAppendingString:number];
    [_formattedValueCache setObject:result forKey:cacheKey];
    return result;
  }

  double scaled = value;
  NSString *suffix = @"";
  if (formatter.compact) {
    const double magnitude = fabs(value);
    if (magnitude >= 1e12) { scaled = value / 1e12; suffix = @"T"; }
    else if (magnitude >= 1e9) { scaled = value / 1e9; suffix = @"B"; }
    else if (magnitude >= 1e6) { scaled = value / 1e6; suffix = @"M"; }
    else if (magnitude >= 1e3) { scaled = value / 1e3; suffix = @"K"; }
  }
  NSString *number = [formatter.numberFormatter stringFromNumber:@(scaled)] ?:
      [NSString stringWithFormat:@"%g", scaled];
  NSString *result = [NSString stringWithFormat:@"%@%@%@", formatter.currencySymbol, number, suffix];
  [_formattedValueCache setObject:result forKey:cacheKey];
  return result;
}

- (NSString *)formatPercentage:(double)value valid:(BOOL)valid {
  if (!valid) return @"—";
  NSNumber *cacheKey = @(value);
  NSString *cached = [_formattedPercentageCache objectForKey:cacheKey];
  if (cached) return cached;
  NSString *number = [_percentageFormatter stringFromNumber:@(value)] ?:
      [NSString stringWithFormat:@"%.2f", value];
  NSString *result = [number stringByAppendingString:@"%"];
  [_formattedPercentageCache setObject:result forKey:cacheKey];
  return result;
}

- (NSString *)formatVolume:(double)value scaleId:(NSString *)scaleId {
  NSString *cacheKey =
      [NSString stringWithFormat:@"%@\x1f%@", scaleId ?: @"main", @(value).stringValue];
  NSString *cached = [_formattedVolumeCache objectForKey:cacheKey];
  if (cached) return cached;
  const double magnitude = fabs(value);
  double scaled = value;
  NSString *suffix = @"";
  if (magnitude >= 1e12) { scaled = value / 1e12; suffix = @"T"; }
  else if (magnitude >= 1e9) { scaled = value / 1e9; suffix = @"B"; }
  else if (magnitude >= 1e6) { scaled = value / 1e6; suffix = @"M"; }
  else if (magnitude >= 1e3) { scaled = value / 1e3; suffix = @"K"; }
  NSString *formatterKey =
      [@"scale:" stringByAppendingString:(scaleId ?: @"main")];
  TCValueFormatter *paneFormatter = _valueFormatters[formatterKey];
  NSNumberFormatter *numberFormatter =
      paneFormatter.numberFormatter ?: _volumeFormatter;
  NSString *number = [numberFormatter stringFromNumber:@(scaled)] ?:
      [NSString stringWithFormat:@"%g", scaled];
  NSString *result = [number stringByAppendingString:suffix];
  [_formattedVolumeCache setObject:result forKey:cacheKey];
  return result;
}

- (NSString *)formatVolume:(double)value {
  return [self formatVolume:value scaleId:@"main"];
}

- (NSUInteger)timeFormatIndexForSnapshot:(const RenderSnapshot &)snapshot {
  const double span = snapshot.visible_x_max - snapshot.visible_x_min;
  if (span <= 5.0 * 60.0 * 1000.0 ||
      (snapshot.config.show_seconds && span <= 2.0 * 60.0 * 60.0 * 1000.0))
    return 0;
  if (span <= 2.0 * 24.0 * 60.0 * 60.0 * 1000.0) return 1;
  if (span <= 180.0 * 24.0 * 60.0 * 60.0 * 1000.0) return 2;
  if (span <= 2.0 * 365.0 * 24.0 * 60.0 * 60.0 * 1000.0) return 3;
  return 4;
}

- (NSString *)formatTime:(double)timestamp
             formatIndex:(NSUInteger)formatIndex
                    full:(BOOL)full
                 tooltip:(BOOL)tooltip {
  const long long milliseconds = llround(timestamp);
  NSString *cacheKey = [NSString stringWithFormat:@"%lld\x1f%lu\x1f%d\x1f%d", milliseconds,
                        static_cast<unsigned long>(formatIndex), full, tooltip];
  NSString *cached = [_formattedTimeCache objectForKey:cacheKey];
  if (cached) return cached;

  NSDate *date = [NSDate dateWithTimeIntervalSince1970:timestamp / 1000.0];
  NSDateFormatter *formatter = full
      ? (tooltip ? _tooltipHeaderDateFormatter : _crosshairTimeDateFormatter)
      : _axisDateFormatters[formatIndex];
  NSString *result = [formatter stringFromDate:date] ?: @"";
  [_formattedTimeCache setObject:result forKey:cacheKey];
  return result;
}

- (TCTextLayout *)layoutForText:(NSString *)text
                     attributes:(NSDictionary<NSAttributedStringKey, id> *)attributes
                          cache:(NSCache<NSString *, TCTextLayout *> *)cache
                        metrics:(TCOverlayUpdateMetrics *)metrics {
  NSString *cacheKey = [NSString stringWithFormat:@"%p\x1f%@", attributes, text];
  TCTextLayout *layout = [cache objectForKey:cacheKey];
  if (layout) {
    ++metrics->layoutCacheHits;
  } else {
    ++metrics->layoutCacheMisses;
    layout = [[TCTextLayout alloc] initWithText:text attributes:attributes];
    [cache setObject:layout forKey:cacheKey];
  }
  return layout;
}

- (TCTextLayerItem *)itemAtIndex:(NSUInteger)index
                          inPool:(NSMutableArray<TCTextLayerItem *> *)pool
                     parentLayer:(CALayer *)parentLayer {
  while (pool.count <= index) {
    [pool addObject:[[TCTextLayerItem alloc] initWithParentLayer:parentLayer]];
  }
  return pool[index];
}

- (CALayer *)connectorLayerAtIndex:(NSUInteger)index parentLayer:(CALayer *)parentLayer {
  while (_extremaConnectorLayers.count <= index) {
    CALayer *layer = [CALayer layer];
    layer.hidden = YES;
    layer.zPosition = 0;
    [parentLayer addSublayer:layer];
    [_extremaConnectorLayers addObject:layer];
  }
  return _extremaConnectorLayers[index];
}

- (CALayer *)extremumBackgroundLayerAtIndex:(NSUInteger)index
                                 parentLayer:(CALayer *)parentLayer {
  while (_extremaBackgroundLayers.count <= index) {
    CALayer *layer = [CALayer layer];
    layer.hidden = YES;
    layer.cornerRadius = 2;
    layer.zPosition = 1;
    [parentLayer addSublayer:layer];
    [_extremaBackgroundLayers addObject:layer];
  }
  return _extremaBackgroundLayers[index];
}

- (BOOL)applyLayout:(TCTextLayout *)layout
             toItem:(TCTextLayerItem *)item
              frame:(CGRect)frame
            metrics:(TCOverlayUpdateMetrics *)metrics {
  BOOL textChanged = item.layout != layout;
  if (textChanged) {
    if (item.layout) ++metrics->layerReassignments;
    item.layout = layout;
    item.layer.string = layout.attributedString;
    ++metrics->textUpdates;
  }
  if (!CGRectEqualToRect(item.layer.frame, frame)) {
    item.layer.frame = frame;
    ++metrics->frameUpdates;
  }
  if (item.layer.hidden) {
    item.layer.hidden = NO;
  }
  return textChanged;
}

- (void)applyPresentations:(const std::vector<TCTextPresentation> &)presentations
                    toPool:(NSMutableArray<TCTextLayerItem *> *)pool
               parentLayer:(CALayer *)parentLayer
                   metrics:(TCOverlayUpdateMetrics *)metrics
        axisTextUpdates:(NSUInteger *)axisTextUpdates {
  const NSUInteger presentationCount = presentations.size();
  _presentationAssignments.assign(presentationCount, NSNotFound);
  _usedPoolItems.assign(pool.count, 0);

  // Reserve every layer that already owns a requested layout before assigning
  // fallbacks. This avoids overwriting a layer needed by a later presentation.
  for (NSUInteger presentationIndex = 0; presentationIndex < presentationCount;
       ++presentationIndex) {
    TCTextLayout *layout = presentations[presentationIndex].layout;
    for (NSUInteger poolIndex = 0; poolIndex < pool.count; ++poolIndex) {
      if (_usedPoolItems[poolIndex] || pool[poolIndex].layout != layout) continue;
      _presentationAssignments[presentationIndex] = poolIndex;
      _usedPoolItems[poolIndex] = 1;
      break;
    }
  }

  for (NSUInteger presentationIndex = 0; presentationIndex < presentationCount;
       ++presentationIndex) {
    if (_presentationAssignments[presentationIndex] != NSNotFound) continue;
    NSUInteger poolIndex = NSNotFound;
    for (NSUInteger candidate = 0; candidate < pool.count; ++candidate) {
      if (!_usedPoolItems[candidate]) {
        poolIndex = candidate;
        break;
      }
    }
    if (poolIndex == NSNotFound) {
      poolIndex = pool.count;
      [pool addObject:[[TCTextLayerItem alloc] initWithParentLayer:parentLayer]];
      _usedPoolItems.push_back(0);
    }
    _presentationAssignments[presentationIndex] = poolIndex;
    _usedPoolItems[poolIndex] = 1;
  }

  for (NSUInteger presentationIndex = 0; presentationIndex < presentationCount;
       ++presentationIndex) {
    const TCTextPresentation &presentation = presentations[presentationIndex];
    TCTextLayerItem *item = pool[_presentationAssignments[presentationIndex]];
    if ([self applyLayout:presentation.layout toItem:item frame:presentation.frame
                  metrics:metrics]) {
      ++*axisTextUpdates;
    }
  }

  for (NSUInteger poolIndex = 0; poolIndex < pool.count; ++poolIndex) {
    if (!_usedPoolItems[poolIndex] && !pool[poolIndex].layer.hidden) {
      pool[poolIndex].layer.hidden = YES;
    }
  }
}

- (void)applyExtremumPresentations:(const std::vector<TCTextPresentation> &)presentations
                    connectorFrames:(const std::vector<CGRect> &)connectorFrames
                           snapshot:(const RenderSnapshot &)snapshot
                            metrics:(TCOverlayUpdateMetrics *)metrics {
  NSUInteger extremaTextUpdates = 0;
  [self applyPresentations:presentations toPool:_extremaLayers
               parentLayer:_extremaContainer metrics:metrics
           axisTextUpdates:&extremaTextUpdates];

  UIColor *lineColor = TCUIColor(_extremaConnectorColor);
  UIColor *backgroundColor = TCUIColor(_extremaBackgroundColor);
  for (NSUInteger presentationIndex = 0; presentationIndex < presentations.size();
       ++presentationIndex) {
    const NSUInteger poolIndex = _presentationAssignments[presentationIndex];
    TCTextLayerItem *textItem = _extremaLayers[poolIndex];
    if (textItem.layer.zPosition != 2) {
      textItem.layer.zPosition = 2;
    }
    CALayer *connector = [self connectorLayerAtIndex:poolIndex parentLayer:_extremaContainer];
    const CGRect frame = connectorFrames[presentationIndex];
    if (!CGRectEqualToRect(connector.frame, frame)) {
      connector.frame = frame;
      ++metrics->frameUpdates;
    }
    if (!connector.backgroundColor ||
        !CGColorEqualToColor(connector.backgroundColor, lineColor.CGColor)) {
      connector.backgroundColor = lineColor.CGColor;
    }
    if (connector.hidden) {
      connector.hidden = NO;
    }

    CALayer *background = [self extremumBackgroundLayerAtIndex:poolIndex
                                                    parentLayer:_extremaContainer];
    const CGRect backgroundFrame = CGRectInset(
        presentations[presentationIndex].frame, -2.0, -1.0);
    if (!CGRectEqualToRect(background.frame, backgroundFrame)) {
      background.frame = backgroundFrame;
      ++metrics->frameUpdates;
    }
    if (!background.backgroundColor ||
        !CGColorEqualToColor(background.backgroundColor, backgroundColor.CGColor)) {
      background.backgroundColor = backgroundColor.CGColor;
    }
    if (background.hidden) {
      background.hidden = NO;
    }
  }
  for (NSUInteger poolIndex = 0; poolIndex < _extremaConnectorLayers.count; ++poolIndex) {
    if ((poolIndex >= _usedPoolItems.size() || !_usedPoolItems[poolIndex]) &&
        !_extremaConnectorLayers[poolIndex].hidden) {
      _extremaConnectorLayers[poolIndex].hidden = YES;
    }
  }
  for (NSUInteger poolIndex = 0; poolIndex < _extremaBackgroundLayers.count; ++poolIndex) {
    if ((poolIndex >= _usedPoolItems.size() || !_usedPoolItems[poolIndex]) &&
        !_extremaBackgroundLayers[poolIndex].hidden) {
      _extremaBackgroundLayers[poolIndex].hidden = YES;
    }
  }
}

- (void)hideItemsInPool:(NSMutableArray<TCTextLayerItem *> *)pool fromIndex:(NSUInteger)index {
  for (NSUInteger itemIndex = index; itemIndex < pool.count; ++itemIndex) {
    if (!pool[itemIndex].layer.hidden) {
      pool[itemIndex].layer.hidden = YES;
    }
  }
}

- (void)setBadge:(TCBadgeLayerGroup *)badge
              text:(NSString *)text
                 y:(CGFloat)y
             color:(TCColor)color
        attributes:(NSDictionary<NSAttributedStringKey, id> *)attributes
            border:(const TCBorderConfig &)border
       borderColor:(UIColor *)borderColor
          snapshot:(const RenderSnapshot &)snapshot
           metrics:(TCOverlayUpdateMetrics *)metrics {
  TCTextLayout *layout = [self layoutForText:text attributes:attributes
                                       cache:_badgeLayoutCache metrics:metrics];
  CGFloat width = MIN(snapshot.config.y_axis_width, layout.size.width + 12);
  CGFloat x = snapshot.config.y_axis_on_right ? snapshot.plot.right : MAX(0, snapshot.plot.left - width);
  CGFloat height = MAX(20, layout.size.height + 6);
  CGFloat halfHeight = height * 0.5;
  CGFloat badgeY = MAX(halfHeight, MIN(MAX(halfHeight, snapshot.height - halfHeight), y));
  CGRect backgroundFrame = CGRectMake(x, badgeY - halfHeight, width, height);
  if (!CGRectEqualToRect(badge.backgroundLayer.frame, backgroundFrame)) {
    badge.backgroundLayer.frame = backgroundFrame;
    ++metrics->frameUpdates;
  }
  UIColor *backgroundColor = TCUIColor(color);
  if (!badge.backgroundLayer.backgroundColor ||
      !CGColorEqualToColor(badge.backgroundLayer.backgroundColor, backgroundColor.CGColor)) {
    badge.backgroundLayer.backgroundColor = backgroundColor.CGColor;
  }
  if (badge.appliedStyleVersion != _presentationVersion) {
    badge.appliedStyleVersion = _presentationVersion;
    badge.backgroundLayer.borderWidth = border.width;
    badge.backgroundLayer.borderColor = borderColor.CGColor;
    badge.backgroundLayer.cornerRadius = border.radius;
  }
  if (badge.backgroundLayer.hidden) {
    badge.backgroundLayer.hidden = NO;
  }
  CGFloat textX = CGRectGetMidX(backgroundFrame) - layout.size.width * 0.5;
  CGRect textFrame = CGRectMake(textX,
                                backgroundFrame.origin.y + (height - layout.size.height) * 0.5,
                                layout.size.width, layout.size.height);
  [self applyLayout:layout toItem:badge.textItem frame:textFrame metrics:metrics];
}

- (void)hideBadge:(TCBadgeLayerGroup *)badge {
  if (!badge.backgroundLayer.hidden) {
    badge.backgroundLayer.hidden = YES;
  }
  if (!badge.textItem.layer.hidden) {
    badge.textItem.layer.hidden = YES;
  }
}

- (void)hideAllLayers {
  _axisContainer.hidden = YES;
  _badgeContainer.hidden = YES;
  _tooltipContainer.hidden = YES;
  _extremaContainer.hidden = YES;
}

- (void)setSnapshot:(std::shared_ptr<const RenderSnapshot>)snapshot {
  _snapshot = std::move(snapshot);
  if (!_snapshot || _snapshot->width <= 0 || _snapshot->height <= 0) {
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    [self hideAllLayers];
    [CATransaction commit];
    _hasAppliedRevision = false;
    _hasAppliedContentRevision = false;
    _hasAppliedSelection = false;
    _visibleStaticLabels = 0;
    _visibleSelectionLabels = 0;
    return;
  }

  const RenderSnapshot &current = *_snapshot;
  os_log_t performanceLog = TCPerformanceLog();
  os_signpost_id_t updateSignpostID = os_signpost_id_generate(performanceLog);
  os_signpost_interval_begin(performanceLog, updateSignpostID, "Overlay Update Layers",
                             "revision=%{public}llu contentRevision=%{public}llu "
                             "xTicks=%{public}lu yTicks=%{public}lu",
                             static_cast<unsigned long long>(current.revision),
                             static_cast<unsigned long long>(current.content_revision),
                             static_cast<unsigned long>(current.x_ticks.size()),
                             static_cast<unsigned long>(current.y_ticks.size()));
  if (_hasAppliedRevision && _appliedRevision == current.revision) {
    os_signpost_interval_end(performanceLog, updateSignpostID, "Overlay Update Layers",
                             "cached=1 visible=0 textUpdates=0 xTextUpdates=0 yTextUpdates=0 "
                             "layoutCacheHits=0 layoutCacheMisses=0 layerReassignments=0 "
                             "frameUpdates=0 staticUpdated=0 selectionUpdated=0 "
                             "crosshairTextUpdates=0 selectionTextUpdates=0");
    return;
  }

  const bool staticUpdated = !_hasAppliedContentRevision ||
      _appliedContentRevision != current.content_revision;
  const bool selectionUpdated = staticUpdated || !_hasAppliedSelection ||
      _appliedCrosshairVisible != current.crosshair_visible ||
      (current.crosshair_visible &&
       !TCCandleEqual(_appliedSelectedCandle, current.selected_candle));
  if (staticUpdated) {
    [self prepareFormatters:current];
    [self prepareStyles:current];
  }
  const ChartConfig &config = current.config;
  const NSUInteger timeFormatIndex = staticUpdated || selectionUpdated
      ? [self timeFormatIndexForSnapshot:current]
      : 0;
  TCOverlayUpdateMetrics metrics;
  NSUInteger crosshairTextUpdates = 0;
  NSUInteger selectionTextUpdates = 0;

  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  if (_badgeContainer.hidden) {
    _badgeContainer.hidden = NO;
  }
  if (staticUpdated) {
    NSUInteger visibleStaticLabels = 0;
    _axisContainer.hidden = NO;
    _extremaContainer.hidden = NO;

    _xAxisPresentations.clear();
    _xAxisPresentations.reserve(current.x_ticks.size());
    if (config.show_x_axis) {
      CGFloat lastRight = -CGFLOAT_MAX;
      for (const auto &tick : current.x_ticks) {
        NSString *label = [self formatTime:tick.value formatIndex:timeFormatIndex full:NO tooltip:NO];
        TCTextLayout *layout = [self layoutForText:label attributes:_xAxisAttributes
                                             cache:_axisLayoutCache metrics:&metrics];
        CGFloat x = MAX(2, MIN(current.width - layout.size.width - 2,
                              tick.position - layout.size.width / 2));
        if (x < lastRight + 8) continue;
        const CGFloat xAxisTop = current.panes.empty()
            ? current.plot.bottom
            : current.panes.back().plot.bottom;
        CGRect frame = CGRectMake(x, xAxisTop + 5,
                                  layout.size.width, layout.size.height);
        _xAxisPresentations.emplace_back(layout, frame);
        lastRight = x + layout.size.width;
        ++visibleStaticLabels;
      }
    }
    [self applyPresentations:_xAxisPresentations toPool:_xAxisLayers
                 parentLayer:_axisContainer metrics:&metrics
             axisTextUpdates:&metrics.xTextUpdates];

    NSMutableSet<NSString *> *activeYAxisPoolKeys = [NSMutableSet set];
    if (config.show_y_axis) {
      for (const auto &pane : current.panes) {
        if (!pane.scale_visible) continue;
        NSString *paneId =
            [NSString stringWithUTF8String:pane.pane_id.c_str()] ?: @"main";
        NSString *scaleId =
            [NSString stringWithUTF8String:pane.price_scale_id.c_str()] ?: @"main";
        NSString *poolKey =
            [NSString stringWithFormat:@"%@\x1f%@", paneId, scaleId];
        [activeYAxisPoolKeys addObject:poolKey];
        NSMutableArray<TCTextLayerItem *> *pool = _yAxisLayerPools[poolKey];
        if (!pool) {
          pool = [NSMutableArray array];
          _yAxisLayerPools[poolKey] = pool;
        }
        std::vector<TCTextPresentation> panePresentations;
        panePresentations.reserve(pane.y_tick_count);
        NSString *scaleRole = [@"scale:" stringByAppendingString:scaleId];
        for (size_t index = 0; index < pane.y_tick_count; ++index) {
          const auto &tick = current.pane_y_ticks[pane.y_tick_offset + index];
          NSString *label = pane.volume_format
              ? [self formatVolume:tick.value scaleId:scaleId]
              : [self formatValue:tick.value role:scaleRole snapshot:current];
          TCTextLayout *layout = [self layoutForText:label attributes:_yAxisAttributes
                                               cache:_axisLayoutCache metrics:&metrics];
          CGFloat x = config.y_axis_on_right ? pane.plot.right + 6
                                          : pane.plot.left - layout.size.width - 6;
          CGRect frame = CGRectMake(MAX(2, x), tick.position - layout.size.height / 2,
                                    layout.size.width, layout.size.height);
          panePresentations.emplace_back(layout, frame);
          ++visibleStaticLabels;
        }
        [self applyPresentations:panePresentations toPool:pool
                     parentLayer:_axisContainer metrics:&metrics
                 axisTextUpdates:&metrics.yTextUpdates];
      }
    }
    for (NSString *poolKey in _yAxisLayerPools) {
      if (![activeYAxisPoolKeys containsObject:poolKey]) {
        [self hideItemsInPool:_yAxisLayerPools[poolKey] fromIndex:0];
      }
    }

    _extremaPresentations.clear();
    _extremaConnectorFrames.clear();
    _extremaPresentations.reserve(2);
    _extremaConnectorFrames.reserve(2);
    const auto addExtremum = [&](const PriceExtremum &extremum) {
      if (!extremum.visible) return;
      NSString *label = [self formatValue:extremum.value role:@"priceExtremes" snapshot:current];
      TCTextLayout *layout = [self layoutForText:label attributes:_extremaAttributes
                                           cache:_axisLayoutCache metrics:&metrics];
      const CGFloat direction = extremum.label_on_right ? 1.0 : -1.0;
      const CGFloat lineEndX = MAX(
          current.plot.left,
          MIN(current.plot.right, extremum.x + direction * 20.0));
      const CGFloat unclampedX = extremum.label_on_right
          ? lineEndX + 4.0
          : lineEndX - 4.0 - layout.size.width;
      const CGFloat maximumX = MAX(current.plot.left, current.plot.right - layout.size.width);
      const CGFloat textX = MAX(current.plot.left, MIN(maximumX, unclampedX));
      const CGFloat maximumY = MAX(current.plot.top, current.plot.bottom - layout.size.height);
      const CGFloat textY = MAX(
          current.plot.top,
          MIN(maximumY, extremum.y - layout.size.height * 0.5));
      _extremaPresentations.emplace_back(
          layout, CGRectMake(textX, textY, layout.size.width, layout.size.height));
      _extremaConnectorFrames.push_back(CGRectMake(
          MIN(extremum.x, lineEndX), extremum.y - 0.5,
          fabs(lineEndX - extremum.x), 1.0));
      ++visibleStaticLabels;
    };
    addExtremum(current.visible_maximum);
    addExtremum(current.visible_minimum);
    [self applyExtremumPresentations:_extremaPresentations
                     connectorFrames:_extremaConnectorFrames
                            snapshot:current metrics:&metrics];

    if (current.current_price_visible && config.show_current_price_label) {
      NSString *text = [self formatValue:current.current_price role:@"currentPrice" snapshot:current];
      CGFloat badgeY = MAX(10, MIN(MAX(10, current.height - 10), current.current_price_y));
      [self setBadge:_currentPriceBadge
                text:text
                   y:badgeY
               color:current.current_price_label_color
          attributes:_currentPriceBadgeAttributes
              border:_currentPriceBorder
         borderColor:_currentPriceBorderColor
            snapshot:current
             metrics:&metrics];
      ++visibleStaticLabels;
    } else {
      [self hideBadge:_currentPriceBadge];
    }
    _visibleStaticLabels = visibleStaticLabels;
    _appliedContentRevision = current.content_revision;
    _hasAppliedContentRevision = true;
  }

  const NSUInteger crosshairTextUpdatesBefore = metrics.textUpdates;
  if (current.crosshair_visible) {
    const BOOL volumePane =
        current.active_pane_index < current.panes.size() &&
        current.panes[current.active_pane_index].volume_format;
    NSString *activeScaleId = current.active_pane_index < current.panes.size()
        ? ([NSString stringWithUTF8String:
              current.panes[current.active_pane_index].price_scale_id.c_str()] ?: @"main")
        : @"main";
    NSString *price = volumePane
        ? [self formatVolume:current.crosshair_price scaleId:activeScaleId]
        : [self formatValue:current.crosshair_price
                       role:current.active_pane_index == 0
                           ? @"crosshairPrice"
                           : [@"scale:" stringByAppendingString:activeScaleId]
                   snapshot:current];
    [self setBadge:_crosshairPriceBadge
              text:price
                 y:current.crosshair_y
             color:_crosshairPriceBackgroundColor
        attributes:_crosshairPriceBadgeAttributes
            border:_crosshairPriceBorder
       borderColor:_crosshairPriceBorderColor
          snapshot:current
           metrics:&metrics];
  } else {
    [self hideBadge:_crosshairPriceBadge];
  }
  crosshairTextUpdates = metrics.textUpdates - crosshairTextUpdatesBefore;

  const NSUInteger selectionTextUpdatesBefore = metrics.textUpdates;
  if (selectionUpdated) {
    const NSUInteger selectionFrameUpdatesBefore = metrics.frameUpdates;
    os_signpost_id_t selectionSignpostID = os_signpost_id_generate(performanceLog);
    os_signpost_interval_begin(performanceLog, selectionSignpostID, "Overlay Selection Update",
                               "revision=%{public}llu contentRevision=%{public}llu "
                               "crosshairVisible=%{public}d",
                               static_cast<unsigned long long>(current.revision),
                               static_cast<unsigned long long>(current.content_revision),
                               current.crosshair_visible);
    NSUInteger visibleSelectionLabels = 0;
    if (current.crosshair_visible) {
      NSString *time = [self formatTime:current.selected_candle.timestamp
                            formatIndex:timeFormatIndex
                                   full:YES
                                tooltip:NO];
      TCTextLayout *timeLayout = [self layoutForText:time
                                          attributes:_timeBadgeAttributes
                                               cache:_timeBadgeLayoutCache
                                             metrics:&metrics];
      const CGFloat timeHeight = MAX(20, timeLayout.size.height + 6);
      const CGFloat xAxisTop = current.panes.empty()
          ? current.plot.bottom
          : current.panes.back().plot.bottom;
      CGRect timeFrame = CGRectMake(
          MAX(current.plot.left, MIN(current.plot.right - timeLayout.size.width - 12,
                                     current.crosshair_x - timeLayout.size.width / 2 - 6)),
          xAxisTop, timeLayout.size.width + 12, timeHeight);
      if (!CGRectEqualToRect(_crosshairTimeBadge.backgroundLayer.frame, timeFrame)) {
        _crosshairTimeBadge.backgroundLayer.frame = timeFrame;
        ++metrics.frameUpdates;
      }
      UIColor *crosshairColor = TCUIColor(_crosshairTimeBackgroundColor);
      if (!_crosshairTimeBadge.backgroundLayer.backgroundColor ||
          !CGColorEqualToColor(_crosshairTimeBadge.backgroundLayer.backgroundColor,
                               crosshairColor.CGColor)) {
        _crosshairTimeBadge.backgroundLayer.backgroundColor = crosshairColor.CGColor;
      }
      if (_crosshairTimeBadge.appliedStyleVersion != _presentationVersion) {
        _crosshairTimeBadge.appliedStyleVersion = _presentationVersion;
        _crosshairTimeBadge.backgroundLayer.borderWidth = _crosshairTimeBorder.width;
        _crosshairTimeBadge.backgroundLayer.borderColor = _crosshairTimeBorderColor.CGColor;
        _crosshairTimeBadge.backgroundLayer.cornerRadius = _crosshairTimeBorder.radius;
      }
      if (_crosshairTimeBadge.backgroundLayer.hidden) {
        _crosshairTimeBadge.backgroundLayer.hidden = NO;
      }
      CGRect timeTextFrame = CGRectMake(timeFrame.origin.x + 6,
                                        timeFrame.origin.y + (timeHeight - timeLayout.size.height) * 0.5,
                                        timeLayout.size.width, timeLayout.size.height);
      [self applyLayout:timeLayout
                 toItem:_crosshairTimeBadge.textItem
                  frame:timeTextFrame
                metrics:&metrics];
      ++visibleSelectionLabels;

      const BOOL hasTooltipContent = _showTooltipHeader || _tooltipFields.count > 0;
      if (config.show_tooltip && hasTooltipContent) {
        [self prepareTooltipLabels:config metrics:&metrics];
        const auto &c = current.selected_candle;
        NSMutableArray<NSString *> *activeFields =
            [NSMutableArray arrayWithCapacity:_tooltipFields.count];
        NSMutableArray<NSString *> *values =
            [NSMutableArray arrayWithCapacity:_tooltipFields.count];
        for (NSString *field in _tooltipFields) {
          NSString *value = nil;
          if ([field isEqualToString:@"open"])
            value = [self formatValue:c.open role:@"tooltip" snapshot:current];
          else if ([field isEqualToString:@"close"])
            value = [self formatValue:c.close role:@"tooltip" snapshot:current];
          else if ([field isEqualToString:@"high"])
            value = [self formatValue:c.high role:@"tooltip" snapshot:current];
          else if ([field isEqualToString:@"low"])
            value = [self formatValue:c.low role:@"tooltip" snapshot:current];
          else if ([field isEqualToString:@"amplitude"])
            value = [self formatPercentage:current.selected_amplitude_percent
                                      valid:current.selected_percentages_valid];
          else if ([field isEqualToString:@"changePercent"])
            value = [self formatPercentage:current.selected_change_percent
                                      valid:current.selected_percentages_valid];
          else if ([field isEqualToString:@"change"])
            value = [self formatValue:current.selected_change role:@"tooltip" snapshot:current];
          else if ([field isEqualToString:@"volume"])
            value = [self formatVolume:c.volume];
          if (!value) continue;
          [activeFields addObject:field];
          [values addObject:value];
        }
        TCTextLayout *headerLayout = nil;
        if (_showTooltipHeader) {
          NSString *header = [self formatTime:c.timestamp
                                  formatIndex:timeFormatIndex
                                         full:YES
                                      tooltip:YES];
          headerLayout = [self layoutForText:header
                                  attributes:_tooltipAttributes
                                       cache:_tooltipLayoutCache
                                     metrics:&metrics];
        }
        const NSInteger changeDirection = current.selected_change > 0.0   ? 1
                                          : current.selected_change < 0.0 ? -1
                                                                         : 0;
        TCTextLayout *valuesLayout = values.count > 0
            ? [self tooltipValuesLayout:values
                                 fields:activeFields
                        changeDirection:changeDirection
                                metrics:&metrics]
            : nil;
        const CGFloat headerWidth = _showTooltipHeader ? headerLayout.size.width : 0;
        const CGFloat rowsWidth = values.count > 0
            ? _tooltipMaxLabelWidth + 12 + valuesLayout.size.width
            : 0;
        CGFloat boxWidth = MAX(headerWidth, rowsWidth) + 20;
        CGFloat headerHeight = _showTooltipHeader ? MAX(17, headerLayout.size.height) : 0;
        // NSAttributedString.size can include extra paragraph-layout height for
        // multiline strings. The rows themselves use this exact line height,
        // so derive the background from the row count to keep 9pt padding at
        // the bottom instead of extending the tooltip beyond its content.
        CGFloat rowsHeight = values.count * _tooltipRowHeight;
        CGFloat boxHeight = headerHeight + rowsHeight + 18;
        const CGFloat plotMidX = (current.plot.left + current.plot.right) * 0.5;
        CGFloat boxX = current.crosshair_x > plotMidX ? current.plot.left + 8
                                                      : current.plot.right - boxWidth - 8;
        CGRect box = CGRectMake(boxX, current.plot.top + 8, boxWidth, boxHeight);
        if (!CGRectEqualToRect(_tooltipBackgroundLayer.frame, box)) {
          _tooltipBackgroundLayer.frame = box;
          ++metrics.frameUpdates;
        }
        TCColor tooltipBackground = _tooltipPresentationBackgroundColor;
        tooltipBackground.a *= config.tooltip_background_opacity;
        UIColor *tooltipBackgroundColor = TCUIColor(tooltipBackground);
        if (!_tooltipBackgroundLayer.backgroundColor ||
            !CGColorEqualToColor(_tooltipBackgroundLayer.backgroundColor,
                                 tooltipBackgroundColor.CGColor)) {
          _tooltipBackgroundLayer.backgroundColor = tooltipBackgroundColor.CGColor;
        }
        if (_appliedTooltipStyleVersion != _presentationVersion) {
          _appliedTooltipStyleVersion = _presentationVersion;
          _tooltipBackgroundLayer.borderWidth = _tooltipBorder.width;
          _tooltipBackgroundLayer.borderColor = _tooltipBorderColor.CGColor;
          _tooltipBackgroundLayer.cornerRadius = _tooltipBorder.radius;
        }
        if (_tooltipContainer.hidden) {
          _tooltipContainer.hidden = NO;
        }
        if (_tooltipBackgroundLayer.hidden) {
          _tooltipBackgroundLayer.hidden = NO;
        }
        CGFloat y = box.origin.y + 9;
        NSUInteger nextLineIndex = 0;
        if (_showTooltipHeader) {
          TCTextLayerItem *headerItem = [self itemAtIndex:nextLineIndex++
                                                   inPool:_tooltipLineLayers
                                              parentLayer:_tooltipContainer];
          [self applyLayout:headerLayout
                     toItem:headerItem
                      frame:CGRectMake(box.origin.x + 10, y, headerLayout.size.width,
                                       headerLayout.size.height)
                    metrics:&metrics];
          y += headerHeight;
          ++visibleSelectionLabels;
        }
        if (values.count > 0) {
          const CGFloat valueX = box.origin.x + 10 + _tooltipMaxLabelWidth + 12;
          TCTextLayerItem *labelsItem = [self itemAtIndex:nextLineIndex++
                                                   inPool:_tooltipLineLayers
                                              parentLayer:_tooltipContainer];
          [self applyLayout:_tooltipLabelsLayout
                     toItem:labelsItem
                      frame:CGRectMake(box.origin.x + 10, y, _tooltipLabelsLayout.size.width,
                                       rowsHeight)
                    metrics:&metrics];
          TCTextLayerItem *valuesItem = [self itemAtIndex:0
                                                   inPool:_tooltipValueLayers
                                              parentLayer:_tooltipContainer];
          [self applyLayout:valuesLayout
                     toItem:valuesItem
                      frame:CGRectMake(valueX, y, valuesLayout.size.width, rowsHeight)
                    metrics:&metrics];
          visibleSelectionLabels += values.count * 2;
          [self hideItemsInPool:_tooltipValueLayers fromIndex:1];
        } else {
          [self hideItemsInPool:_tooltipValueLayers fromIndex:0];
        }
        [self hideItemsInPool:_tooltipLineLayers fromIndex:nextLineIndex];
      } else if (!_tooltipContainer.hidden) {
        _tooltipContainer.hidden = YES;
      }
    } else {
      [self hideBadge:_crosshairTimeBadge];
      if (!_tooltipContainer.hidden) {
        _tooltipContainer.hidden = YES;
      }
    }
    _visibleSelectionLabels = visibleSelectionLabels;
    _appliedSelectedCandle = current.selected_candle;
    _appliedCrosshairVisible = current.crosshair_visible;
    _hasAppliedSelection = true;
    selectionTextUpdates = metrics.textUpdates - selectionTextUpdatesBefore;
    os_signpost_interval_end(
        performanceLog, selectionSignpostID, "Overlay Selection Update",
        "visible=%{public}lu textUpdates=%{public}lu "
        "frameUpdates=%{public}lu tooltipRows=%{public}lu",
        static_cast<unsigned long>(visibleSelectionLabels),
        static_cast<unsigned long>(selectionTextUpdates),
        static_cast<unsigned long>(metrics.frameUpdates - selectionFrameUpdatesBefore),
        static_cast<unsigned long>(current.crosshair_visible && config.show_tooltip
                                       ? _tooltipFields.count
                                       : 0));
  }

  os_signpost_id_t transactionSignpostID = os_signpost_id_generate(performanceLog);
  os_signpost_interval_begin(performanceLog, transactionSignpostID, "Overlay Transaction Commit",
                             "revision=%{public}llu staticUpdated=%{public}d "
                             "selectionUpdated=%{public}d",
                             static_cast<unsigned long long>(current.revision), staticUpdated,
                             selectionUpdated);
  [CATransaction commit];
  os_signpost_interval_end(performanceLog, transactionSignpostID, "Overlay Transaction Commit",
                           "textUpdates=%{public}lu frameUpdates=%{public}lu",
                           static_cast<unsigned long>(metrics.textUpdates),
                           static_cast<unsigned long>(metrics.frameUpdates));
  _appliedRevision = current.revision;
  _hasAppliedRevision = true;
  const NSUInteger visibleLabels =
      _visibleStaticLabels + _visibleSelectionLabels + (current.crosshair_visible ? 1 : 0);
  os_signpost_interval_end(performanceLog, updateSignpostID, "Overlay Update Layers",
                           "cached=0 visible=%{public}lu textUpdates=%{public}lu "
                           "xTextUpdates=%{public}lu yTextUpdates=%{public}lu "
                           "layoutCacheHits=%{public}lu layoutCacheMisses=%{public}lu "
                           "layerReassignments=%{public}lu frameUpdates=%{public}lu "
                           "staticUpdated=%{public}d selectionUpdated=%{public}d "
                           "crosshairTextUpdates=%{public}lu selectionTextUpdates=%{public}lu",
                           static_cast<unsigned long>(visibleLabels),
                           static_cast<unsigned long>(metrics.textUpdates),
                           static_cast<unsigned long>(metrics.xTextUpdates),
                           static_cast<unsigned long>(metrics.yTextUpdates),
                           static_cast<unsigned long>(metrics.layoutCacheHits),
                           static_cast<unsigned long>(metrics.layoutCacheMisses),
                           static_cast<unsigned long>(metrics.layerReassignments),
                           static_cast<unsigned long>(metrics.frameUpdates), staticUpdated,
                           selectionUpdated, static_cast<unsigned long>(crosshairTextUpdates),
                           static_cast<unsigned long>(selectionTextUpdates));
}

@end

@protocol TCFrameLinkDelegate <NSObject>
- (void)displayLinkDidFire:(CADisplayLink *)displayLink;
@end

@interface TCFrameLinkTarget : NSObject
@property (nonatomic, weak) id<TCFrameLinkDelegate> delegate;
- (void)tick:(CADisplayLink *)displayLink;
@end

@implementation TCFrameLinkTarget
- (void)tick:(CADisplayLink *)displayLink {
  [self.delegate displayLinkDidFire:displayLink];
}
@end

@interface TCChartHostView : UIView <UIGestureRecognizerDelegate, TCFrameLinkDelegate>
@property(nonatomic, copy, nullable) void (^visibleRangeDidChange)(
    std::shared_ptr<const RenderSnapshot> snapshot);
@property(nonatomic, copy, nullable) void (^selectedCandleDidChange)(
    std::shared_ptr<const RenderSnapshot> snapshot);
@property(nonatomic, copy, nullable) void (^scaleDidChange)(
    std::shared_ptr<const RenderSnapshot> snapshot);
@property(nonatomic, copy, nullable) void (^yAxisScaleDidChange)(
    std::shared_ptr<const RenderSnapshot> snapshot);
@property(nonatomic, copy, nullable) void (^paneResizeDidChange)(
    std::shared_ptr<const RenderSnapshot> snapshot, size_t separatorIndex,
    BOOL finished);
@property(nonatomic, copy, nullable) void (^priceScaleDidChange)(
    std::shared_ptr<const RenderSnapshot> snapshot);
- (void)applyConfigJson:(NSString *)json;
- (void)applyHistory:(NSArray<NSNumber *> *)data;
- (void)prependHistory:(NSArray<NSNumber *> *)data;
- (void)applyCandle:(NSArray<NSNumber *> *)data;
- (void)applyTrade:(NSArray<NSNumber *> *)data;
- (void)applyTrades:(NSArray<NSNumber *> *)data;
- (void)addSeriesJson:(NSString *)json;
- (void)setSeriesData:(NSArray<NSNumber *> *)data
             seriesId:(NSString *)seriesId
             dataType:(NSString *)dataType
              prepend:(BOOL)prepend
               update:(BOOL)update;
- (void)removeSeries:(NSString *)seriesId;
- (void)setPaneHeight:(NSString *)paneId weight:(double)weight;
- (void)zoomByScale:(double)scale;
- (void)fitContent;
- (void)clearData;
- (NSArray<NSNumber *> *)candleData;
- (void)startDecelerationWithVelocity:(CGFloat)velocity;
- (void)stopDeceleration;
@end

@implementation TCChartHostView {
  std::shared_ptr<ChartEngine> _engine;
  MTKView *_metalView;
  TCMetalRenderer *_renderer;
  TCChartOverlayView *_overlay;
  CADisplayLink *_displayLink;
  TCFrameLinkTarget *_displayLinkTarget;
  BOOL _frameScheduled;
  BOOL _scalingYAxis;
  BOOL _suppressMomentum;
  BOOL _crosshairPinned;
  BOOL _crosshairGestureActive;
  BOOL _decelerating;
  CGFloat _horizontalVelocity;
  CFTimeInterval _lastDecelerationTimestamp;
  CFTimeInterval _pastEdgeWaitStartedAt;
  ChartConfig _config;
  float _lineAppearanceWidth;
  TCColor _lineAppearanceColor;
  TCColor _lineAppearanceGradientTop;
  TCColor _lineAppearanceGradientBottom;
  BOOL _lineAppearanceGradientEnabled;
  float _areaAppearanceWidth;
  TCColor _areaAppearanceColor;
  TCColor _areaAppearanceGradientTop;
  TCColor _areaAppearanceGradientBottom;
  BOOL _areaAppearanceGradientEnabled;
  TCColor _areaFillTop;
  TCColor _areaFillBottom;
  NSInteger _lastFirstVisibleIndex;
  NSInteger _lastLastVisibleIndex;
  NSInteger _lastTotalCandleCount;
  BOOL _lastSelectedCandleActive;
  Candle _lastSelectedCandle;
  BOOL _pendingScaleChange;
  BOOL _pendingYAxisScaleChange;
  BOOL _panesResizable;
  BOOL _resizingPane;
  size_t _resizingSeparatorIndex;
  BOOL _pendingPaneResize;
  BOOL _pendingPaneResizeFinished;
  NSMutableSet<NSString *> *_declarativeSeriesIds;
  uint64_t _lastDrawnRevision;
  BOOL _forceNextDraw;
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    _engine = std::make_shared<ChartEngine>();
    _lineAppearanceWidth = _config.line_width;
    _lineAppearanceColor = _config.line;
    _lineAppearanceGradientTop = _config.line_gradient_top;
    _lineAppearanceGradientBottom = _config.line_gradient_bottom;
    _areaAppearanceWidth = _config.line_width;
    _areaAppearanceColor = _config.line;
    _areaAppearanceGradientTop = _config.line_gradient_top;
    _areaAppearanceGradientBottom = _config.line_gradient_bottom;
    _areaFillTop = _config.area_fill_top;
    _areaFillBottom = _config.area_fill_bottom;
    _declarativeSeriesIds = [NSMutableSet new];
    _lastFirstVisibleIndex = -1;
    _lastLastVisibleIndex = -1;
    _lastTotalCandleCount = -1;
    _engine->SetConfig(_config);
    id<MTLDevice> device = MTLCreateSystemDefaultDevice();
    _metalView = [[MTKView alloc] initWithFrame:self.bounds device:device];
    _metalView.colorPixelFormat = MTLPixelFormatBGRA8Unorm;
    _metalView.framebufferOnly = YES;
    _metalView.paused = YES;
    _metalView.enableSetNeedsDisplay = YES;
    _renderer = [[TCMetalRenderer alloc] initWithView:_metalView];
    _metalView.delegate = _renderer;
    [self addSubview:_metalView];
    _overlay = [[TCChartOverlayView alloc] initWithFrame:self.bounds];
    [self addSubview:_overlay];
    _displayLinkTarget = [TCFrameLinkTarget new];
    _displayLinkTarget.delegate = self;
    _displayLink = [CADisplayLink displayLinkWithTarget:_displayLinkTarget selector:@selector(tick:)];
    _displayLink.paused = YES;
    [_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(applicationDidBecomeActive:)
                                               name:UIApplicationDidBecomeActiveNotification
                                             object:nil];
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(applicationWillResignActive:)
                                               name:UIApplicationWillResignActiveNotification
                                             object:nil];

    UIPanGestureRecognizer *pan = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handlePan:)];
    pan.maximumNumberOfTouches = 1;
    pan.delegate = self;
    [self addGestureRecognizer:pan];
    UIPinchGestureRecognizer *pinch = [[UIPinchGestureRecognizer alloc] initWithTarget:self action:@selector(handlePinch:)];
    pinch.delegate = self;
    [self addGestureRecognizer:pinch];
    UILongPressGestureRecognizer *longPress = [[UILongPressGestureRecognizer alloc]
        initWithTarget:self action:@selector(handleLongPress:)];
    longPress.minimumPressDuration = 0.28;
    longPress.delegate = self;
    [self addGestureRecognizer:longPress];
    UITapGestureRecognizer *singleTap = [[UITapGestureRecognizer alloc]
        initWithTarget:self action:@selector(handleSingleTap:)];
    singleTap.delegate = self;
    [self addGestureRecognizer:singleTap];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _metalView.frame = self.bounds;
  _overlay.frame = self.bounds;
  _engine->SetSize(self.bounds.size.width, self.bounds.size.height);
  [self requestFrame];
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  [self stopDeceleration];
  _displayLink.paused = YES;
  _frameScheduled = NO;
  if (self.window) {
    _forceNextDraw = YES;
    [self requestFrame];
  }
}

- (void)applicationDidBecomeActive:(NSNotification *)notification {
  [self stopDeceleration];
  _displayLink.paused = YES;
  _frameScheduled = NO;
  _forceNextDraw = YES;
  [self requestFrame];
}

- (void)applicationWillResignActive:(NSNotification *)notification {
  [self stopDeceleration];
  _displayLink.paused = YES;
  _frameScheduled = NO;
}

- (void)requestFrame {
  if (!self.window || UIApplication.sharedApplication.applicationState != UIApplicationStateActive) return;
  if (_frameScheduled) return;
  _frameScheduled = YES;
  _displayLink.paused = NO;
}

- (void)displayLinkDidFire:(CADisplayLink *)displayLink {
  displayLink.paused = YES;
  _frameScheduled = NO;
  if (!self.window || UIApplication.sharedApplication.applicationState != UIApplicationStateActive) return;

  os_log_t performanceLog = TCPerformanceLog();
  os_signpost_id_t frameSignpostID = os_signpost_id_generate(performanceLog);
  os_signpost_interval_begin(performanceLog, frameSignpostID, "Display Link Frame",
                             "decelerating=%{public}d", _decelerating);
  if (_decelerating) {
    const CFTimeInterval fallbackDuration =
        displayLink.duration > 0.0 ? displayLink.duration : 1.0 / 60.0;
    const CFTimeInterval elapsed = _lastDecelerationTimestamp > 0.0
        ? displayLink.timestamp - _lastDecelerationTimestamp
        : fallbackDuration;
    const CFTimeInterval deltaTime =
        std::min(std::max(elapsed, 1.0 / 240.0), 1.0 / 30.0);
    _lastDecelerationTimestamp = displayLink.timestamp;
    const bool moved = _engine->Pan(_horizontalVelocity * deltaTime);
    if (moved) {
      _pastEdgeWaitStartedAt = 0.0;
    } else if (_horizontalVelocity > 0.0 && _pastEdgeWaitStartedAt <= 0.0) {
      // A positive velocity moves toward older candles. Keep momentum alive for
      // a bounded interval so an in-flight prepend can extend the viewport.
      _pastEdgeWaitStartedAt = displayLink.timestamp;
    }
    const bool waitingForPastData = !moved && _horizontalVelocity > 0.0 &&
        displayLink.timestamp - _pastEdgeWaitStartedAt < TCPastEdgeDataWaitDuration;
    _horizontalVelocity *= std::pow(
        static_cast<double>(UIScrollViewDecelerationRateNormal), deltaTime * 1000.0);
    if ((!moved && !waitingForPastData) || std::abs(_horizontalVelocity) <= 5.0) {
      [self stopDeceleration];
    }
  }

  os_signpost_id_t snapshotSignpostID = os_signpost_id_generate(performanceLog);
  os_signpost_interval_begin(performanceLog, snapshotSignpostID, "ChartEngine Snapshot");
  auto snapshot = _engine->Snapshot();
  os_signpost_interval_end(performanceLog, snapshotSignpostID, "ChartEngine Snapshot",
                           "revision=%{public}llu vertices=%{public}lu",
                           static_cast<unsigned long long>(snapshot->revision),
                           static_cast<unsigned long>(
                               ((snapshot->content_vertices
                                     ? snapshot->content_vertices->size()
                                     : 0) +
                                snapshot->overlay_vertices.size()) / 6));
  [_renderer setSnapshot:snapshot];
  [_overlay setSnapshot:snapshot];
  // Skip presenting identical frames: gesture and data handlers already
  // coalesce frame requests, but bounded momentum windows and no-op updates
  // can still schedule frames that carry no state change.
  if (_forceNextDraw || snapshot->revision != _lastDrawnRevision) {
    [_metalView draw];
    _lastDrawnRevision = snapshot->revision;
    _forceNextDraw = NO;
  }
  if (snapshot->has_visible_candles) {
    NSInteger first = static_cast<NSInteger>(snapshot->first_visible_index);
    NSInteger last = static_cast<NSInteger>(snapshot->last_visible_index);
    NSInteger total = static_cast<NSInteger>(snapshot->total_candle_count);
    if (first != _lastFirstVisibleIndex || last != _lastLastVisibleIndex ||
        total != _lastTotalCandleCount) {
      _lastFirstVisibleIndex = first;
      _lastLastVisibleIndex = last;
      _lastTotalCandleCount = total;
      if (self.visibleRangeDidChange) self.visibleRangeDidChange(snapshot);
    }
  }
  if (snapshot->crosshair_visible) {
    if (!_lastSelectedCandleActive ||
        !TCCandleEqual(_lastSelectedCandle, snapshot->selected_candle)) {
      _lastSelectedCandleActive = YES;
      _lastSelectedCandle = snapshot->selected_candle;
      if (self.selectedCandleDidChange) self.selectedCandleDidChange(snapshot);
    }
  } else if (_lastSelectedCandleActive) {
    _lastSelectedCandleActive = NO;
    _lastSelectedCandle = Candle{};
    if (self.selectedCandleDidChange) self.selectedCandleDidChange(snapshot);
  }
  if (_pendingScaleChange) {
    _pendingScaleChange = NO;
    if (self.scaleDidChange) self.scaleDidChange(snapshot);
  }
  if (_pendingYAxisScaleChange) {
    _pendingYAxisScaleChange = NO;
    if (self.yAxisScaleDidChange) self.yAxisScaleDidChange(snapshot);
    if (self.priceScaleDidChange) self.priceScaleDidChange(snapshot);
  }
  if (_pendingPaneResize) {
    _pendingPaneResize = NO;
    const BOOL finished = _pendingPaneResizeFinished;
    _pendingPaneResizeFinished = NO;
    if (self.paneResizeDidChange) {
      self.paneResizeDidChange(snapshot, _resizingSeparatorIndex, finished);
    }
  }
  if (_decelerating) [self requestFrame];
  os_signpost_interval_end(performanceLog, frameSignpostID, "Display Link Frame",
                           "revision=%{public}llu",
                           static_cast<unsigned long long>(snapshot->revision));
}

- (void)startDecelerationWithVelocity:(CGFloat)velocity {
  [self stopDeceleration];
  if (!_config.allow_pan || std::abs(velocity) <= 5.0) return;
  _horizontalVelocity = velocity;
  _lastDecelerationTimestamp = 0.0;
  _pastEdgeWaitStartedAt = 0.0;
  _decelerating = YES;
  [self requestFrame];
}

- (void)stopDeceleration {
  _decelerating = NO;
  _horizontalVelocity = 0.0;
  _lastDecelerationTimestamp = 0.0;
  _pastEdgeWaitStartedAt = 0.0;
}

- (void)touchesBegan:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  [self stopDeceleration];
  [super touchesBegan:touches withEvent:event];
}

- (void)dealloc {
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [_displayLink invalidate];
  _displayLinkTarget.delegate = nil;
}

- (void)applyConfigJson:(NSString *)json {
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *root = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  if (![root isKindOfClass:NSDictionary.class]) return;
  [_overlay applyPresentationConfig:root];
  NSDictionary *theme = root[@"theme"];
  NSDictionary *appearance = root[@"appearance"];
  NSDictionary *gridAppearance = appearance[@"grid"];
  NSDictionary *candlesAppearance = appearance[@"candles"];
  NSDictionary *barsAppearance = appearance[@"bars"];
  NSDictionary *lineAppearance = appearance[@"line"];
  NSDictionary *areaAppearance = appearance[@"area"];
  NSDictionary *series = root[@"series"];
  const bool usesBars = [series[@"type"] isEqualToString:@"bar"];
  const bool usesLine = [series[@"type"] isEqualToString:@"line"];
  const bool usesArea = [series[@"type"] isEqualToString:@"area"];
  const bool usesHollowCandlesticks =
      [series[@"type"] isEqualToString:@"hollowCandlestick"];
  _config.candle_radius = [candlesAppearance[@"radius"] floatValue];
  NSDictionary *seriesAppearance = usesBars ? barsAppearance : candlesAppearance;
  NSDictionary *currentAppearance = appearance[@"currentPrice"];
  NSDictionary *currentLineAppearance = currentAppearance[@"line"];
  NSDictionary *currentLabelAppearance = currentAppearance[@"label"];
  NSDictionary *crosshairAppearance = appearance[@"crosshair"];
  NSDictionary *crosshairLineAppearance = crosshairAppearance[@"line"];
  NSDictionary *tooltipAppearance = appearance[@"tooltip"];
  NSDictionary *xAxis = root[@"xAxis"];
  NSDictionary *yAxis = root[@"yAxis"];
  NSDictionary *format = yAxis[@"valueFormat"];
  NSDictionary *gestures = root[@"gestures"];
  NSDictionary *current = root[@"currentPrice"];
  NSDictionary *priceExtremes = root[@"priceExtremes"];
  NSDictionary *crosshair = root[@"crosshair"];
  NSDictionary *tooltipLabels = crosshair[@"tooltipLabels"];
  NSDictionary *resolution = root[@"resolution"];
  NSDictionary *tradeAggregation = root[@"tradeAggregation"];
  NSDictionary *bucketOrigin = tradeAggregation[@"bucketOrigin"];
  _config.resolution.unit = TCResolutionUnit(resolution[@"unit"]);
  _config.resolution.multiplier =
      static_cast<std::uint32_t>([resolution[@"multiplier"] unsignedIntValue]);
  _config.resolution.fixed_duration_ms =
      _config.resolution.unit == ResolutionUnit::kFixed
          ? [resolution[@"durationMs"] longLongValue]
          : 60000;
  NSString *originType = bucketOrigin[@"type"];
  _config.trade_aggregation.bucket_origin =
      [originType isEqualToString:@"session"]
          ? BucketOrigin::kSession
          : ([originType isEqualToString:@"timestamp"]
                 ? BucketOrigin::kTimestamp
                 : BucketOrigin::kEpoch);
  _config.trade_aggregation.origin_timestamp_ms =
      [bucketOrigin[@"timestamp"] longLongValue];
  _config.trade_aggregation.outside_session =
      [tradeAggregation[@"outsideSession"] isEqualToString:@"reject"]
          ? OutsideSessionPolicy::kReject
          : OutsideSessionPolicy::kIgnore;
  _config.trade_aggregation.candle_timestamp =
      [tradeAggregation[@"candleTimestamp"] isEqualToString:@"tradingDateUtc"]
          ? CandleTimestampPolicy::kTradingDateUtc
          : CandleTimestampPolicy::kBucketStart;
  _config.trade_aggregation.calendar = trading_charts::TradingCalendarConfig{};
  NSDictionary *calendar = tradeAggregation[@"calendar"];
  if ([calendar isKindOfClass:NSDictionary.class]) {
    auto &nativeCalendar = _config.trade_aggregation.calendar;
    nativeCalendar.configured = true;
    NSString *timeZoneName = calendar[@"timeZone"];
    nativeCalendar.time_zone = timeZoneName.UTF8String ?: "UTC";
    NSTimeZone *timeZone = [NSTimeZone timeZoneWithName:timeZoneName];
    if (!timeZone) timeZone = [NSTimeZone timeZoneForSecondsFromGMT:0];
    nativeCalendar.transitions = TCTimeZoneTransitions(timeZone);
    nativeCalendar.transition_range_start_ms = 0;
    nativeCalendar.transition_range_end_ms = 4133980800000LL;
    nativeCalendar.week_starts_on =
        [calendar[@"weekStartsOn"] isEqualToString:@"sunday"] ? 7 : 1;
    for (NSDictionary *session in TCJsonArrayOrEmpty(calendar[@"sessions"])) {
      if (![session isKindOfClass:NSDictionary.class]) continue;
      std::uint8_t weekdayMask = 0;
      for (NSNumber *weekday in TCJsonArrayOrEmpty(session[@"weekdays"])) {
        const int value = weekday.intValue;
        if (value >= 1 && value <= 7) {
          weekdayMask = static_cast<std::uint8_t>(
              weekdayMask | static_cast<std::uint8_t>(1U << (value - 1)));
        }
      }
      nativeCalendar.sessions.push_back(TCSessionConfig(session, weekdayMask));
    }
    for (NSString *holiday in TCJsonArrayOrEmpty(calendar[@"holidays"])) {
      nativeCalendar.holidays.push_back(TCCivilDate(holiday));
    }
    for (NSDictionary *override in TCJsonArrayOrEmpty(calendar[@"overrides"])) {
      if (![override isKindOfClass:NSDictionary.class]) continue;
      TradingCalendarOverrideConfig nativeOverride;
      nativeOverride.date = TCCivilDate(override[@"date"]);
      for (NSDictionary *session in TCJsonArrayOrEmpty(override[@"sessions"])) {
        if ([session isKindOfClass:NSDictionary.class]) {
          nativeOverride.sessions.push_back(TCSessionConfig(session, 0));
        }
      }
      nativeCalendar.overrides.push_back(std::move(nativeOverride));
    }
  }
  _config.initial_visible_count = [root[@"initialVisibleCount"] intValue];
  _config.default_scale = root[@"defaultScale"]
      ? [root[@"defaultScale"] doubleValue]
      : 1.0;
  _config.default_y_scale = yAxis[@"defaultScale"]
      ? [yAxis[@"defaultScale"] doubleValue]
      : 1.0;
  _config.background = TCColorFromHex(appearance[@"backgroundColor"], _config.background);
  _config.grid = TCColorFromHex(gridAppearance[@"color"], _config.grid);
  _config.axis_text = TCColorFromHex(theme[@"axisTextColor"], _config.axis_text);
  _config.series_type =
      usesBars ? SeriesType::kBar
               : (usesHollowCandlesticks
                      ? SeriesType::kHollowCandlestick
                      : (usesLine ? SeriesType::kLine
                                  : (usesArea ? SeriesType::kArea
                                              : SeriesType::kCandlestick)));
  _config.bar_line_width = barsAppearance[@"lineWidth"]
      ? [barsAppearance[@"lineWidth"] floatValue]
      : 1.0f;
  _lineAppearanceWidth = lineAppearance[@"width"]
      ? [lineAppearance[@"width"] floatValue]
      : 1.5f;
  _lineAppearanceColor = TCColorFromHex(lineAppearance[@"color"], _config.up);
  NSDictionary *lineGradient = lineAppearance[@"gradient"];
  _lineAppearanceGradientEnabled =
      [lineGradient isKindOfClass:NSDictionary.class];
  _lineAppearanceGradientTop = TCColorFromHex(
      lineGradient[@"topColor"], _lineAppearanceColor);
  _lineAppearanceGradientBottom = TCColorFromHex(
      lineGradient[@"bottomColor"], _lineAppearanceColor);
  _areaAppearanceWidth = areaAppearance[@"width"]
      ? [areaAppearance[@"width"] floatValue]
      : 1.5f;
  _areaAppearanceColor = TCColorFromHex(areaAppearance[@"color"], _config.up);
  NSDictionary *areaGradient = areaAppearance[@"gradient"];
  _areaAppearanceGradientEnabled =
      [areaGradient isKindOfClass:NSDictionary.class];
  _areaAppearanceGradientTop = TCColorFromHex(
      areaGradient[@"topColor"], _areaAppearanceColor);
  _areaAppearanceGradientBottom = TCColorFromHex(
      areaGradient[@"bottomColor"], _areaAppearanceColor);
  NSDictionary *areaFill = areaAppearance[@"fill"];
  _areaFillTop = TCColorFromHex(areaFill[@"topColor"], _config.area_fill_top);
  _areaFillBottom = TCColorFromHex(
      areaFill[@"bottomColor"], _config.area_fill_bottom);
  _config.line_width = usesArea ? _areaAppearanceWidth : _lineAppearanceWidth;
  _config.line = usesArea ? _areaAppearanceColor : _lineAppearanceColor;
  _config.line_gradient_enabled = usesArea
      ? _areaAppearanceGradientEnabled
      : _lineAppearanceGradientEnabled;
  _config.line_gradient_top = usesArea
      ? _areaAppearanceGradientTop
      : _lineAppearanceGradientTop;
  _config.line_gradient_bottom = usesArea
      ? _areaAppearanceGradientBottom
      : _lineAppearanceGradientBottom;
  _config.area_fill_top = _areaFillTop;
  _config.area_fill_bottom = _areaFillBottom;
  NSString *lineSource = series[@"source"];
  _config.line_source =
      [lineSource isEqualToString:@"open"]
          ? OhlcValueSource::kOpen
          : ([lineSource isEqualToString:@"high"]
                 ? OhlcValueSource::kHigh
                 : ([lineSource isEqualToString:@"low"]
                        ? OhlcValueSource::kLow
                        : OhlcValueSource::kClose));
  _config.line_gap_threshold_ms = series[@"gapThresholdMs"]
      ? [series[@"gapThresholdMs"] doubleValue]
      : 0.0;
  _config.up = TCColorFromHex(seriesAppearance[@"upColor"], _config.up);
  _config.down = TCColorFromHex(seriesAppearance[@"downColor"], _config.down);
  _config.crosshair = TCColorFromHex(crosshairLineAppearance[@"color"], _config.crosshair);
  _config.tooltip_background = TCColorFromHex(tooltipAppearance[@"backgroundColor"], _config.tooltip_background);
  _config.tooltip_text = TCColorFromHex(tooltipAppearance[@"valueText"][@"color"], _config.tooltip_text);
  _config.grid_opacity = gridAppearance[@"opacity"] ? [gridAppearance[@"opacity"] floatValue] : 0.75f;
  _config.crosshair_opacity = crosshairLineAppearance[@"opacity"]
      ? [crosshairLineAppearance[@"opacity"] floatValue] : 0.85f;
  _config.current_price_line_up = TCColorFromHex(currentLineAppearance[@"upColor"], _config.up);
  _config.current_price_line_down = TCColorFromHex(currentLineAppearance[@"downColor"], _config.down);
  _config.current_price_label_up = TCColorFromHex(currentLabelAppearance[@"upBackgroundColor"], _config.up);
  _config.current_price_label_down = TCColorFromHex(currentLabelAppearance[@"downBackgroundColor"], _config.down);
  _config.show_x_axis = [xAxis[@"visible"] boolValue];
  _config.x_axis_height = [xAxis[@"height"] floatValue];
  _config.x_locale = [xAxis[@"locale"] UTF8String] ?: "en-GB";
  _config.x_time_zone = [xAxis[@"timeZone"] UTF8String] ?: "UTC";
  _config.show_seconds = [xAxis[@"showSeconds"] boolValue];
  _config.logical_spacing = [xAxis[@"spacing"] isEqualToString:@"logical"];
  _config.show_y_axis = [yAxis[@"visible"] boolValue];
  _config.y_axis_on_right = ![yAxis[@"position"] isEqualToString:@"left"];
  _config.y_axis_width = [yAxis[@"width"] floatValue];
  NSDictionary *scaleMargins = yAxis[@"scaleMargins"];
  _config.y_scale_margin_top = [scaleMargins[@"top"] doubleValue];
  _config.y_scale_margin_bottom = [scaleMargins[@"bottom"] doubleValue];
  _config.compact_values = [format[@"type"] isEqualToString:@"compact"];
  _config.precision = [format[@"precision"] intValue];
  _config.min_move = format[@"minMove"] ? [format[@"minMove"] doubleValue] : 0.01;
  _config.y_locale = [format[@"locale"] UTF8String] ?: "en-GB";
  _config.currency_symbol = [format[@"currencySymbol"] UTF8String] ?: "";
  _config.use_grouping = format[@"useGrouping"] ? [format[@"useGrouping"] boolValue] : true;
  _config.allow_pan = [gestures[@"pan"] boolValue];
  _config.allow_zoom = [gestures[@"zoom"] boolValue];
  _config.allow_y_axis_scale = gestures[@"yAxisScale"]
      ? [gestures[@"yAxisScale"] boolValue]
      : _config.allow_zoom;
  _config.show_current_price = [current[@"visible"] boolValue];
  _config.show_current_price_label = [current[@"showLabel"] boolValue];
  _config.pin_current_price_to_edge = current[@"pinToEdge"]
      ? [current[@"pinToEdge"] boolValue]
      : true;
  _config.show_price_extremes = priceExtremes[@"visible"]
      ? [priceExtremes[@"visible"] boolValue]
      : true;
  _config.crosshair_enabled = [crosshair[@"enabled"] boolValue];
  _config.show_tooltip = [crosshair[@"showTooltip"] boolValue];
  _config.tooltip_background_opacity = tooltipAppearance[@"backgroundOpacity"]
      ? [tooltipAppearance[@"backgroundOpacity"] floatValue]
      : 1.0f;
  _config.crosshair_dashed = [crosshair[@"lineStyle"] isEqualToString:@"dashed"];
  _config.tooltip_label_open = [tooltipLabels[@"open"] UTF8String] ?: "Open";
  _config.tooltip_label_close = [tooltipLabels[@"close"] UTF8String] ?: "Close";
  _config.tooltip_label_high = [tooltipLabels[@"high"] UTF8String] ?: "High";
  _config.tooltip_label_low = [tooltipLabels[@"low"] UTF8String] ?: "Low";
  _config.tooltip_label_amplitude = [tooltipLabels[@"amplitude"] UTF8String] ?: "Amplitude";
  _config.tooltip_label_change_percent =
      [tooltipLabels[@"changePercent"] UTF8String] ?: "Change %";
  _config.tooltip_label_change = [tooltipLabels[@"change"] UTF8String] ?: "Change";
  _config.tooltip_label_volume = [tooltipLabels[@"volume"] UTF8String] ?: "Volume";
  if (!_config.crosshair_enabled) {
    _crosshairPinned = NO;
    _crosshairGestureActive = NO;
  }
  if (!_config.allow_pan) [self stopDeceleration];
  _pendingScaleChange = NO;
  _pendingYAxisScaleChange = NO;
  _engine->SetConfig(_config);
  std::vector<PaneConfig> paneConfigs;
  NSArray *panes = root[@"panes"];
  if ([panes isKindOfClass:NSArray.class]) {
    paneConfigs.reserve(panes.count);
    for (NSDictionary *pane in panes) {
      if (![pane isKindOfClass:NSDictionary.class]) continue;
      NSDictionary *scale = pane[@"priceScale"];
      NSDictionary *margins = scale[@"scaleMargins"];
      NSDictionary *valueFormat = scale[@"valueFormat"];
      PaneConfig config;
      config.pane_id = [pane[@"paneId"] UTF8String] ?: "";
      config.price_scale_id = [scale[@"priceScaleId"] UTF8String] ?: "";
      config.height_weight = [pane[@"heightWeight"] doubleValue];
      config.min_height = [pane[@"minHeight"] floatValue];
      config.scale_visible = [scale[@"visible"] boolValue];
      config.scale_margin_top = [margins[@"top"] doubleValue];
      config.scale_margin_bottom = [margins[@"bottom"] doubleValue];
      config.volume_format = [valueFormat[@"type"] isEqualToString:@"volume"];
      config.precision = [valueFormat[@"precision"] intValue];
      config.min_move = valueFormat[@"minMove"]
          ? [valueFormat[@"minMove"] doubleValue]
          : (config.volume_format ? 1.0 : _config.min_move);
      paneConfigs.push_back(std::move(config));
    }
  }
  _engine->SetPanes(paneConfigs, [root[@"panesResizable"] boolValue]);
  _panesResizable = [root[@"panesResizable"] boolValue] && paneConfigs.size() > 1;
  NSArray *additionalSeries = root[@"additionalSeries"];
  NSMutableSet<NSString *> *requestedDeclarativeSeriesIds = [NSMutableSet set];
  if ([additionalSeries isKindOfClass:NSArray.class]) {
    for (NSDictionary *item in additionalSeries) {
      NSString *seriesId = item[@"seriesId"];
      if ([seriesId isKindOfClass:NSString.class] && seriesId.length > 0) {
        [requestedDeclarativeSeriesIds addObject:seriesId];
      }
    }
  }
  for (NSString *seriesId in [_declarativeSeriesIds copy]) {
    if (![requestedDeclarativeSeriesIds containsObject:seriesId]) {
      _engine->RemoveSeries(seriesId.UTF8String ?: "");
    }
  }
  NSMutableSet<NSString *> *nextDeclarativeSeriesIds = [NSMutableSet set];
  if ([additionalSeries isKindOfClass:NSArray.class]) {
    for (NSDictionary *item in additionalSeries) {
      if (![item isKindOfClass:NSDictionary.class]) continue;
      NSString *seriesId = item[@"seriesId"];
      SeriesConfig config = [self seriesConfigFromItem:item declarative:YES];
      const UpdateStatus status = _engine->AddSeries(config);
      TCLogStatus(status, @"additionalSeries");
      if (status == UpdateStatus::kApplied &&
          [seriesId isKindOfClass:NSString.class]) {
        [nextDeclarativeSeriesIds addObject:seriesId];
      }
    }
  }
  _declarativeSeriesIds = nextDeclarativeSeriesIds;
  [self requestFrame];
}

- (SeriesConfig)seriesConfigFromItem:(NSDictionary *)item declarative:(BOOL)declarative {
  SeriesConfig config;
  NSString *type = item[@"type"];
  config.series_id = [item[@"seriesId"] UTF8String] ?: "";
  config.pane_id = [item[@"paneId"] UTF8String] ?: "";
  config.price_scale_id = [item[@"priceScaleId"] UTF8String] ?: "";
  config.visible = item[@"visible"] ? [item[@"visible"] boolValue] : true;
  config.declarative = declarative;
  if ([type isEqualToString:@"bar"]) config.type = SeriesType::kBar;
  else if ([type isEqualToString:@"hollowCandlestick"]) {
    config.type = SeriesType::kHollowCandlestick;
  } else if ([type isEqualToString:@"histogram"]) {
    config.type = SeriesType::kHistogram;
  } else if ([type isEqualToString:@"line"]) {
    config.type = SeriesType::kLine;
  } else if ([type isEqualToString:@"area"]) {
    config.type = SeriesType::kArea;
  }
  id source = item[@"source"];
  if ([source isKindOfClass:NSDictionary.class] &&
      [source[@"type"] isEqualToString:@"ohlcvVolume"]) {
    config.source = SeriesSource::kOhlcvVolume;
    config.source_series_id = [source[@"seriesId"] UTF8String] ?: "main";
  }
  NSDictionary *appearance = item[@"appearance"];
  config.color = TCColorFromHex(appearance[@"color"], _config.axis_text);
  config.up = TCColorFromHex(appearance[@"upColor"], _config.up);
  config.down = TCColorFromHex(appearance[@"downColor"], _config.down);
  if (trading_charts::IsLineLikeSeries(config.type)) {
    const bool area = config.type == SeriesType::kArea;
    NSString *valueSource =
        [source isKindOfClass:NSString.class] ? source : @"close";
    config.line_source =
        [valueSource isEqualToString:@"open"]
            ? OhlcValueSource::kOpen
            : ([valueSource isEqualToString:@"high"]
                   ? OhlcValueSource::kHigh
                   : ([valueSource isEqualToString:@"low"]
                          ? OhlcValueSource::kLow
                          : OhlcValueSource::kClose));
    config.line_width = appearance[@"width"]
        ? [appearance[@"width"] floatValue]
        : (area ? _areaAppearanceWidth : _lineAppearanceWidth);
    config.color = TCColorFromHex(
        appearance[@"color"],
        area ? _areaAppearanceColor : _lineAppearanceColor);
    NSDictionary *gradient = appearance[@"gradient"];
    config.line_gradient_enabled =
        [gradient isKindOfClass:NSDictionary.class];
    config.line_gradient_top = TCColorFromHex(
        gradient[@"topColor"], config.color);
    config.line_gradient_bottom = TCColorFromHex(
        gradient[@"bottomColor"], config.color);
    if (area) {
      NSDictionary *fill = appearance[@"fill"];
      config.area_fill_top = TCColorFromHex(fill[@"topColor"], _areaFillTop);
      config.area_fill_bottom = TCColorFromHex(
          fill[@"bottomColor"], _areaFillBottom);
    }
    config.line_gap_threshold_ms = item[@"gapThresholdMs"]
        ? [item[@"gapThresholdMs"] doubleValue]
        : 0.0;
  }
  return config;
}

- (SeriesConfig)seriesConfigFromJson:(NSString *)json {
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *item =
      data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil]
           : nil;
  if (![item isKindOfClass:NSDictionary.class]) return SeriesConfig{};
  return [self seriesConfigFromItem:item declarative:NO];
}

- (void)addSeriesJson:(NSString *)json {
  SeriesConfig config = [self seriesConfigFromJson:json];
  const UpdateStatus status = _engine->AddSeries(config);
  TCLogStatus(status, @"addSeries");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}

- (void)setSeriesData:(NSArray<NSNumber *> *)data
             seriesId:(NSString *)seriesId
             dataType:(NSString *)dataType
              prepend:(BOOL)prepend
               update:(BOOL)update {
  auto values = TCDoubles(data);
  const bool histogram = [dataType isEqualToString:@"histogram"];
  UpdateStatus status = UpdateStatus::kInvalidInput;
  if (update) {
    status = _engine->UpdateSeriesData(seriesId.UTF8String ?: "",
                                       values.data(), values.size(), histogram);
  } else if (prepend) {
    status = _engine->PrependSeriesData(seriesId.UTF8String ?: "",
                                        values.data(), values.size(), histogram);
  } else {
    status = _engine->SetSeriesData(seriesId.UTF8String ?: "", values.data(),
                                    values.size(), histogram);
  }
  TCLogStatus(status, @"seriesData");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}

- (void)removeSeries:(NSString *)seriesId {
  if (_engine->RemoveSeries(seriesId.UTF8String ?: "")) {
    [_declarativeSeriesIds removeObject:seriesId];
    [self requestFrame];
  }
}

- (void)setPaneHeight:(NSString *)paneId weight:(double)weight {
  if (_engine->SetPaneHeight(paneId.UTF8String ?: "", weight)) {
    [self requestFrame];
  }
}

- (void)applyHistory:(NSArray<NSNumber *> *)data {
  _crosshairPinned = NO;
  _crosshairGestureActive = NO;
  _pendingScaleChange = NO;
  _pendingYAxisScaleChange = NO;
  auto values = TCDoubles(data);
  const UpdateStatus status = _engine->SetHistory(values.data(), values.size());
  TCLogStatus(status, @"setHistory");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}
- (void)prependHistory:(NSArray<NSNumber *> *)data {
  _crosshairPinned = NO;
  _crosshairGestureActive = NO;
  auto values = TCDoubles(data);
  const UpdateStatus status = _engine->PrependHistory(values.data(), values.size());
  TCLogStatus(status, @"prependHistory");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}
- (void)applyCandle:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  const UpdateStatus status = _engine->UpdateCandle(values.data(), values.size());
  TCLogStatus(status, @"updateCandle");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}
- (void)applyTrade:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  const UpdateStatus status = _engine->UpdateTrade(values.data(), values.size());
  TCLogStatus(status, @"updateTrade");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}
- (void)applyTrades:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  const UpdateStatus status = _engine->UpdateTrades(values.data(), values.size());
  TCLogStatus(status, @"updateTrades");
  if (status == UpdateStatus::kApplied) [self requestFrame];
}
- (void)zoomByScale:(double)scale {
  [self stopDeceleration];
  _crosshairPinned = NO;
  _crosshairGestureActive = NO;
  _pendingScaleChange = NO;
  _engine->ZoomAtRightEdge(scale);
  [self requestFrame];
}
- (void)fitContent {
  [self stopDeceleration];
  _crosshairPinned = NO;
  _crosshairGestureActive = NO;
  _pendingScaleChange = NO;
  _pendingYAxisScaleChange = NO;
  _engine->FitContent();
  [self requestFrame];
}
- (void)clearData {
  [self stopDeceleration];
  _crosshairPinned = NO;
  _crosshairGestureActive = NO;
  _pendingScaleChange = NO;
  _pendingYAxisScaleChange = NO;
  _engine->Clear();
  _lastFirstVisibleIndex = -1;
  _lastLastVisibleIndex = -1;
  _lastTotalCandleCount = -1;
  [self requestFrame];
}

- (NSArray<NSNumber *> *)candleData {
  const auto candles = _engine->Candles();
  NSMutableArray<NSNumber *> *result =
      [NSMutableArray arrayWithCapacity:candles.size() * 6];
  for (const Candle &candle : candles) {
    [result addObject:@(candle.timestamp)];
    [result addObject:@(candle.open)];
    [result addObject:@(candle.high)];
    [result addObject:@(candle.low)];
    [result addObject:@(candle.close)];
    [result addObject:@(candle.volume)];
  }
  return result;
}

- (BOOL)isPointInYAxis:(CGPoint)point {
  if (!_config.show_y_axis) return NO;
  if (_config.y_axis_on_right) {
    return point.x >= self.bounds.size.width - _config.y_axis_width;
  }
  return point.x <= _config.y_axis_width;
}

- (BOOL)isPointInPlot:(CGPoint)point {
  const CGFloat left = _config.show_y_axis && !_config.y_axis_on_right ? _config.y_axis_width : 0.0;
  const CGFloat right = self.bounds.size.width -
      (_config.show_y_axis && _config.y_axis_on_right ? _config.y_axis_width : 0.0);
  const CGFloat bottom = self.bounds.size.height - (_config.show_x_axis ? _config.x_axis_height : 0.0);
  return point.x >= left && point.x <= right && point.y >= 8.0 && point.y <= bottom;
}

- (void)handlePan:(UIPanGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    [self stopDeceleration];
    CGPoint point = [recognizer locationInView:self];
    const auto separator = _panesResizable
        ? _engine->SeparatorAt(point.y, 12.0f)
        : std::nullopt;
    if (separator.has_value()) {
      _resizingPane = YES;
      _resizingSeparatorIndex = *separator;
      _scalingYAxis = NO;
      _suppressMomentum = YES;
      [recognizer setTranslation:CGPointZero inView:self];
      return;
    }
    if (_crosshairPinned) {
      _scalingYAxis = NO;
      _suppressMomentum = YES;
      return;
    }
    _scalingYAxis = [self isPointInYAxis:[recognizer locationInView:self]];
    _suppressMomentum = _scalingYAxis;
    [recognizer setTranslation:CGPointZero inView:self];
    if (_scalingYAxis && _config.allow_y_axis_scale) {
      _engine->ScaleY(0.0f);
      [self requestFrame];
    }
    return;
  }
  if (recognizer.state == UIGestureRecognizerStateChanged) {
    if (_resizingPane) {
      CGPoint translation = [recognizer translationInView:self];
      [recognizer setTranslation:CGPointZero inView:self];
      if (_engine->ResizePaneSeparator(_resizingSeparatorIndex, translation.y)) {
        _pendingPaneResize = YES;
        [self requestFrame];
      }
      return;
    }
    if (_crosshairPinned) {
      CGPoint point = [recognizer locationInView:self];
      _engine->SetCrosshair(true, point.x, point.y);
      [self requestFrame];
      return;
    }
    CGPoint translation = [recognizer translationInView:self];
    [recognizer setTranslation:CGPointZero inView:self];
    if (_scalingYAxis) {
      const CGPoint point = [recognizer locationInView:self];
      if (_config.allow_y_axis_scale &&
          _engine->ScaleYAt(translation.y, point.y)) {
        _pendingYAxisScaleChange = YES;
        [self requestFrame];
      }
    } else if (_config.allow_pan) {
      if (_engine->Pan(translation.x)) {
        [self requestFrame];
      }
    }
    return;
  }
  if (recognizer.state == UIGestureRecognizerStateEnded ||
      recognizer.state == UIGestureRecognizerStateCancelled ||
      recognizer.state == UIGestureRecognizerStateFailed) {
    if (_resizingPane) {
      _resizingPane = NO;
      _pendingPaneResize = YES;
      _pendingPaneResizeFinished = YES;
      [self requestFrame];
      _suppressMomentum = NO;
      return;
    }
    const BOOL shouldDecelerate = !_crosshairPinned &&
        recognizer.state == UIGestureRecognizerStateEnded &&
        !_scalingYAxis && !_suppressMomentum && _config.allow_pan;
    const CGFloat velocity = shouldDecelerate
        ? [recognizer velocityInView:self].x
        : 0.0;
    _scalingYAxis = NO;
    _suppressMomentum = NO;
    if (shouldDecelerate) [self startDecelerationWithVelocity:velocity];
  }
}
- (void)handlePinch:(UIPinchGestureRecognizer *)recognizer {
  if (!_config.allow_zoom) return;
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    _suppressMomentum = YES;
    [self stopDeceleration];
    _crosshairPinned = NO;
    _crosshairGestureActive = NO;
    CGPoint focus = [recognizer locationInView:self];
    _engine->SetCrosshair(false, focus.x, focus.y);
    [self requestFrame];
    return;
  }
  if (recognizer.state == UIGestureRecognizerStateEnded ||
      recognizer.state == UIGestureRecognizerStateCancelled ||
      recognizer.state == UIGestureRecognizerStateFailed) {
    _suppressMomentum = NO;
    return;
  }
  if (recognizer.state != UIGestureRecognizerStateChanged) return;
  CGPoint focus = [recognizer locationInView:self];
  const bool zoomed = _engine->Zoom(recognizer.scale, focus.x);
  if (zoomed) {
    _pendingScaleChange = YES;
    [self requestFrame];
  }
  recognizer.scale = 1.0;
}
- (void)handleLongPress:(UILongPressGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    CGPoint point = [recognizer locationInView:self];
    if (!_config.crosshair_enabled || (!_crosshairPinned && ![self isPointInPlot:point])) {
      _crosshairGestureActive = NO;
      return;
    }
    _suppressMomentum = YES;
    [self stopDeceleration];
    _crosshairPinned = YES;
    _crosshairGestureActive = YES;
  }
  if (!_crosshairGestureActive) return;
  CGPoint point = [recognizer locationInView:self];
  if (recognizer.state == UIGestureRecognizerStateBegan ||
      recognizer.state == UIGestureRecognizerStateChanged) {
    _engine->SetCrosshair(true, point.x, point.y);
    [self requestFrame];
  } else if (recognizer.state == UIGestureRecognizerStateEnded ||
             recognizer.state == UIGestureRecognizerStateCancelled ||
             recognizer.state == UIGestureRecognizerStateFailed) {
    _crosshairGestureActive = NO;
  }
}
- (void)handleSingleTap:(UITapGestureRecognizer *)recognizer {
  CGPoint point = [recognizer locationInView:self];
  if (!_crosshairPinned &&
      (!_config.crosshair_enabled || ![self isPointInPlot:point])) {
    return;
  }
  if (_crosshairPinned) {
    _crosshairPinned = NO;
    _crosshairGestureActive = NO;
    _engine->SetCrosshair(false, point.x, point.y);
    [self requestFrame];
    return;
  }
  _suppressMomentum = YES;
  [self stopDeceleration];
  _crosshairPinned = YES;
  _engine->SetCrosshair(true, point.x, point.y);
  [self requestFrame];
}
- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer
    shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer *)other {
  return [gestureRecognizer isKindOfClass:UIPinchGestureRecognizer.class] ||
      [other isKindOfClass:UIPinchGestureRecognizer.class];
}

@end

@implementation TradingChartsView {
  TCChartHostView *_host;
  NSString *_chartId;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<TradingChartsViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const TradingChartsViewProps>();
    _props = defaultProps;
    _host = [[TCChartHostView alloc] initWithFrame:frame];
    __weak TradingChartsView *weakSelf = self;
    _host.visibleRangeDidChange = ^(std::shared_ptr<const RenderSnapshot> snapshot) {
      TradingChartsView *strongSelf = weakSelf;
      if (!strongSelf || !strongSelf->_eventEmitter) return;
      auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
          strongSelf->_eventEmitter);
      emitter->onVisibleRangeChange({
          snapshot->visible_x_min,
          snapshot->visible_x_max,
          static_cast<int>(snapshot->first_visible_index),
          static_cast<int>(snapshot->last_visible_index),
          static_cast<int>(snapshot->total_candle_count),
          snapshot->first_visible_index == 0,
          snapshot->last_visible_index + 1 == snapshot->total_candle_count,
      });
    };
    _host.selectedCandleDidChange = ^(std::shared_ptr<const RenderSnapshot> snapshot) {
      TradingChartsView *strongSelf = weakSelf;
      if (!strongSelf || !strongSelf->_eventEmitter) return;
      auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
          strongSelf->_eventEmitter);
      const Candle &candle = snapshot->selected_candle;
      emitter->onSelectedCandleChange({
          snapshot->crosshair_visible,
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume,
      });
    };
    _host.scaleDidChange = ^(std::shared_ptr<const RenderSnapshot> snapshot) {
      TradingChartsView *strongSelf = weakSelf;
      if (!strongSelf || !strongSelf->_eventEmitter) return;
      auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
          strongSelf->_eventEmitter);
      emitter->onScaleChange({snapshot->horizontal_scale});
    };
    _host.yAxisScaleDidChange = ^(std::shared_ptr<const RenderSnapshot> snapshot) {
      TradingChartsView *strongSelf = weakSelf;
      if (!strongSelf || !strongSelf->_eventEmitter) return;
      auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
          strongSelf->_eventEmitter);
      emitter->onYAxisScaleChange({snapshot->y_axis_scale});
    };
    _host.priceScaleDidChange = ^(std::shared_ptr<const RenderSnapshot> snapshot) {
      TradingChartsView *strongSelf = weakSelf;
      if (!strongSelf || !strongSelf->_eventEmitter || snapshot->panes.empty()) return;
      auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
          strongSelf->_eventEmitter);
      const size_t index =
          std::min(snapshot->active_pane_index, snapshot->panes.size() - 1);
      const auto &pane = snapshot->panes[index];
      emitter->onPriceScaleChange({
          pane.pane_id,
          pane.price_scale_id,
          pane.y_axis_scale,
      });
    };
    _host.paneResizeDidChange =
        ^(std::shared_ptr<const RenderSnapshot> snapshot, size_t separatorIndex,
          BOOL finished) {
      TradingChartsView *strongSelf = weakSelf;
      if (!strongSelf || !strongSelf->_eventEmitter ||
          separatorIndex + 1 >= snapshot->panes.size()) return;
      auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
          strongSelf->_eventEmitter);
      const auto &first = snapshot->panes[separatorIndex];
      const auto &second = snapshot->panes[separatorIndex + 1];
      emitter->onPaneResize({
          first.pane_id,
          first.height_weight,
          second.pane_id,
          second.height_weight,
          finished == YES,
      });
    };
    self.contentView = _host;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps = *std::static_pointer_cast<TradingChartsViewProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<TradingChartsViewProps const>(props);
  if (oldViewProps.configJson != newViewProps.configJson) {
    [_host applyConfigJson:[NSString stringWithUTF8String:newViewProps.configJson.c_str()]];
  }
  NSString *newChartId = [NSString stringWithUTF8String:newViewProps.chartId.c_str()];
  // Fabric keeps `_props` when a component view is recycled. prepareForRecycle
  // intentionally unregisters the view, so comparing only old/new props misses
  // a remount that uses the same chartId and leaves the new view disconnected.
  if (!((_chartId == newChartId) || [_chartId isEqualToString:newChartId])) {
    if (_chartId.length > 0) [[TradingChartsRegistry shared] unregisterView:self chartId:_chartId];
    _chartId = newChartId;
    if (_chartId.length > 0) [[TradingChartsRegistry shared] registerView:self chartId:_chartId];
  }
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle {
  if (_chartId.length > 0) [[TradingChartsRegistry shared] unregisterView:self chartId:_chartId];
  _chartId = nil;
  [_host clearData];
  [super prepareForRecycle];
}

- (void)dealloc {
  if (_chartId.length > 0) [[TradingChartsRegistry shared] unregisterView:self chartId:_chartId];
}

- (void)applyHistoryData:(NSArray<NSNumber *> *)data { [_host applyHistory:TCArrayOrEmpty(data)]; }
- (void)prependHistoryData:(NSArray<NSNumber *> *)data { [_host prependHistory:TCArrayOrEmpty(data)]; }
- (void)applyCandleData:(NSArray<NSNumber *> *)data { [_host applyCandle:TCArrayOrEmpty(data)]; }
- (void)applyTradeData:(NSArray<NSNumber *> *)data { [_host applyTrade:TCArrayOrEmpty(data)]; }
- (void)applyTradesData:(NSArray<NSNumber *> *)data { [_host applyTrades:TCArrayOrEmpty(data)]; }
- (void)addSeriesJson:(NSString *)json { [_host addSeriesJson:json ?: @""]; }
- (void)setSeriesData:(NSArray<NSNumber *> *)data
             seriesId:(NSString *)seriesId
             dataType:(NSString *)dataType
              prepend:(BOOL)prepend
               update:(BOOL)update {
  [_host setSeriesData:TCArrayOrEmpty(data)
              seriesId:seriesId ?: @""
              dataType:dataType ?: @""
               prepend:prepend
                update:update];
}
- (void)removeSeries:(NSString *)seriesId { [_host removeSeries:seriesId ?: @""]; }
- (void)setPaneHeight:(NSString *)paneId weight:(double)weight {
  [_host setPaneHeight:paneId ?: @"" weight:weight];
}
- (void)zoomByScale:(double)scale { [_host zoomByScale:scale]; }
- (void)fitChartContent { [_host fitContent]; }
- (void)clearChartData { [_host clearData]; }
- (NSArray<NSNumber *> *)candleData { return [_host candleData]; }

@end
