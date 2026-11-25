#import <React/RCTViewManager.h>
#import <React/UIView+React.h>
#import <UIKit/UIKit.h>

// UIKit owns the lens, refraction, press/drag gestures and accessibility. The
// React pager continues to own screen content; these transparent controllers
// provide only the system tab bar, never duplicate the app's screens.
@interface SkillomateNativeTabBarView : UIView <UITabBarControllerDelegate>
@property(nonatomic, strong) UITabBarController *tabs;
@property(nonatomic, copy) NSDictionary *selection;
@property(nonatomic, copy) RCTDirectEventBlock onTabPress;
@property(nonatomic, assign) BOOL dark;
@property(nonatomic, assign) BOOL barHidden;
@end

@implementation SkillomateNativeTabBarView

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    self.backgroundColor = UIColor.clearColor;
    self.clipsToBounds = NO;
    _tabs = [UITabBarController new];
    _tabs.delegate = self;
    if (@available(iOS 18.0, *)) _tabs.mode = UITabBarControllerModeTabBar;
    if (@available(iOS 26.0, *)) _tabs.tabBarMinimizeBehavior = UITabBarMinimizeBehaviorNever;

    NSArray *titles = @[@"Home", @"Courses", @"Search", @"Nex AI", @"Downloads"];
    NSArray *symbols = @[@"house.fill", @"safari.fill", @"magnifyingglass", @"sparkles", @"arrow.down.to.line"];
    NSMutableArray *controllers = [NSMutableArray new];
    for (NSUInteger index = 0; index < titles.count; index++) {
      UIViewController *page = [UIViewController new];
      page.view.backgroundColor = UIColor.clearColor;
      UIImage *symbol = [UIImage systemImageNamed:symbols[index]];
      page.tabBarItem = [[UITabBarItem alloc] initWithTitle:titles[index] image:symbol tag:index];
      page.tabBarItem.accessibilityIdentifier = [@"skillomate.tab." stringByAppendingString:titles[index]];
      [controllers addObject:page];
    }
    _tabs.viewControllers = controllers;
    _tabs.customizableViewControllers = @[];
    _tabs.view.backgroundColor = UIColor.clearColor;
    _tabs.view.clipsToBounds = NO;
    UIColor *skillomateGold = [UIColor colorWithRed:231.0 / 255.0
                                               green:188.0 / 255.0
                                                blue:104.0 / 255.0
                                               alpha:1.0];
    UIColor *warmIvory = [UIColor colorWithRed:247.0 / 255.0
                                          green:245.0 / 255.0
                                           blue:240.0 / 255.0
                                          alpha:0.90];
    _tabs.tabBar.tintColor = skillomateGold;
    _tabs.tabBar.unselectedItemTintColor = warmIvory;
    [self addSubview:_tabs.view];
  }
  return self;
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (self.window) {
    [self reactAddControllerToClosestParent:_tabs];
    [self setNeedsLayout];
  } else if (_tabs.parentViewController) {
    [_tabs willMoveToParentViewController:nil];
    [_tabs removeFromParentViewController];
  }
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _tabs.view.frame = self.bounds;
}

- (void)setSelection:(NSDictionary *)selection {
  _selection = [selection copy];
  NSInteger index = [selection[@"index"] integerValue];
  // Search opens the existing search field and is never a destination page.
  if (index >= 0 && index < 5 && index != 2 && _tabs.selectedIndex != index) {
    _tabs.selectedIndex = index;
  }
}

- (void)setDark:(BOOL)dark {
  _dark = dark;
  _tabs.overrideUserInterfaceStyle = dark ? UIUserInterfaceStyleDark : UIUserInterfaceStyleLight;
}

- (void)setBarHidden:(BOOL)barHidden {
  _barHidden = barHidden;
  // Keep this controller alive while Search is open so UIKit keeps one lens
  // and one set of internal gesture recognizers across repeated searches.
  _tabs.view.hidden = barHidden;
}

- (UIView *)hitTest:(CGPoint)point withEvent:(UIEvent *)event {
  if (_barHidden || self.hidden || self.alpha < 0.01 || !self.userInteractionEnabled) return nil;
  UITabBar *bar = _tabs.tabBar;
  CGPoint location = [bar convertPoint:point fromView:self];
  if (![bar pointInside:location withEvent:event]) return nil;
  // The transparent controller content must not swallow page/back swipes.
  return [bar hitTest:location withEvent:event];
}

- (BOOL)tabBarController:(UITabBarController *)tabBarController shouldSelectViewController:(UIViewController *)viewController {
  if (viewController.tabBarItem.tag == 2) {
    if (_onTabPress) _onTabPress(@{@"index": @2});
    return NO;
  }
  return YES;
}

- (void)tabBarController:(UITabBarController *)tabBarController didSelectViewController:(UIViewController *)viewController {
  if (_onTabPress) _onTabPress(@{@"index": @(viewController.tabBarItem.tag)});
}

@end

@interface SkillomateNativeTabBarManager : RCTViewManager
@end

@implementation SkillomateNativeTabBarManager
RCT_EXPORT_MODULE(SkillomateNativeTabBar)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView *)view { return [SkillomateNativeTabBarView new]; }
RCT_EXPORT_VIEW_PROPERTY(selection, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(dark, BOOL)
RCT_EXPORT_VIEW_PROPERTY(barHidden, BOOL)
RCT_EXPORT_VIEW_PROPERTY(onTabPress, RCTDirectEventBlock)
@end
