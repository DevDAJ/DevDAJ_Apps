import ExpoModulesCore

/// Every DevDAJ app joins one app group; each keeps `<app>/data.db` inside its container,
/// so apps read each other's databases directly. The config plugin writes these Info.plist keys.
public class AppDataModule: Module {
  private static let namePattern = try! NSRegularExpression(pattern: "^[a-z][a-z0-9_]{0,63}$")

  private static func isValidAppName(_ app: String) -> Bool {
    namePattern.firstMatch(in: app, range: NSRange(app.startIndex..., in: app)) != nil
  }

  private var appName: String? {
    guard let name = Bundle.main.object(forInfoDictionaryKey: "DevdajAppName") as? String,
      Self.isValidAppName(name)
    else { return nil }
    return name
  }

  /// Nil when the app group entitlement is missing (e.g. Expo Go or a build without the plugin).
  private var appsDirectory: URL? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "DevdajAppGroup") as? String else {
      return nil
    }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
  }

  public func definition() -> ModuleDefinition {
    Name("DevdajAppData")

    Constant("appName") { self.appName }

    Constant("appsDirectory") { self.appsDirectory?.path }

    Function("databaseExists") { (app: String) -> Bool in
      guard Self.isValidAppName(app), let directory = self.appsDirectory else { return false }
      let file = directory.appendingPathComponent(app).appendingPathComponent("data.db")
      return FileManager.default.fileExists(atPath: file.path)
    }
  }
}
