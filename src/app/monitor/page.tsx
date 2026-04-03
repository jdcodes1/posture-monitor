'use client';

import { usePostureMonitor } from '@/hooks/use-posture-monitor';
import { CalibrationView } from '@/components/monitor/calibration-view';
import { LivePreview } from '@/components/monitor/live-preview';

export default function MonitorPage() {
  const {
    status,
    postureStatus,
    stats,
    score,
    settings,
    error,
    isCalibrated,
    videoRef,
    calibrate,
    startMonitoring,
    stopMonitoring,
    recalibrate,
    updateSettings,
  } = usePostureMonitor();

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-center font-mono text-lg text-[#c8cfd8] mb-8">
          posture//watch
        </h1>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-6 h-6 border-2 border-[#4a9eff] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#5c6370]">Loading pose detection...</p>
          </div>
        )}

        {(status === 'ready' || status === 'calibrating') && (
          <CalibrationView
            videoRef={videoRef}
            status={status}
            error={error}
            isCalibrated={isCalibrated}
            settings={settings}
            onCalibrate={calibrate}
            onStart={startMonitoring}
            updateSettings={updateSettings}
          />
        )}

        {status === 'monitoring' && (
          <LivePreview
            videoRef={videoRef}
            postureStatus={postureStatus}
            stats={stats}
            score={score}
            onRecalibrate={recalibrate}
            onStop={stopMonitoring}
          />
        )}
      </div>
    </main>
  );
}
