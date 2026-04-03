import IOKit.ps

class BatteryMonitor {
    var isLowBattery: Bool {
        guard let snapshot = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sources = IOPSCopyPowerSourcesList(snapshot)?.takeRetainedValue() as? [CFTypeRef],
              let source = sources.first,
              let info = IOPSGetPowerSourceDescription(snapshot, source)?.takeUnretainedValue() as? [String: Any] else {
            return false
        }

        let currentCapacity = info[kIOPSCurrentCapacityKey] as? Int ?? 100
        let maxCapacity = info[kIOPSMaxCapacityKey] as? Int ?? 100
        let isCharging = info[kIOPSIsChargingKey] as? Bool ?? true

        let level = Double(currentCapacity) / Double(maxCapacity)
        return level < 0.2 && !isCharging
    }
}
