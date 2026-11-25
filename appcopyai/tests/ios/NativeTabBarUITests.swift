import XCTest

// Device integration test: runs against the installed signed iOS 26+ app.
final class NativeTabBarUITests: XCTestCase {
  func testLessonPlayerOpensAndStaysForeground() {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "com.alihussainkhan.edunexfinal")
    app.launch()
    let startLearning = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH[c] 'Start learning'")
    ).firstMatch
    if startLearning.waitForExistence(timeout: 8) {
      startLearning.tap()
    } else {
      let coursesTab = app.tabBars.firstMatch.buttons["Courses"]
      XCTAssertTrue(coursesTab.waitForExistence(timeout: 12))
      coursesTab.tap()
      let firstCourse = app.buttons.matching(
        NSPredicate(format: "label CONTAINS[c] 'lesson' AND label CONTAINS[c] 'complete'")
      ).firstMatch
      XCTAssertTrue(firstCourse.waitForExistence(timeout: 15))
      firstCourse.tap()
    }

    let firstLesson = app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH[c] 'Play lesson 1:'")
    ).firstMatch
    XCTAssertTrue(firstLesson.waitForExistence(timeout: 15))
    firstLesson.tap()
    XCTAssertTrue(app.buttons["Back"].waitForExistence(timeout: 15))
    XCTAssertEqual(app.state, .runningForeground)
  }

  func testNestedCourseRoutesSupportLeadingEdgeBackSwipe() {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "com.alihussainkhan.edunexfinal")
    app.launch()
    let coursesTab = app.tabBars.firstMatch.buttons["Courses"]
    XCTAssertTrue(coursesTab.waitForExistence(timeout: 12))
    coursesTab.tap()

    let courseSearch = app.textFields["Search courses"]
    XCTAssertTrue(courseSearch.waitForExistence(timeout: 12))
    XCTAssertTrue(courseSearch.isHittable, "The course search must be visibly below the iPhone safe area")
    XCTAssertGreaterThan(courseSearch.frame.minY, 50, "The course catalogue must start below the iPhone status/notch area")

    let firstCourse = app.buttons.matching(
      NSPredicate(format: "label CONTAINS[c] 'lesson' AND label CONTAINS[c] 'complete'")
    ).firstMatch
    XCTAssertTrue(firstCourse.waitForExistence(timeout: 15))
    XCTAssertTrue(firstCourse.isHittable, "The first course card must be visible, not hidden behind the header")
    firstCourse.tap()

    let backToCourses = app.buttons["Back to courses"]
    XCTAssertTrue(backToCourses.waitForExistence(timeout: 12))
    XCTAssertGreaterThan(backToCourses.frame.minY, 50, "Course header must stay below the iPhone status/notch area")

    let leadingEdge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.52))
    let previewHold = app.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.52))
    let trailingSide = app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.52))
    leadingEdge.press(
      forDuration: 0.08,
      thenDragTo: previewHold,
      withVelocity: XCUIGestureVelocity(rawValue: 80),
      thenHoldForDuration: 1.2
    )
    XCTAssertTrue(backToCourses.waitForExistence(timeout: 5), "A partial edge swipe must settle back to the course")
    leadingEdge.press(forDuration: 0.08, thenDragTo: trailingSide)
    XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 8))
    XCTAssertTrue(backToCourses.waitForNonExistence(timeout: 8))
    XCTAssertTrue(firstCourse.waitForExistence(timeout: 8))
    XCTAssertTrue(firstCourse.isHittable, "The real course catalogue must be restored after the back swipe")
  }

  func testNativeTabSelectionDragSearchAndPageSwipe() {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier: "com.alihussainkhan.edunexfinal")
    app.launch()
    let bar = app.tabBars.firstMatch
    XCTAssertTrue(bar.waitForExistence(timeout: 20), "The UIKit tab bar must be mounted")
    func tab(_ title: String) -> XCUIElement {
      bar.buttons.matching(NSPredicate(format: "label == %@", title)).firstMatch
    }
    func assertSelected(_ title: String) {
      let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: tab(title))
      XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed, title)
    }
    for title in ["Home", "Courses", "Nex AI", "Downloads", "Home"] {
      tab(title).tap()
      assertSelected(title)
    }
    tab("Home").press(forDuration: 0.5, thenDragTo: tab("Downloads"))
    assertSelected("Downloads")
    tab("Downloads").press(forDuration: 0.5, thenDragTo: tab("Home"))
    assertSelected("Home")

    for _ in 0..<3 {
      tab("Search").tap()
      XCTAssertTrue(app.textFields["Search this page"].waitForExistence(timeout: 5))
      app.buttons["Close search"].firstMatch.tap()
      XCTAssertTrue(bar.waitForExistence(timeout: 5))
      assertSelected("Home")
    }

    // Keep the adjacent Home page mounted and visible while a Courses -> Home
    // swipe is held below the commit threshold.
    tab("Courses").tap()
    assertSelected("Courses")
    let rootLeadingEdge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.55))
    let rootPreviewHold = app.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.55))
    rootLeadingEdge.press(
      forDuration: 0.08,
      thenDragTo: rootPreviewHold,
      withVelocity: XCUIGestureVelocity(rawValue: 80),
      thenHoldForDuration: 1.2
    )
    assertSelected("Courses")
    tab("Home").tap()
    assertSelected("Home")

    // The transparent host must let page swipes through; native selection
    // must follow the React pager when navigation starts outside the tab bar.
    let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.55))
    let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.55))
    start.press(forDuration: 0.05, thenDragTo: end)
    assertSelected("Courses")
    end.press(forDuration: 0.05, thenDragTo: start)
    assertSelected("Home")

    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Native iPhone tab bar after interactions"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    XCTAssertEqual(app.state, .runningForeground)
  }
}
