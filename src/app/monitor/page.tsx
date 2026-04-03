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
    displayVideoRef,
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

        {/* Persistent video element — never unmounted between views */}
        <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-[#141820] border border-[#252b38] mb-6">
          <video
            ref={displayVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-[#4a9eff] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-[#5c6370] font-mono">Loading pose model...</p>
            </div>
          )}
          {status === 'calibrating' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <p className="text-[#f5c842] font-mono text-sm animate-pulse">
                Hold still...
              </p>
            </div>
          )}
        </div>

        {status === 'loading' && (
          <p className="text-center text-sm text-[#5c6370]">Initializing camera and pose detection...</p>
        )}

        {(status === 'ready' || status === 'calibrating') && (
          <CalibrationView
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
            postureStatus={postureStatus}
            stats={stats}
            score={score}
            onRecalibrate={recalibrate}
            onStop={stopMonitoring}
          />
        )}

        {/* Pop out as small window for background use */}
        {status === 'monitoring' && (
          <button
            onClick={() => {
              window.open(
                window.location.href,
                '_blank',
                'width=320,height=380,menubar=no,toolbar=no,location=no,status=no'
              );
            }}
            className="mt-4 w-full text-center text-xs text-[#5c6370] hover:text-[#c8cfd8] transition-colors cursor-pointer"
          >
            ↗ Pop out as tiny window
          </button>
        )}
      </div>
    </main>
  );
}
