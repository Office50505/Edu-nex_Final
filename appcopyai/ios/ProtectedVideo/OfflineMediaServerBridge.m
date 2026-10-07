#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(OfflineMediaServer, NSObject)

RCT_EXTERN_METHOD(start:(NSString *)manifestPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
