internal import Expo
import Foundation
import Network
import React
import ReactAppDependencyProvider

@objc(OfflineMediaServer)
final class OfflineMediaServer: NSObject {
  private static let queue = DispatchQueue(label: "com.skillomate.offline-media")
  private static var listener: NWListener?
  private static var directoryURL: URL?
  private static var manifestURL: URL?
  private static var accessToken = ""
  private static var playbackURL = ""

  @objc(start:resolver:rejecter:)
  func start(
    _ manifestPath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      guard let url = URL(string: manifestPath), url.isFileURL else {
        reject("OFFLINE_PATH_INVALID", "Offline playlist path is invalid.", nil)
        return
      }
      let manifest = url.standardizedFileURL
      let directory = manifest.deletingLastPathComponent().standardizedFileURL
      guard Self.isAllowedCacheDirectory(directory),
            FileManager.default.fileExists(atPath: manifest.path) else {
        reject("OFFLINE_PATH_DENIED", "Offline playlist is unavailable.", nil)
        return
      }
      if Self.manifestURL == manifest, !Self.playbackURL.isEmpty {
        resolve(Self.playbackURL)
        return
      }

      Self.listener?.cancel()
      Self.listener = nil
      Self.directoryURL = directory
      Self.manifestURL = manifest
      Self.accessToken = UUID().uuidString.replacingOccurrences(of: "-", with: "")
      Self.playbackURL = ""

      do {
        let listener = try NWListener(using: .tcp, on: .any)
        Self.listener = listener
        listener.newConnectionHandler = { connection in
          Self.handle(connection)
        }
        listener.stateUpdateHandler = { state in
          switch state {
          case .ready:
            guard let port = listener.port else {
              reject("OFFLINE_SERVER_PORT", "Offline playback server has no port.", nil)
              return
            }
            Self.playbackURL = "http://127.0.0.1:\(port.rawValue)/\(Self.accessToken)/\(manifest.lastPathComponent)"
            resolve(Self.playbackURL)
          case .failed(let error):
            Self.listener = nil
            Self.playbackURL = ""
            reject("OFFLINE_SERVER_FAILED", "Offline playback server failed to start.", error)
          default:
            break
          }
        }
        listener.start(queue: Self.queue)
      } catch {
        reject("OFFLINE_SERVER_FAILED", "Offline playback server failed to start.", error)
      }
    }
  }

  private static func isAllowedCacheDirectory(_ directory: URL) -> Bool {
    guard let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.standardizedFileURL else {
      return false
    }
    let cachePath = cache.path.hasSuffix("/") ? cache.path : cache.path + "/"
    return directory.path.hasPrefix(cachePath + "skillomate_dl/")
  }

  private static func handle(_ connection: NWConnection) {
    connection.start(queue: queue)
    receiveRequest(connection, accumulated: Data())
  }

  private static func receiveRequest(_ connection: NWConnection, accumulated: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { data, _, isComplete, error in
      var requestData = accumulated
      if let data { requestData.append(data) }
      if requestData.range(of: Data("\r\n\r\n".utf8)) != nil || isComplete || error != nil {
        respond(connection, requestData: requestData)
        return
      }
      receiveRequest(connection, accumulated: requestData)
    }
  }

  private static func respond(_ connection: NWConnection, requestData: Data) {
    guard let request = String(data: requestData, encoding: .utf8),
          let requestLine = request.components(separatedBy: "\r\n").first else {
      send(connection, status: "400 Bad Request", headers: [:], body: Data())
      return
    }
    let requestParts = requestLine.split(separator: " ")
    guard requestParts.count >= 2 else {
      send(connection, status: "400 Bad Request", headers: [:], body: Data())
      return
    }
    let method = String(requestParts[0]).uppercased()
    guard method == "GET" || method == "HEAD" else {
      send(connection, status: "405 Method Not Allowed", headers: ["Allow": "GET, HEAD"], body: Data())
      return
    }
    let rawPath = String(requestParts[1]).split(separator: "?", maxSplits: 1).first.map(String.init) ?? ""
    let prefix = "/\(accessToken)/"
    guard rawPath.hasPrefix(prefix),
          let filename = String(rawPath.dropFirst(prefix.count)).removingPercentEncoding,
          !filename.isEmpty,
          !filename.contains("/"),
          !filename.contains("\\"),
          filename != ".",
          filename != "..",
          let directoryURL else {
      send(connection, status: "404 Not Found", headers: [:], body: Data())
      return
    }
    let fileURL = directoryURL.appendingPathComponent(filename, isDirectory: false).standardizedFileURL
    guard fileURL.deletingLastPathComponent() == directoryURL,
          let fileData = try? Data(contentsOf: fileURL, options: .mappedIfSafe) else {
      send(connection, status: "404 Not Found", headers: [:], body: Data())
      return
    }

    let total = fileData.count
    var lower = 0
    var upper = max(0, total - 1)
    var status = "200 OK"
    var headers = [
      "Accept-Ranges": "bytes",
      "Content-Type": mimeType(for: fileURL.pathExtension),
      "Cache-Control": "no-store",
    ]
    if total > 0, let rangeLine = request.components(separatedBy: "\r\n").first(where: { $0.lowercased().hasPrefix("range:") }) {
      let value = rangeLine.dropFirst(rangeLine.firstIndex(of: ":").map { rangeLine.distance(from: rangeLine.startIndex, to: $0) + 1 } ?? 0).trimmingCharacters(in: .whitespaces)
      if value.lowercased().hasPrefix("bytes=") {
        let bounds = value.dropFirst(6).split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        if let first = bounds.first, let parsed = Int(first), parsed >= 0, parsed < total { lower = parsed }
        if bounds.count > 1, let parsed = Int(bounds[1]), parsed >= lower { upper = min(parsed, total - 1) }
        if lower <= upper {
          status = "206 Partial Content"
          headers["Content-Range"] = "bytes \(lower)-\(upper)/\(total)"
        }
      }
    }
    let body = total > 0 && lower <= upper ? fileData.subdata(in: lower..<(upper + 1)) : Data()
    send(connection, status: status, headers: headers, body: method == "HEAD" ? Data() : body, declaredLength: body.count)
  }

  private static func mimeType(for fileExtension: String) -> String {
    switch fileExtension.lowercased() {
    case "m3u8": return "application/vnd.apple.mpegurl"
    case "ts": return "video/mp2t"
    case "mp4", "m4s", "m4v", "mov": return "video/mp4"
    case "aac": return "audio/aac"
    case "vtt": return "text/vtt"
    default: return "application/octet-stream"
    }
  }

  private static func send(
    _ connection: NWConnection,
    status: String,
    headers: [String: String],
    body: Data,
    declaredLength: Int? = nil
  ) {
    var responseHeaders = headers
    responseHeaders["Content-Length"] = String(declaredLength ?? body.count)
    responseHeaders["Connection"] = "close"
    let fields = responseHeaders.map { "\($0.key): \($0.value)" }.joined(separator: "\r\n")
    var response = Data("HTTP/1.1 \(status)\r\n\(fields)\r\n\r\n".utf8)
    response.append(body)
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }
}

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
      || RCTLinkingManager.application(app, open: url, options: options)
  }

  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let handledByReactNative = RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    return super.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    ) || handledByReactNative
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings()
      .jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
