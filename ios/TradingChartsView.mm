#import "TradingChartsView.h"

#import <react/renderer/components/TradingChartsViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/TradingChartsViewSpec/EventEmitters.h>
#import <react/renderer/components/TradingChartsViewSpec/Props.h>
#import <react/renderer/components/TradingChartsViewSpec/RCTComponentViewHelpers.h>

#if __has_include(<TradingCharts/TradingCharts-Swift.h>)
#import <TradingCharts/TradingCharts-Swift.h>
#else
#import "TradingCharts-Swift.h"
#endif

using namespace facebook::react;

@interface TradingChartsView () <ChartHostViewDelegate,
                                 TradingChartsCommandTarget,
                                 RCTTradingChartsViewViewProtocol>
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
    static const auto defaultProps =
        std::make_shared<const TradingChartsViewProps>();
    _props = defaultProps;
    _host = [[TCChartHostView alloc] initWithFrame:frame];
    _host.delegate = self;
    self.contentView = _host;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps =
      *std::static_pointer_cast<TradingChartsViewProps const>(_props);
  const auto &newViewProps =
      *std::static_pointer_cast<TradingChartsViewProps const>(props);
  if (oldViewProps.configJson != newViewProps.configJson) {
    [_host applyConfigJson:
               [NSString stringWithUTF8String:newViewProps.configJson.c_str()]];
  }
  NSString *newChartId =
      [NSString stringWithUTF8String:newViewProps.chartId.c_str()];
  if (!((_chartId == newChartId) || [_chartId isEqualToString:newChartId])) {
    if (_chartId.length > 0) {
      [TradingChartsRegistry.shared unregisterView:self chartId:_chartId];
    }
    _chartId = newChartId;
    if (_chartId.length > 0) {
      [TradingChartsRegistry.shared registerView:self chartId:_chartId];
    }
  }
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle {
  if (_chartId.length > 0) {
    [TradingChartsRegistry.shared unregisterView:self chartId:_chartId];
  }
  _chartId = nil;
  [_host clearData];
  [super prepareForRecycle];
}

- (void)dealloc {
  _host.delegate = nil;
  if (_chartId.length > 0) {
    [TradingChartsRegistry.shared unregisterView:self chartId:_chartId];
  }
}

- (void)chartHostView:(TCChartHostView *)host
          visibleXMin:(double)visibleXMin
          visibleXMax:(double)visibleXMax
    firstVisibleIndex:(NSInteger)firstVisibleIndex
     lastVisibleIndex:(NSInteger)lastVisibleIndex
     totalCandleCount:(NSInteger)totalCandleCount
            isAtStart:(BOOL)isAtStart
              isAtEnd:(BOOL)isAtEnd {
  if (!_eventEmitter) return;
  auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
      _eventEmitter);
  emitter->onVisibleRangeChange({
      visibleXMin,
      visibleXMax,
      static_cast<int>(firstVisibleIndex),
      static_cast<int>(lastVisibleIndex),
      static_cast<int>(totalCandleCount),
      isAtStart == YES,
      isAtEnd == YES,
  });
}

- (void)chartHostView:(TCChartHostView *)host
    selectedCandleActive:(BOOL)active
              timestamp:(double)timestamp
                   open:(double)open
                   high:(double)high
                    low:(double)low
                  close:(double)close
                 volume:(double)volume {
  if (!_eventEmitter) return;
  auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
      _eventEmitter);
  emitter->onSelectedCandleChange({
      active == YES,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
  });
}

- (void)chartHostView:(TCChartHostView *)host
      horizontalScale:(double)horizontalScale {
  if (!_eventEmitter) return;
  auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
      _eventEmitter);
  emitter->onScaleChange({horizontalScale});
}

- (void)chartHostView:(TCChartHostView *)host
           yAxisScale:(double)yAxisScale {
  if (!_eventEmitter) return;
  auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
      _eventEmitter);
  emitter->onYAxisScaleChange({yAxisScale});
}

- (void)chartHostView:(TCChartHostView *)host
               paneId:(NSString *)paneId
         priceScaleId:(NSString *)priceScaleId
           priceScale:(double)priceScale {
  if (!_eventEmitter) return;
  auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
      _eventEmitter);
  emitter->onPriceScaleChange({
      paneId.UTF8String ?: "",
      priceScaleId.UTF8String ?: "",
      priceScale,
  });
}

- (void)chartHostView:(TCChartHostView *)host
           firstPaneId:(NSString *)firstPaneId
     firstHeightWeight:(double)firstHeightWeight
          secondPaneId:(NSString *)secondPaneId
    secondHeightWeight:(double)secondHeightWeight
        resizeFinished:(BOOL)resizeFinished {
  if (!_eventEmitter) return;
  auto emitter = std::static_pointer_cast<const TradingChartsViewEventEmitter>(
      _eventEmitter);
  emitter->onPaneResize({
      firstPaneId.UTF8String ?: "",
      firstHeightWeight,
      secondPaneId.UTF8String ?: "",
      secondHeightWeight,
      resizeFinished == YES,
  });
}

- (void)applyHistoryData:(NSArray<NSNumber *> *)data {
  [_host applyHistory:data ?: @[]];
}

- (void)prependHistoryData:(NSArray<NSNumber *> *)data {
  [_host prependHistory:data ?: @[]];
}

- (void)applyCandleData:(NSArray<NSNumber *> *)data {
  [_host applyCandle:data ?: @[]];
}

- (void)applyTradeData:(NSArray<NSNumber *> *)data {
  [_host applyTrade:data ?: @[]];
}

- (void)applyTradesData:(NSArray<NSNumber *> *)data {
  [_host applyTrades:data ?: @[]];
}

- (void)addSeriesJson:(NSString *)json {
  [_host addSeriesJson:json ?: @""];
}

- (void)setSeriesData:(NSArray<NSNumber *> *)data
             seriesId:(NSString *)seriesId
             dataType:(NSString *)dataType
              prepend:(BOOL)prepend
               update:(BOOL)update {
  [_host setSeriesData:data ?: @[]
              seriesId:seriesId ?: @""
              dataType:dataType ?: @""
               prepend:prepend
                update:update];
}

- (void)removeSeries:(NSString *)seriesId {
  [_host removeSeries:seriesId ?: @""];
}

- (void)setPaneHeight:(NSString *)paneId weight:(double)weight {
  [_host setPaneHeight:paneId ?: @"" weight:weight];
}

- (void)zoomByScale:(double)scale {
  [_host zoomByScale:scale];
}

- (void)fitChartContent {
  [_host fitContent];
}

- (void)clearChartData {
  [_host clearData];
}

- (NSArray<NSNumber *> *)candleData {
  return [_host candleData];
}

@end
