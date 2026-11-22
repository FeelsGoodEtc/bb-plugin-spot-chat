import AppKit
import WebKit

final class SpotChatApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    private static let windowSizeKey = "SpotChatWindowSize"
    private static let defaultTitle = "Spot Chat"
    /// The page posts the open conversation's title here.
    private static let titleMessage = "spotChatTitle"
    private let url: URL
    private var window: NSWindow?
    private var fullScreenTransition = false

    /// The opening BB window in Cocoa screen coordinates, if BB passed one.
    private let anchorFrame: NSRect?

    init(url: URL, anchorFrame: NSRect?) {
        self.url = url
        self.anchorFrame = anchorFrame
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Place the window inside the BB window that opened it, below BB's
        // 48-point title row with a 12-point gap, at its right edge. Without
        // that frame, fall back to the display beneath the mouse pointer.
        let topInset: CGFloat = 60
        let pointer = NSEvent.mouseLocation
        let anchor = anchorFrame
        let screen = anchor.flatMap { frame in NSScreen.screens.first { $0.frame.contains(NSPoint(x: frame.midX, y: frame.midY)) } }
            ?? NSScreen.screens.first { $0.frame.contains(pointer) } ?? NSScreen.main
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var area = visible
        var edgeGap: CGFloat = 0
        if let anchor {
            let clipped = anchor.intersection(visible)
            if clipped.width >= 360, clipped.height >= 360 {
                area = clipped
                edgeGap = 12
            }
        }
        let inset = min(topInset, max(0, area.height - 240))
        let usableHeight = area.height - inset - edgeGap
        let defaultWidth = floor(area.width / 3)
        let minimumSize = NSSize(width: min(defaultWidth, 320), height: min(usableHeight, 240))
        let savedSize = UserDefaults.standard.array(forKey: Self.windowSizeKey) as? [Double]
        let requestedSize: NSSize
        if let savedSize, savedSize.count == 2, savedSize.allSatisfy({ $0.isFinite && $0 > 0 }) {
            requestedSize = NSSize(width: savedSize[0], height: savedSize[1])
        } else {
            requestedSize = NSSize(width: defaultWidth, height: usableHeight)
        }
        let width = min(area.width - edgeGap, max(minimumSize.width, requestedSize.width))
        let height = min(usableHeight, max(minimumSize.height, requestedSize.height))
        let frame = NSRect(x: area.maxX - edgeGap - width, y: area.maxY - inset - height, width: width, height: height)
        let window = NSWindow(
            contentRect: .zero,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = Self.defaultTitle
        window.minSize = minimumSize
        window.setFrame(frame, display: false)
        window.collectionBehavior = [.fullScreenPrimary]

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: Self.titleMessage)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        window.contentView = webView
        self.window = window
        webView.load(URLRequest(url: url))
        window.makeKeyAndOrderFront(nil)
        window.delegate = self
        NSApp.activate(ignoringOtherApps: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.titleMessage else { return }
        let text = (message.body as? String)?
            .components(separatedBy: .newlines).joined(separator: " ")
            .trimmingCharacters(in: .whitespaces) ?? ""
        window?.title = text.isEmpty ? Self.defaultTitle : String(text.prefix(200))
    }

    func windowDidResize(_ notification: Notification) {
        if window?.inLiveResize == false {
            rememberWindowSize()
        }
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        rememberWindowSize()
    }

    func windowWillEnterFullScreen(_ notification: Notification) { fullScreenTransition = true }
    func windowWillExitFullScreen(_ notification: Notification) { fullScreenTransition = true }
    func windowDidEnterFullScreen(_ notification: Notification) { fullScreenTransition = false }
    func windowDidExitFullScreen(_ notification: Notification) { fullScreenTransition = false }

    private func rememberWindowSize() {
        guard let window, !fullScreenTransition, !window.styleMask.contains(.fullScreen) else { return }
        let size = window.frame.size
        UserDefaults.standard.set([Double(size.width), Double(size.height)], forKey: Self.windowSizeKey)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let target = navigationAction.request.url,
              target.scheme == url.scheme, target.host == url.host, target.port == url.port,
              navigationAction.targetFrame != nil else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        let label = NSTextField(wrappingLabelWithString: "Could not connect to the local BB server. Open Spot Chat again from BB.")
        label.alignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        let view = NSView()
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        window?.contentView = view
    }
}

guard (2...3).contains(CommandLine.arguments.count),
      let url = URL(string: CommandLine.arguments[1]),
      url.scheme == "http", url.host == "127.0.0.1", url.port != nil,
      url.path == "/plugins/spot-chat/window" else {
    exit(1)
}

/// Optional third argument: the BB window as "x,y,width,height" in points,
/// measured from the top-left corner of the primary display.
func parseAnchor(_ text: String) -> NSRect? {
    let values = text.split(separator: ",").compactMap { Double($0) }
    guard values.count == 4, values.allSatisfy({ $0.isFinite }), values[2] > 0, values[3] > 0,
          let primary = NSScreen.screens.first else { return nil }
    return NSRect(x: values[0], y: primary.frame.maxY - values[1] - values[3], width: values[2], height: values[3])
}

let app = NSApplication.shared
let anchorFrame = CommandLine.arguments.count == 3 ? parseAnchor(CommandLine.arguments[2]) : nil
let delegate = SpotChatApp(url: url, anchorFrame: anchorFrame)
app.setActivationPolicy(.regular)
app.delegate = delegate

let menu = NSMenu()
let spotChatItem = NSMenuItem()
let spotChatMenu = NSMenu(title: "Spot Chat")
spotChatMenu.addItem(withTitle: "Quit Spot Chat", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
spotChatItem.submenu = spotChatMenu
menu.addItem(spotChatItem)

let editItem = NSMenuItem()
let editMenu = NSMenu(title: "Edit")
editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
editMenu.addItem(.separator())
editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
editItem.submenu = editMenu
menu.addItem(editItem)

let windowItem = NSMenuItem()
let windowMenu = NSMenu(title: "Window")
windowMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
windowItem.submenu = windowMenu
menu.addItem(windowItem)
app.mainMenu = menu
app.windowsMenu = windowMenu

app.run()
