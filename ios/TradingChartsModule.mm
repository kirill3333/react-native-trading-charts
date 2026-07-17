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

- (void)updateCandle:(NSString *)chartId candle:(NSArray<NSNumber *> *)candle {
  [[TradingChartsRegistry shared] updateCandle:candle chartId:chartId];
}

- (void)updateTrade:(NSString *)chartId trade:(NSArray<NSNumber *> *)trade {
  [[TradingChartsRegistry shared] updateTrade:trade chartId:chartId];
}

- (void)updateTrades:(NSString *)chartId trades:(NSArray<NSNumber *> *)trades {
  [[TradingChartsRegistry shared] updateTrades:trades chartId:chartId];
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
