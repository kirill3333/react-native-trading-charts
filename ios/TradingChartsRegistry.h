#import <Foundation/Foundation.h>

@class TradingChartsView;

NS_ASSUME_NONNULL_BEGIN

@interface TradingChartsRegistry : NSObject
+ (instancetype)shared;
- (void)registerView:(TradingChartsView *)view chartId:(NSString *)chartId;
- (void)unregisterView:(TradingChartsView *)view chartId:(NSString *)chartId;
- (void)setHistory:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId;
- (void)updateCandle:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId;
- (void)updateTrade:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId;
- (void)updateTrades:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId;
- (void)clearChart:(NSString *)chartId;
@end

NS_ASSUME_NONNULL_END
