#import <React/RCTBridgeModule.h>
#import <ReactCommon/RCTTurboModule.h>

#import <TradingChartsViewSpec/TradingChartsViewSpec.h>

#import "TradingChartsRegistry.h"

using namespace facebook::react;

@interface TradingChartsModule : NSObject <NativeTradingChartsSpec>
@end

@implementation TradingChartsModule

RCT_EXPORT_MODULE(TradingCharts)

- (void)setHistory:(NSString *)chartId data:(NSArray<NSNumber *> *)data {
  [[TradingChartsRegistry shared] setHistory:data chartId:chartId];
}

- (void)prependHistory:(NSString *)chartId data:(NSArray<NSNumber *> *)data {
  [[TradingChartsRegistry shared] prependHistory:data chartId:chartId];
}

- (void)updateCandle:(NSString *)chartId candle:(NSArray<NSNumber *> *)candle {
  [[TradingChartsRegistry shared] updateCandle:candle chartId:chartId];
}

- (void)updateTrade:(NSString *)chartId trade:(NSArray<NSNumber *> *)trade {
  [[TradingChartsRegistry shared] updateTrade:trade chartId:chartId];
}

- (void)updateTrades:(NSString *)chartId trades:(NSArray<NSNumber *> *)trades {
  [[TradingChartsRegistry shared] updateTrades:trades chartId:chartId];
}

- (void)addSeries:(NSString *)chartId seriesJson:(NSString *)seriesJson {
  [[TradingChartsRegistry shared] addSeries:seriesJson chartId:chartId];
}

- (void)setSeriesData:(NSString *)chartId
             seriesId:(NSString *)seriesId
             dataType:(NSString *)dataType
                 data:(NSArray<NSNumber *> *)data {
  [[TradingChartsRegistry shared] setSeriesData:data
                                       chartId:chartId
                                      seriesId:seriesId
                                      dataType:dataType
                                       prepend:NO
                                        update:NO];
}

- (void)prependSeriesData:(NSString *)chartId
                 seriesId:(NSString *)seriesId
                 dataType:(NSString *)dataType
                     data:(NSArray<NSNumber *> *)data {
  [[TradingChartsRegistry shared] setSeriesData:data
                                       chartId:chartId
                                      seriesId:seriesId
                                      dataType:dataType
                                       prepend:YES
                                        update:NO];
}

- (void)updateSeriesData:(NSString *)chartId
                seriesId:(NSString *)seriesId
                dataType:(NSString *)dataType
                    data:(NSArray<NSNumber *> *)data {
  [[TradingChartsRegistry shared] setSeriesData:data
                                       chartId:chartId
                                      seriesId:seriesId
                                      dataType:dataType
                                       prepend:NO
                                        update:YES];
}

- (void)removeSeries:(NSString *)chartId seriesId:(NSString *)seriesId {
  [[TradingChartsRegistry shared] removeSeries:seriesId chartId:chartId];
}

- (void)setPaneHeight:(NSString *)chartId
               paneId:(NSString *)paneId
         heightWeight:(double)heightWeight {
  [[TradingChartsRegistry shared] setPaneHeight:paneId
                                         weight:heightWeight
                                        chartId:chartId];
}

- (void)getCandles:(NSString *)chartId
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {
  [[TradingChartsRegistry shared]
      getCandlesForChart:chartId
                 success:^(NSArray<NSNumber *> *candles) {
                   resolve(candles);
                 }
                 failure:^{
                   reject(@"E_CHART_NOT_MOUNTED",
                          [NSString stringWithFormat:
                              @"No mounted chart found for chartId '%@'", chartId],
                          nil);
                 }];
}

- (void)zoom:(NSString *)chartId scale:(double)scale {
  [[TradingChartsRegistry shared] zoomChart:chartId scale:scale];
}

- (void)fitContent:(NSString *)chartId {
  [[TradingChartsRegistry shared] fitContentForChart:chartId];
}

- (void)clear:(NSString *)chartId {
  [[TradingChartsRegistry shared] clearChart:chartId];
}

- (std::shared_ptr<TurboModule>)getTurboModule:(const ObjCTurboModule::InitParams &)params {
  return std::make_shared<NativeTradingChartsSpecJSI>(params);
}

@end
