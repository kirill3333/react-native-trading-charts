#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

#ifndef TradingChartsViewNativeComponent_h
#define TradingChartsViewNativeComponent_h

NS_ASSUME_NONNULL_BEGIN

@interface TradingChartsView : RCTViewComponentView
- (void)applyHistoryData:(NSArray<NSNumber *> *)data;
- (void)prependHistoryData:(NSArray<NSNumber *> *)data;
- (void)applyCandleData:(NSArray<NSNumber *> *)data;
- (void)applyTradeData:(NSArray<NSNumber *> *)data;
- (void)applyTradesData:(NSArray<NSNumber *> *)data;
- (void)zoomByScale:(double)scale;
- (void)fitChartContent;
- (void)clearChartData;
@end

NS_ASSUME_NONNULL_END

#endif /* TradingChartsViewNativeComponent_h */
