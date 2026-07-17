#import "TradingChartsView.h"

#import <MetalKit/MetalKit.h>
#import <React/RCTConversions.h>
#import <simd/simd.h>

#import <react/renderer/components/TradingChartsViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/TradingChartsViewSpec/Props.h>
#import <react/renderer/components/TradingChartsViewSpec/RCTComponentViewHelpers.h>

#import "RCTFabricComponentsPlugins.h"
#import "TradingChartsRegistry.h"
#import "../cpp/ChartEngine.h"

#include <cmath>

using namespace facebook::react;
using tradingcharts::ChartConfig;
using tradingcharts::ChartEngine;
using tradingcharts::RenderSnapshot;
using tradingcharts::UpdateStatus;
using TCColor = tradingcharts::Color;

namespace {

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

NSArray<NSNumber *> *TCArrayOrEmpty(id value) {
  return [value isKindOfClass:NSArray.class] ? value : @[];
}

std::vector<double> TCDoubles(NSArray<NSNumber *> *values) {
  std::vector<double> result;
  result.reserve(values.count);
  for (NSNumber *value in values) result.push_back(value.doubleValue);
  return result;
}

void TCLogStatus(UpdateStatus status, NSString *operation) {
  if (status == UpdateStatus::IgnoredOldTimestamp) {
    NSLog(@"[TradingCharts] %@ ignored an out-of-order timestamp", operation);
  } else if (status == UpdateStatus::InvalidInput) {
    NSLog(@"[TradingCharts] %@ received invalid data", operation);
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
  id<MTLBuffer> _vertexBuffer;
  NSUInteger _vertexCapacity;
  std::shared_ptr<const RenderSnapshot> _snapshot;
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
  id<CAMetalDrawable> drawable = view.currentDrawable;
  MTLRenderPassDescriptor *pass = view.currentRenderPassDescriptor;
  if (!drawable || !pass || !_pipeline) return;

  const NSUInteger byteCount = snapshot->vertices.size() * sizeof(float);
  if (snapshot->revision != _uploadedRevision) {
    if (byteCount > _vertexCapacity) {
      _vertexCapacity = MAX(byteCount + 4096, 4096);
      _vertexBuffer = [_device newBufferWithLength:_vertexCapacity options:MTLResourceStorageModeShared];
    }
    if (byteCount > 0) memcpy(_vertexBuffer.contents, snapshot->vertices.data(), byteCount);
    _uploadedRevision = snapshot->revision;
  }

  id<MTLCommandBuffer> command = [_commandQueue commandBuffer];
  id<MTLRenderCommandEncoder> encoder = [command renderCommandEncoderWithDescriptor:pass];
  [encoder setRenderPipelineState:_pipeline];
  if (byteCount > 0 && _vertexBuffer) {
    [encoder setVertexBuffer:_vertexBuffer offset:0 atIndex:0];
    TCMetalUniforms uniforms{simd_make_float2(static_cast<float>(snapshot->width),
                                              static_cast<float>(snapshot->height))};
    [encoder setVertexBytes:&uniforms length:sizeof(uniforms) atIndex:1];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle
                vertexStart:0
                vertexCount:snapshot->vertices.size() / 6];
  }
  [encoder endEncoding];
  [command presentDrawable:drawable];
  [command commit];
}

@end

@interface TCChartOverlayView : UIView
- (void)setSnapshot:(std::shared_ptr<const RenderSnapshot>)snapshot;
@end

@implementation TCChartOverlayView {
  std::shared_ptr<const RenderSnapshot> _snapshot;
  NSNumberFormatter *_numberFormatter;
  NSDateFormatter *_dateFormatter;
  NSDateFormatter *_fullDateFormatter;
  NSString *_formatterKey;
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    self.backgroundColor = UIColor.clearColor;
    self.userInteractionEnabled = NO;
    self.contentMode = UIViewContentModeRedraw;
  }
  return self;
}

- (void)setSnapshot:(std::shared_ptr<const RenderSnapshot>)snapshot {
  _snapshot = std::move(snapshot);
  [self setNeedsDisplay];
}

- (void)prepareFormatters:(const RenderSnapshot &)snapshot {
  const ChartConfig &config = snapshot.config;
  NSString *key = [NSString stringWithFormat:@"%s|%s|%s|%s|%d|%d|%d|%d",
                   config.xLocale.c_str(), config.xTimeZone.c_str(), config.yLocale.c_str(),
                   config.currencySymbol.c_str(), config.precision, config.compactValues,
                   config.useGrouping, config.showSeconds];
  if ([_formatterKey isEqualToString:key]) return;
  _formatterKey = key;
  _numberFormatter = [NSNumberFormatter new];
  _numberFormatter.locale = [NSLocale localeWithLocaleIdentifier:
      [NSString stringWithUTF8String:config.yLocale.c_str()]];
  _numberFormatter.numberStyle = NSNumberFormatterDecimalStyle;
  _numberFormatter.usesGroupingSeparator = config.useGrouping;
  _numberFormatter.minimumFractionDigits = config.compactValues ? 0 : config.precision;
  _numberFormatter.maximumFractionDigits = config.precision;

  NSTimeZone *zone = [NSTimeZone timeZoneWithName:
      [NSString stringWithUTF8String:config.xTimeZone.c_str()]] ?: NSTimeZone.defaultTimeZone;
  NSLocale *locale = [NSLocale localeWithLocaleIdentifier:
      [NSString stringWithUTF8String:config.xLocale.c_str()]];
  _dateFormatter = [NSDateFormatter new];
  _dateFormatter.locale = locale;
  _dateFormatter.timeZone = zone;
  _fullDateFormatter = [NSDateFormatter new];
  _fullDateFormatter.locale = locale;
  _fullDateFormatter.timeZone = zone;
  _fullDateFormatter.dateFormat = @"d MMM yyyy HH:mm:ss";
}

- (NSString *)formatValue:(double)value snapshot:(const RenderSnapshot &)snapshot {
  const ChartConfig &config = snapshot.config;
  double scaled = value;
  NSString *suffix = @"";
  if (config.compactValues) {
    const double magnitude = fabs(value);
    if (magnitude >= 1e12) { scaled = value / 1e12; suffix = @"T"; }
    else if (magnitude >= 1e9) { scaled = value / 1e9; suffix = @"B"; }
    else if (magnitude >= 1e6) { scaled = value / 1e6; suffix = @"M"; }
    else if (magnitude >= 1e3) { scaled = value / 1e3; suffix = @"K"; }
  }
  NSString *number = [_numberFormatter stringFromNumber:@(scaled)] ?: [NSString stringWithFormat:@"%g", scaled];
  NSString *currency = [NSString stringWithUTF8String:config.currencySymbol.c_str()];
  return [NSString stringWithFormat:@"%@%@%@", currency, number, suffix];
}

- (NSString *)formatTime:(double)timestamp snapshot:(const RenderSnapshot &)snapshot full:(BOOL)full {
  NSDate *date = [NSDate dateWithTimeIntervalSince1970:timestamp / 1000.0];
  if (full) return [_fullDateFormatter stringFromDate:date];
  const double span = snapshot.visibleXMax - snapshot.visibleXMin;
  if (span <= 5.0 * 60.0 * 1000.0 ||
      (snapshot.config.showSeconds && span <= 2.0 * 60.0 * 60.0 * 1000.0))
    _dateFormatter.dateFormat = @"HH:mm:ss";
  else if (span <= 2.0 * 24.0 * 60.0 * 60.0 * 1000.0)
    _dateFormatter.dateFormat = @"HH:mm";
  else if (span <= 180.0 * 24.0 * 60.0 * 60.0 * 1000.0)
    _dateFormatter.dateFormat = @"d MMM";
  else if (span <= 2.0 * 365.0 * 24.0 * 60.0 * 60.0 * 1000.0)
    _dateFormatter.dateFormat = @"MMM yyyy";
  else
    _dateFormatter.dateFormat = @"yyyy";
  return [_dateFormatter stringFromDate:date];
}

- (void)drawBadge:(NSString *)text
                y:(CGFloat)y
            color:(UIColor *)color
         textColor:(UIColor *)textColor
          snapshot:(const RenderSnapshot &)snapshot {
  NSDictionary *attrs = @{
    NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:11 weight:UIFontWeightSemibold],
    NSForegroundColorAttributeName: textColor,
  };
  CGSize textSize = [text sizeWithAttributes:attrs];
  CGFloat width = MIN(snapshot.config.yAxisWidth, textSize.width + 12);
  CGFloat x = snapshot.config.yAxisOnRight ? snapshot.plot.right : MAX(0, snapshot.plot.left - width);
  CGRect frame = CGRectMake(x, y - 10, width, 20);
  UIBezierPath *path = [UIBezierPath bezierPathWithRoundedRect:frame cornerRadius:4];
  [color setFill];
  [path fill];
  [text drawAtPoint:CGPointMake(frame.origin.x + 6, frame.origin.y + 3) withAttributes:attrs];
}

- (void)drawRect:(CGRect)rect {
  auto snapshot = _snapshot;
  if (!snapshot || snapshot->width <= 0 || snapshot->height <= 0) return;
  [self prepareFormatters:*snapshot];
  const ChartConfig &config = snapshot->config;
  UIColor *axisColor = TCUIColor(config.axisText);
  NSDictionary *axisAttrs = @{
    NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:10.5 weight:UIFontWeightRegular],
    NSForegroundColorAttributeName: axisColor,
  };

  if (config.showXAxis) {
    CGFloat lastRight = -CGFLOAT_MAX;
    for (const auto &tick : snapshot->xTicks) {
      NSString *label = [self formatTime:tick.value snapshot:*snapshot full:NO];
      CGSize size = [label sizeWithAttributes:axisAttrs];
      CGFloat x = MAX(2, MIN(snapshot->width - size.width - 2, tick.position - size.width / 2));
      if (x < lastRight + 8) continue;
      [label drawAtPoint:CGPointMake(x, snapshot->plot.bottom + 5) withAttributes:axisAttrs];
      lastRight = x + size.width;
    }
  }

  if (config.showYAxis) {
    for (const auto &tick : snapshot->yTicks) {
      NSString *label = [self formatValue:tick.value snapshot:*snapshot];
      CGSize size = [label sizeWithAttributes:axisAttrs];
      CGFloat x = config.yAxisOnRight ? snapshot->plot.right + 6 : snapshot->plot.left - size.width - 6;
      [label drawAtPoint:CGPointMake(MAX(2, x), tick.position - size.height / 2) withAttributes:axisAttrs];
    }
  }

  if (snapshot->currentPriceVisible && config.showCurrentPriceLabel) {
    NSString *text = [self formatValue:snapshot->currentPrice snapshot:*snapshot];
    [self drawBadge:text y:snapshot->currentPriceY color:TCUIColor(snapshot->currentPriceColor)
           textColor:UIColor.blackColor snapshot:*snapshot];
  }

  if (snapshot->crosshairVisible) {
    NSString *price = [self formatValue:snapshot->crosshairPrice snapshot:*snapshot];
    [self drawBadge:price y:snapshot->crosshairY color:TCUIColor(config.crosshair)
           textColor:UIColor.blackColor snapshot:*snapshot];

    NSString *time = [self formatTime:snapshot->selectedCandle.timestamp snapshot:*snapshot full:YES];
    NSDictionary *badgeAttrs = @{
      NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:10.5 weight:UIFontWeightSemibold],
      NSForegroundColorAttributeName: UIColor.blackColor,
    };
    CGSize timeSize = [time sizeWithAttributes:badgeAttrs];
    CGRect timeFrame = CGRectMake(
        MAX(snapshot->plot.left, MIN(snapshot->plot.right - timeSize.width - 12,
                                    snapshot->crosshairX - timeSize.width / 2 - 6)),
        snapshot->plot.bottom, timeSize.width + 12, 20);
    [TCUIColor(config.crosshair) setFill];
    [[UIBezierPath bezierPathWithRoundedRect:timeFrame cornerRadius:4] fill];
    [time drawAtPoint:CGPointMake(timeFrame.origin.x + 6, timeFrame.origin.y + 3)
       withAttributes:badgeAttrs];

    if (config.showTooltip) {
      const auto &c = snapshot->selectedCandle;
      NSArray<NSString *> *lines = @[
        [self formatTime:c.timestamp snapshot:*snapshot full:YES],
        [NSString stringWithFormat:@"O  %@", [self formatValue:c.open snapshot:*snapshot]],
        [NSString stringWithFormat:@"H  %@", [self formatValue:c.high snapshot:*snapshot]],
        [NSString stringWithFormat:@"L  %@", [self formatValue:c.low snapshot:*snapshot]],
        [NSString stringWithFormat:@"C  %@", [self formatValue:c.close snapshot:*snapshot]],
      ];
      NSDictionary *tooltipAttrs = @{
        NSFontAttributeName: [UIFont monospacedDigitSystemFontOfSize:11 weight:UIFontWeightMedium],
        NSForegroundColorAttributeName: TCUIColor(config.tooltipText),
      };
      CGFloat maxWidth = 0;
      for (NSString *line in lines) maxWidth = MAX(maxWidth, [line sizeWithAttributes:tooltipAttrs].width);
      CGFloat boxWidth = maxWidth + 20;
      CGFloat boxHeight = lines.count * 17 + 18;
      CGFloat boxX = snapshot->crosshairX > snapshot->width / 2
          ? snapshot->plot.left + 8
          : snapshot->plot.right - boxWidth - 8;
      CGRect box = CGRectMake(boxX, snapshot->plot.top + 8, boxWidth, boxHeight);
      [TCUIColor(config.tooltipBackground) setFill];
      [[UIBezierPath bezierPathWithRoundedRect:box cornerRadius:8] fill];
      CGFloat y = box.origin.y + 9;
      for (NSString *line in lines) {
        [line drawAtPoint:CGPointMake(box.origin.x + 10, y) withAttributes:tooltipAttrs];
        y += 17;
      }
    }
  }
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
- (void)applyConfigJson:(NSString *)json;
- (void)applyHistory:(NSArray<NSNumber *> *)data;
- (void)applyCandle:(NSArray<NSNumber *> *)data;
- (void)applyTrade:(NSArray<NSNumber *> *)data;
- (void)applyTrades:(NSArray<NSNumber *> *)data;
- (void)zoomByScale:(double)scale;
- (void)fitContent;
- (void)clearData;
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
  BOOL _decelerating;
  CGFloat _horizontalVelocity;
  CFTimeInterval _lastDecelerationTimestamp;
  ChartConfig _config;
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    _engine = std::make_shared<ChartEngine>();
    _engine->setConfig(_config);
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
    UITapGestureRecognizer *doubleTap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleDoubleTap:)];
    doubleTap.numberOfTapsRequired = 2;
    [self addGestureRecognizer:doubleTap];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _metalView.frame = self.bounds;
  _overlay.frame = self.bounds;
  _engine->setSize(self.bounds.size.width, self.bounds.size.height);
  [self requestFrame];
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  [self stopDeceleration];
  _displayLink.paused = YES;
  _frameScheduled = NO;
  if (self.window) [self requestFrame];
}

- (void)applicationDidBecomeActive:(NSNotification *)notification {
  [self stopDeceleration];
  _displayLink.paused = YES;
  _frameScheduled = NO;
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
  if (_decelerating) {
    const CFTimeInterval fallbackDuration =
        displayLink.duration > 0.0 ? displayLink.duration : 1.0 / 60.0;
    const CFTimeInterval elapsed = _lastDecelerationTimestamp > 0.0
        ? displayLink.timestamp - _lastDecelerationTimestamp
        : fallbackDuration;
    const CFTimeInterval deltaTime =
        std::min(std::max(elapsed, 1.0 / 240.0), 1.0 / 30.0);
    _lastDecelerationTimestamp = displayLink.timestamp;
    const bool moved = _engine->pan(_horizontalVelocity * deltaTime);
    _horizontalVelocity *= std::pow(
        static_cast<double>(UIScrollViewDecelerationRateNormal), deltaTime * 1000.0);
    if (!moved || std::abs(_horizontalVelocity) <= 5.0) {
      [self stopDeceleration];
    }
  }
  auto snapshot = _engine->snapshot();
  [_renderer setSnapshot:snapshot];
  [_overlay setSnapshot:snapshot];
  [_metalView draw];
  if (_decelerating) [self requestFrame];
}

- (void)startDecelerationWithVelocity:(CGFloat)velocity {
  [self stopDeceleration];
  if (!_config.allowPan || std::abs(velocity) <= 5.0) return;
  _horizontalVelocity = velocity;
  _lastDecelerationTimestamp = 0.0;
  _decelerating = YES;
  [self requestFrame];
}

- (void)stopDeceleration {
  _decelerating = NO;
  _horizontalVelocity = 0.0;
  _lastDecelerationTimestamp = 0.0;
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
  NSDictionary *theme = root[@"theme"];
  NSDictionary *xAxis = root[@"xAxis"];
  NSDictionary *yAxis = root[@"yAxis"];
  NSDictionary *format = yAxis[@"valueFormat"];
  NSDictionary *gestures = root[@"gestures"];
  NSDictionary *current = root[@"currentPrice"];
  NSDictionary *crosshair = root[@"crosshair"];
  _config.timeframeMs = [root[@"timeframeMs"] doubleValue];
  _config.initialVisibleCount = [root[@"initialVisibleCount"] intValue];
  _config.background = TCColorFromHex(theme[@"backgroundColor"], _config.background);
  _config.grid = TCColorFromHex(theme[@"gridColor"], _config.grid);
  _config.axisText = TCColorFromHex(theme[@"axisTextColor"], _config.axisText);
  _config.up = TCColorFromHex(theme[@"upColor"], _config.up);
  _config.down = TCColorFromHex(theme[@"downColor"], _config.down);
  _config.crosshair = TCColorFromHex(theme[@"crosshairColor"], _config.crosshair);
  _config.tooltipBackground = TCColorFromHex(theme[@"tooltipBackgroundColor"], _config.tooltipBackground);
  _config.tooltipText = TCColorFromHex(theme[@"tooltipTextColor"], _config.tooltipText);
  _config.showXAxis = [xAxis[@"visible"] boolValue];
  _config.xAxisHeight = [xAxis[@"height"] floatValue];
  _config.xLocale = [xAxis[@"locale"] UTF8String] ?: "en-GB";
  _config.xTimeZone = [xAxis[@"timeZone"] UTF8String] ?: "UTC";
  _config.showSeconds = [xAxis[@"showSeconds"] boolValue];
  _config.logicalSpacing = [xAxis[@"spacing"] isEqualToString:@"logical"];
  _config.showYAxis = [yAxis[@"visible"] boolValue];
  _config.yAxisOnRight = ![yAxis[@"position"] isEqualToString:@"left"];
  _config.yAxisWidth = [yAxis[@"width"] floatValue];
  NSDictionary *scaleMargins = yAxis[@"scaleMargins"];
  _config.yScaleMarginTop = [scaleMargins[@"top"] doubleValue];
  _config.yScaleMarginBottom = [scaleMargins[@"bottom"] doubleValue];
  _config.compactValues = [format[@"type"] isEqualToString:@"compact"];
  _config.precision = [format[@"precision"] intValue];
  _config.minMove = format[@"minMove"] ? [format[@"minMove"] doubleValue] : 0.01;
  _config.yLocale = [format[@"locale"] UTF8String] ?: "en-GB";
  _config.currencySymbol = [format[@"currencySymbol"] UTF8String] ?: "";
  _config.useGrouping = format[@"useGrouping"] ? [format[@"useGrouping"] boolValue] : true;
  _config.allowPan = [gestures[@"pan"] boolValue];
  _config.allowZoom = [gestures[@"zoom"] boolValue];
  _config.showCurrentPrice = [current[@"visible"] boolValue];
  _config.showCurrentPriceLabel = [current[@"showLabel"] boolValue];
  _config.crosshairEnabled = [crosshair[@"enabled"] boolValue];
  _config.showTooltip = [crosshair[@"showTooltip"] boolValue];
  if (!_config.allowPan) [self stopDeceleration];
  _engine->setConfig(_config);
  [self requestFrame];
}

- (void)applyHistory:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  TCLogStatus(_engine->setHistory(values.data(), values.size()), @"setHistory");
  [self requestFrame];
}
- (void)applyCandle:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  TCLogStatus(_engine->updateCandle(values.data(), values.size()), @"updateCandle");
  [self requestFrame];
}
- (void)applyTrade:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  TCLogStatus(_engine->updateTrade(values.data(), values.size()), @"updateTrade");
  [self requestFrame];
}
- (void)applyTrades:(NSArray<NSNumber *> *)data {
  auto values = TCDoubles(data);
  TCLogStatus(_engine->updateTrades(values.data(), values.size()), @"updateTrades");
  [self requestFrame];
}
- (void)zoomByScale:(double)scale {
  [self stopDeceleration];
  _engine->zoomAtRightEdge(scale);
  [self requestFrame];
}
- (void)fitContent {
  [self stopDeceleration];
  _engine->fitContent();
  [self requestFrame];
}
- (void)clearData {
  [self stopDeceleration];
  _engine->clear();
  [self requestFrame];
}

- (BOOL)isPointInYAxis:(CGPoint)point {
  if (!_config.showYAxis || !_config.allowZoom) return NO;
  if (_config.yAxisOnRight) {
    return point.x >= self.bounds.size.width - _config.yAxisWidth;
  }
  return point.x <= _config.yAxisWidth;
}

- (void)handlePan:(UIPanGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    [self stopDeceleration];
    _scalingYAxis = [self isPointInYAxis:[recognizer locationInView:self]];
    _suppressMomentum = _scalingYAxis;
    [recognizer setTranslation:CGPointZero inView:self];
    if (_scalingYAxis) {
      _engine->scaleY(0.0f);
      [self requestFrame];
    }
    return;
  }
  if (recognizer.state == UIGestureRecognizerStateChanged) {
    CGPoint translation = [recognizer translationInView:self];
    [recognizer setTranslation:CGPointZero inView:self];
    if (_scalingYAxis) _engine->scaleY(translation.y);
    else if (_config.allowPan) _engine->pan(translation.x);
    [self requestFrame];
    return;
  }
  if (recognizer.state == UIGestureRecognizerStateEnded ||
      recognizer.state == UIGestureRecognizerStateCancelled ||
      recognizer.state == UIGestureRecognizerStateFailed) {
    const BOOL shouldDecelerate = recognizer.state == UIGestureRecognizerStateEnded &&
        !_scalingYAxis && !_suppressMomentum && _config.allowPan;
    const CGFloat velocity = shouldDecelerate
        ? [recognizer velocityInView:self].x
        : 0.0;
    _scalingYAxis = NO;
    _suppressMomentum = NO;
    if (shouldDecelerate) [self startDecelerationWithVelocity:velocity];
  }
}
- (void)handlePinch:(UIPinchGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    _suppressMomentum = YES;
    [self stopDeceleration];
  }
  if (recognizer.state != UIGestureRecognizerStateChanged) return;
  CGPoint focus = [recognizer locationInView:self];
  _engine->zoom(recognizer.scale, focus.x);
  recognizer.scale = 1.0;
  [self requestFrame];
}
- (void)handleLongPress:(UILongPressGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    _suppressMomentum = YES;
    [self stopDeceleration];
  }
  CGPoint point = [recognizer locationInView:self];
  BOOL active = recognizer.state == UIGestureRecognizerStateBegan ||
      recognizer.state == UIGestureRecognizerStateChanged;
  _engine->setCrosshair(active, point.x, point.y);
  [self requestFrame];
}
- (void)handleDoubleTap:(UITapGestureRecognizer *)recognizer {
  _suppressMomentum = YES;
  [self stopDeceleration];
  _engine->resetViewport();
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
- (void)applyCandleData:(NSArray<NSNumber *> *)data { [_host applyCandle:TCArrayOrEmpty(data)]; }
- (void)applyTradeData:(NSArray<NSNumber *> *)data { [_host applyTrade:TCArrayOrEmpty(data)]; }
- (void)applyTradesData:(NSArray<NSNumber *> *)data { [_host applyTrades:TCArrayOrEmpty(data)]; }
- (void)zoomByScale:(double)scale { [_host zoomByScale:scale]; }
- (void)fitChartContent { [_host fitContent]; }
- (void)clearChartData { [_host clearData]; }

@end
