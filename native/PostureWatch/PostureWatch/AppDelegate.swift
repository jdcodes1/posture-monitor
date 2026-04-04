import Cocoa

func pwLog(_ msg: String) {
    let line = "[PostureWatch] \(msg)\n"
    FileHandle.standardError.write(line.data(using: .utf8)!)
}

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusBarController: StatusBarController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        pwLog("App launched")
        statusBarController = StatusBarController()
        pwLog("StatusBarController created")
    }
}
