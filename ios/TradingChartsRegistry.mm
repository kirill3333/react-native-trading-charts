#import "TradingChartsRegistry.h"
#import "TradingChartsView.h"

@interface TCRegistryEntry : NSObject
@property(nonatomic, weak) TradingChartsView *view;
@property(nonatomic, strong) NSMutableArray<NSDictionary *> *pending;
@end

@implementation TCRegistryEntry
- (instancetype)init {
  if (self = [super init]) {
    _pending = [NSMutableArray new];
  }
  return self;
}
@end

@implementation TradingChartsRegistry {
  NSMutableDictionary<NSString *, TCRegistryEntry *> *_entries;
}

+ (instancetype)shared {
  static TradingChartsRegistry *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    registry = [TradingChartsRegistry new];
  });
  return registry;
}

- (instancetype)init {
  if (self = [super init]) {
    _entries = [NSMutableDictionary new];
  }
  return self;
}

- (void)onMain:(dispatch_block_t)block {
  if ([NSThread isMainThread]) block();
  else dispatch_async(dispatch_get_main_queue(), block);
}

- (TCRegistryEntry *)entryFor:(NSString *)chartId create:(BOOL)create {
  TCRegistryEntry *entry = _entries[chartId];
  if (!entry && create) {
    entry = [TCRegistryEntry new];
    _entries[chartId] = entry;
  }
  return entry;
}

- (void)registerView:(TradingChartsView *)view chartId:(NSString *)chartId {
  if (chartId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    if (entry.view && entry.view != view) {
      NSLog(@"[TradingCharts] duplicate chartId '%@'; the newest Fabric view will receive updates", chartId);
    }
    entry.view = view;
    NSArray<NSDictionary *> *commands = [entry.pending copy];
    [entry.pending removeAllObjects];
    for (NSDictionary *command in commands) {
      NSString *type = command[@"type"];
      NSArray<NSNumber *> *data = command[@"data"];
      if ([type isEqualToString:@"history"]) [view applyHistoryData:data];
      else if ([type isEqualToString:@"prependHistory"]) [view prependHistoryData:data];
      else if ([type isEqualToString:@"candle"]) [view applyCandleData:data];
      else if ([type isEqualToString:@"trade"]) [view applyTradeData:data];
      else if ([type isEqualToString:@"trades"]) [view applyTradesData:data];
      else if ([type isEqualToString:@"addSeries"]) [view addSeriesJson:command[@"json"]];
      else if ([type isEqualToString:@"seriesData"]) {
        [view setSeriesData:data
                  seriesId:command[@"seriesId"]
                  dataType:command[@"dataType"]
                   prepend:[command[@"prepend"] boolValue]
                    update:[command[@"update"] boolValue]];
      } else if ([type isEqualToString:@"removeSeries"]) {
        [view removeSeries:command[@"seriesId"]];
      } else if ([type isEqualToString:@"paneHeight"]) {
        [view setPaneHeight:command[@"paneId"] weight:[command[@"weight"] doubleValue]];
      }
      else if ([type isEqualToString:@"zoom"]) [view zoomByScale:[command[@"scale"] doubleValue]];
      else if ([type isEqualToString:@"fitContent"]) [view fitChartContent];
    }
  }];
}

- (void)unregisterView:(TradingChartsView *)view chartId:(NSString *)chartId {
  if (chartId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:NO];
    if (entry.view == view) entry.view = nil;
    if (!entry.view && entry.pending.count == 0) [self->_entries removeObjectForKey:chartId];
  }];
}

- (void)enqueue:(NSString *)type data:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId {
  if (chartId.length == 0) return;
  NSArray<NSNumber *> *copy = [data copy];
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    TradingChartsView *view = entry.view;
    if (view) {
      if ([type isEqualToString:@"history"]) [view applyHistoryData:copy];
      else if ([type isEqualToString:@"prependHistory"]) [view prependHistoryData:copy];
      else if ([type isEqualToString:@"candle"]) [view applyCandleData:copy];
      else if ([type isEqualToString:@"trade"]) [view applyTradeData:copy];
      else if ([type isEqualToString:@"trades"]) [view applyTradesData:copy];
      return;
    }
    if ([type isEqualToString:@"history"]) {
      NSIndexSet *indexes = [entry.pending indexesOfObjectsPassingTest:
          ^BOOL(NSDictionary *command, NSUInteger index, BOOL *stop) {
            NSString *pendingType = command[@"type"];
            return [pendingType isEqualToString:@"history"] ||
                [pendingType isEqualToString:@"prependHistory"] ||
                [pendingType isEqualToString:@"candle"] ||
                [pendingType isEqualToString:@"trade"] ||
                [pendingType isEqualToString:@"trades"];
          }];
      [entry.pending removeObjectsAtIndexes:indexes];
    }
    [entry.pending addObject:@{ @"type": type, @"data": copy }];
  }];
}

- (void)setHistory:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId {
  [self enqueue:@"history" data:data chartId:chartId];
}
- (void)prependHistory:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId {
  [self enqueue:@"prependHistory" data:data chartId:chartId];
}
- (void)updateCandle:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId {
  [self enqueue:@"candle" data:data chartId:chartId];
}
- (void)updateTrade:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId {
  [self enqueue:@"trade" data:data chartId:chartId];
}
- (void)updateTrades:(NSArray<NSNumber *> *)data chartId:(NSString *)chartId {
  [self enqueue:@"trades" data:data chartId:chartId];
}

- (void)addSeries:(NSString *)seriesJson chartId:(NSString *)chartId {
  if (chartId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    if (entry.view) {
      [entry.view addSeriesJson:seriesJson];
    } else {
      [entry.pending addObject:@{ @"type": @"addSeries", @"json": seriesJson ?: @"" }];
    }
  }];
}

- (void)setSeriesData:(NSArray<NSNumber *> *)data
               chartId:(NSString *)chartId
               seriesId:(NSString *)seriesId
               dataType:(NSString *)dataType
                prepend:(BOOL)prepend
                 update:(BOOL)update {
  if (chartId.length == 0 || seriesId.length == 0) return;
  NSArray<NSNumber *> *copy = [data copy];
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    if (entry.view) {
      [entry.view setSeriesData:copy
                      seriesId:seriesId
                      dataType:dataType
                       prepend:prepend
                        update:update];
      return;
    }
    if (!prepend && !update) {
      NSIndexSet *indexes = [entry.pending indexesOfObjectsPassingTest:
          ^BOOL(NSDictionary *command, NSUInteger index, BOOL *stop) {
            return [command[@"type"] isEqualToString:@"seriesData"] &&
                [command[@"seriesId"] isEqualToString:seriesId];
          }];
      [entry.pending removeObjectsAtIndexes:indexes];
    }
    [entry.pending addObject:@{
      @"type": @"seriesData",
      @"data": copy,
      @"seriesId": seriesId,
      @"dataType": dataType ?: @"",
      @"prepend": @(prepend),
      @"update": @(update),
    }];
  }];
}

- (void)removeSeries:(NSString *)seriesId chartId:(NSString *)chartId {
  if (chartId.length == 0 || seriesId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    if (entry.view) [entry.view removeSeries:seriesId];
    else [entry.pending addObject:@{ @"type": @"removeSeries", @"seriesId": seriesId }];
  }];
}

- (void)setPaneHeight:(NSString *)paneId
               weight:(double)weight
              chartId:(NSString *)chartId {
  if (chartId.length == 0 || paneId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    if (entry.view) [entry.view setPaneHeight:paneId weight:weight];
    else [entry.pending addObject:@{
      @"type": @"paneHeight",
      @"paneId": paneId,
      @"weight": @(weight),
    }];
  }];
}

- (void)getCandlesForChart:(NSString *)chartId
                   success:(void (^)(NSArray<NSNumber *> *candles))success
                   failure:(void (^)(void))failure {
  [self onMain:^{
    TradingChartsView *view = [self entryFor:chartId create:NO].view;
    if (view) success([view candleData]);
    else failure();
  }];
}

- (void)zoomChart:(NSString *)chartId scale:(double)scale {
  if (chartId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    TradingChartsView *view = entry.view;
    if (view) {
      [view zoomByScale:scale];
    } else {
      [entry.pending addObject:@{ @"type": @"zoom", @"scale": @(scale) }];
    }
  }];
}

- (void)fitContentForChart:(NSString *)chartId {
  if (chartId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:YES];
    TradingChartsView *view = entry.view;
    if (view) {
      [view fitChartContent];
    } else {
      [entry.pending addObject:@{ @"type": @"fitContent" }];
    }
  }];
}

- (void)clearChart:(NSString *)chartId {
  if (chartId.length == 0) return;
  [self onMain:^{
    TCRegistryEntry *entry = [self entryFor:chartId create:NO];
    NSIndexSet *indexes = [entry.pending indexesOfObjectsPassingTest:
        ^BOOL(NSDictionary *command, NSUInteger index, BOOL *stop) {
          NSString *type = command[@"type"];
          return [type isEqualToString:@"history"] ||
              [type isEqualToString:@"prependHistory"] ||
              [type isEqualToString:@"candle"] ||
              [type isEqualToString:@"trade"] ||
              [type isEqualToString:@"trades"] ||
              [type isEqualToString:@"seriesData"];
        }];
    [entry.pending removeObjectsAtIndexes:indexes];
    [entry.view clearChartData];
    if (!entry.view && entry.pending.count == 0) {
      [self->_entries removeObjectForKey:chartId];
    }
  }];
}

@end
