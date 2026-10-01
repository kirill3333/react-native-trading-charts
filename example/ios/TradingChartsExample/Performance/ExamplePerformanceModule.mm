#import <ExamplePerformanceSpec/ExamplePerformanceSpec.h>
#import <React/RCTInvalidating.h>
#import <React/RCTInitializing.h>
#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import "TradingCharts-Swift.h"
#import <ReactCommon/RCTTurboModule.h>

#import "TradingChartsExample-Swift.h"

@interface ExamplePresentationSource : NSObject <PerformancePresentationSource>
@end

@implementation ExamplePresentationSource
- (NSString *)observe:(NSString *)chartId
                frame:(void (^)(double))frame
           connection:(void (^)(BOOL))connection {
  return [TCChartPresentationDiagnostics.shared observe:chartId frame:frame connection:connection];
}
- (void)removeObserver:(NSString *)token {
  [TCChartPresentationDiagnostics.shared removeObserver:token];
}
@end

@interface ExamplePerformanceModule : NativeExamplePerformanceSpecBase <NativeExamplePerformanceSpec, RCTInvalidating, RCTInitializing>
@end

@implementation ExamplePerformanceModule {
  ExamplePerformanceService *_service;
}

RCT_EXPORT_MODULE(ExamplePerformance)

+ (BOOL)requiresMainQueueSetup { return YES; }

- (void)initialize {
  __weak ExamplePerformanceModule *weakSelf = self;
  _service = [[ExamplePerformanceService alloc]
      initWithPresentationSource:[ExamplePresentationSource new]
                            emit:^(NSDictionary *sample) {
                              [weakSelf emitOnSample:sample];
                            }];
}

- (void)dealloc { [_service invalidate]; }

- (void)getThreads:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_service getThreads:^(NSArray<NSDictionary *> *threads) {
    if (threads != nil) {
      resolve(threads);
    } else {
      reject(@"E_THREADS_UNAVAILABLE", @"Could not enumerate application threads", nil);
    }
  }];
}

- (void)start:(NSString *)subscriptionId
      chartId:(NSString *)chartId
  threadNames:(NSArray<NSString *> *)threadNames
includeMainThread:(BOOL)includeMainThread
   intervalMs:(double)intervalMs {
  [_service start:subscriptionId chartId:chartId names:threadNames
      includeMain:includeMainThread intervalMs:intervalMs];
}

- (void)stop:(NSString *)subscriptionId { [_service stop:subscriptionId]; }

- (void)acknowledge:(NSString *)subscriptionId sequence:(double)sequence {
  [_service acknowledge:subscriptionId sequence:sequence];
}

- (void)invalidate { [_service invalidate]; }

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeExamplePerformanceSpecJSI>(params);
}

@end
