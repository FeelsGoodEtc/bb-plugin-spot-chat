import AppKit
import WebKit

final class SpotChatApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    private static let windowSizeKey = "SpotChatWindowSize"
    private let url: URL
    private var window: NSWindow?
    private var fullScreenTransition = false

    init(url: URL) {
        self.url = url
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let pointer = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(pointer) } ?? NSScreen.main
        let available = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        // Leave room for BB's 48-point title row and a 12-point gap below it.
        let topInset = min(60, max(0, available.height - 240))
        let usableHeight = available.height - topInset
        let defaultWidth = floor(available.width / 3)
        let minimumSize = NSSize(width: min(defaultWidth, 320), height: min(usableHeight, 240))
        let savedSize = UserDefaults.standard.array(forKey: Self.windowSizeKey) as? [Double]
        let requestedSize: NSSize
        if let savedSize, savedSize.count == 2, savedSize.allSatisfy({ $0.isFinite && $0 > 0 }) {
            requestedSize = NSSize(width: savedSize[0], height: savedSize[1])
        } else {
            requestedSize = NSSize(width: defaultWidth, height: usableHeight)
        }
        let width = min(available.width, max(minimumSize.width, requestedSize.width))
        let height = min(usableHeight, max(minimumSize.height, requestedSize.height))
        let frame = NSRect(x: available.maxX - width, y: available.maxY - topInset - height, width: width, height: height)
        let window = NSWindow(
            contentRect: .zero,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Spot Chat"
        window.minSize = minimumSize
        window.setFrame(frame, display: false)
        window.collectionBehavior = [.fullScreenPrimary]

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        window.contentView = webView
        self.window = window
        webView.load(URLRequest(url: url))
        window.makeKeyAndOrderFront(nil)
        window.delegate = self
        NSApp.activate(ignoringOtherApps: true)
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

guard CommandLine.arguments.count == 2,
      let url = URL(string: CommandLine.arguments[1]),
      url.scheme == "http", url.host == "127.0.0.1", url.port != nil,
      url.path == "/plugins/spot-chat/window" else {
    exit(1)
}

let app = NSApplication.shared
let delegate = SpotChatApp(url: url)
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
