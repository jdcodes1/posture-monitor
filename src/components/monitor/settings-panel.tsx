'use client';

import type { Settings } from '@/lib/local-storage';

interface SettingsPanelProps {
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
}

const INTERVALS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '2min', value: 120 },
];

const SENSITIVITIES = [
  { label: 'Relaxed', value: 0.3 },
  { label: 'Normal', value: 0.5 },
  { label: 'Strict', value: 0.7 },
];

export function SettingsPanel({ settings, updateSettings }: SettingsPanelProps) {
  const handleNotificationToggle = async (enabled: boolean) => {
    if (enabled && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    updateSettings({ notificationsEnabled: enabled });
  };

  return (
    <div className="rounded-lg bg-[#141820] border border-[#252b38] p-4 space-y-4">
      <h3 className="text-sm font-medium text-[#c8cfd8]">Settings</h3>

      <div className="space-y-2">
        <label className="text-xs text-[#5c6370]">Check interval</label>
        <div className="flex gap-2">
          {INTERVALS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateSettings({ interval: opt.value })}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                settings.interval === opt.value
                  ? 'bg-[#4a9eff] text-white'
                  : 'bg-[#1a1f2b] text-[#5c6370] hover:text-[#c8cfd8]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[#5c6370]">Sensitivity</label>
        <div className="flex gap-2">
          {SENSITIVITIES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateSettings({ sensitivity: opt.value })}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                settings.sensitivity === opt.value
                  ? 'bg-[#4a9eff] text-white'
                  : 'bg-[#1a1f2b] text-[#5c6370] hover:text-[#c8cfd8]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs text-[#5c6370]">Notifications</label>
        <button
          onClick={() => handleNotificationToggle(!settings.notificationsEnabled)}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            settings.notificationsEnabled ? 'bg-[#4a9eff]' : 'bg-[#252b38]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              settings.notificationsEnabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
}
