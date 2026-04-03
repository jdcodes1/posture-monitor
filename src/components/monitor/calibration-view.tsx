'use client';

import type { Settings } from '@/lib/local-storage';
import { SettingsPanel } from './settings-panel';

interface CalibrationViewProps {
  status: 'ready' | 'calibrating';
  error: string | null;
  isCalibrated: boolean;
  settings: Settings;
  onCalibrate: () => void;
  onStart: () => void;
  updateSettings: (s: Partial<Settings>) => void;
}

export function CalibrationView({
  status,
  error,
  isCalibrated,
  settings,
  onCalibrate,
  onStart,
  updateSettings,
}: CalibrationViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      {error && (
        <p className="text-[#f5564a] text-sm text-center">{error}</p>
      )}

      <div className="flex gap-3">
        {!isCalibrated ? (
          <button
            onClick={onCalibrate}
            disabled={status === 'calibrating'}
            className="px-6 py-2.5 rounded-lg bg-[#4a9eff] text-white text-sm font-medium hover:bg-[#4a9eff]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'calibrating' ? 'Calibrating...' : 'Calibrate'}
          </button>
        ) : (
          <>
            <button
              onClick={onCalibrate}
              className="px-4 py-2.5 rounded-lg bg-[#1a1f2b] text-[#5c6370] text-sm hover:text-[#c8cfd8] transition-colors"
            >
              Recalibrate
            </button>
            <button
              onClick={onStart}
              className="px-6 py-2.5 rounded-lg bg-[#3ee8a5] text-[#0b0e14] text-sm font-medium hover:bg-[#3ee8a5]/90 transition-colors"
            >
              Start monitoring &rarr;
            </button>
          </>
        )}
      </div>

      <SettingsPanel settings={settings} updateSettings={updateSettings} />
    </div>
  );
}
