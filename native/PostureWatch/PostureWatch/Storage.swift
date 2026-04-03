import Foundation
import SQLite3

// MARK: - Settings & Baseline (UserDefaults)

struct Settings: Codable {
    var interval: Int = 30
    var sensitivity: Double = 0.5
    var launchAtLogin: Bool = false
}

class SettingsStore {
    private let defaults = UserDefaults.standard
    private let settingsKey = "pw:settings"
    private let baselineKey = "pw:baseline"

    func loadSettings() -> Settings {
        guard let data = defaults.data(forKey: settingsKey),
              let settings = try? JSONDecoder().decode(Settings.self, from: data) else {
            return Settings()
        }
        return settings
    }

    func saveSettings(_ settings: Settings) {
        if let data = try? JSONEncoder().encode(settings) {
            defaults.set(data, forKey: settingsKey)
        }
    }

    func loadBaseline() -> PoseMetrics? {
        guard let data = defaults.data(forKey: baselineKey),
              let values = try? JSONDecoder().decode([CGFloat].self, from: data),
              values.count == 4 else {
            return nil
        }
        return PoseMetrics(
            earShoulderDist: values[0],
            headHeight: values[1],
            shoulderTilt: values[2],
            noseShoulderDist: values[3]
        )
    }

    func saveBaseline(_ baseline: PoseMetrics) {
        let values = [baseline.earShoulderDist, baseline.headHeight, baseline.shoulderTilt, baseline.noseShoulderDist]
        if let data = try? JSONEncoder().encode(values) {
            defaults.set(data, forKey: baselineKey)
        }
    }
}

// MARK: - Stats (SQLite)

class StatsStore {
    private var db: OpaquePointer?

    init() {
        let path = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("PostureWatch", isDirectory: true)

        try? FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)

        let dbPath = path.appendingPathComponent("stats.db").path

        if sqlite3_open(dbPath, &db) == SQLITE_OK {
            createTables()
        }
    }

    deinit {
        sqlite3_close(db)
    }

    private func createTables() {
        let sql = """
        CREATE TABLE IF NOT EXISTS daily_stats (
            date TEXT NOT NULL,
            total_checks INTEGER DEFAULT 0,
            good_checks INTEGER DEFAULT 0,
            avg_score REAL DEFAULT 0,
            best_streak INTEGER DEFAULT 0,
            PRIMARY KEY (date)
        );
        """
        sqlite3_exec(db, sql, nil, nil, nil)
    }

    func upsertDaily(date: String, checks: Int, goodChecks: Int, score: Double, bestStreak: Int) {
        let sql = """
        INSERT INTO daily_stats (date, total_checks, good_checks, avg_score, best_streak)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            total_checks = total_checks + excluded.total_checks,
            good_checks = good_checks + excluded.good_checks,
            avg_score = excluded.avg_score,
            best_streak = MAX(best_streak, excluded.best_streak);
        """
        var stmt: OpaquePointer?
        if sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK {
            sqlite3_bind_text(stmt, 1, (date as NSString).utf8String, -1, nil)
            sqlite3_bind_int(stmt, 2, Int32(checks))
            sqlite3_bind_int(stmt, 3, Int32(goodChecks))
            sqlite3_bind_double(stmt, 4, score)
            sqlite3_bind_int(stmt, 5, Int32(bestStreak))
            sqlite3_step(stmt)
        }
        sqlite3_finalize(stmt)
    }
}
