import AppKit
import Foundation

final class OpenHelper: NSObject, NSApplicationDelegate {
    private var handled = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let rawURL = CommandLine.arguments.dropFirst().first, rawURL.hasPrefix("guangyu-open://") {
            handle(rawURL)
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                if self?.handled == false { NSApp.terminate(nil) }
            }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else { return }
        handle(url.absoluteString)
    }

    private func handle(_ rawURL: String) {
        guard !handled else { return }
        handled = true

        do {
            let target = try localFileTarget(from: rawURL)
            guard FileManager.default.fileExists(atPath: target.path) else {
                throw OpenError.invalid("找不到这个本机文件或文件夹：\n\(target.path)")
            }
            guard NSWorkspace.shared.open(target) else {
                throw OpenError.invalid("系统未能用默认应用打开：\n\(target.path)")
            }
            show("已交给系统默认应用打开。", style: .informational)
        } catch let error as OpenError {
            show(error.details, style: .critical)
        } catch {
            show("本机资料打开失败：\n\(error.localizedDescription)", style: .critical)
        }
        NSApp.terminate(nil)
    }

    private func localFileTarget(from rawURL: String) throws -> URL {
        guard let request = URLComponents(string: rawURL),
              request.scheme == "guangyu-open",
              request.host == "open",
              request.queryItems?.count == 1,
              let encodedTarget = request.queryItems?.first(where: { $0.name == "target" })?.value,
              let target = URL(string: encodedTarget),
              target.isFileURL,
              target.host == nil || target.host == "localhost",
              target.user == nil,
              target.password == nil,
              target.port == nil,
              target.query == nil,
              target.fragment == nil,
              target.path.hasPrefix("/") else {
            throw OpenError.invalid("打开请求无效。请从光域空间重新点击资料链接。")
        }
        return target.standardizedFileURL
    }

    private func show(_ message: String, style: NSAlert.Style) {
        let alert = NSAlert()
        alert.messageText = "光域空间本机资料工具"
        alert.informativeText = message
        alert.alertStyle = style
        alert.addButton(withTitle: "好")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }
}

enum OpenError: Error {
    case invalid(String)

    var details: String {
        if case let .invalid(text) = self { return text }
        return "打开请求失败。"
    }
}

let application = NSApplication.shared
let delegate = OpenHelper()
application.delegate = delegate
application.run()
