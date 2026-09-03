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
- (void)addSeriesJson:(NSString *)json;
- (void)setSeriesData:(NSArray<NSNumber *> *)data
             seriesId:(NSString *)seriesId
             dataType:(NSString *)dataType
              prepend:(BOOL)prepend
               update:(BOOL)update;
- (void)removeSeries:(NSString *)seriesId;
- (void)setPaneHeight:(NSString *)paneId weight:(double)weight;
- (void)zoomByScale:(double)scale;
- (void)scrollChartToRealTime;
- (void)fitChartContent;
- (void)clearChartData;
- (NSArray<NSNumber *> *)candleData;
@end

NS_ASSUME_NONNULL_END

#endif /* TradingChartsViewNativeComponent_h */
