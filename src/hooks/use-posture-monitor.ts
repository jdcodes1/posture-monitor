'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraManager } from '@/lib/camera-manager';
import { MonitorState, type SessionStats } from '@/lib/monitor-controller';
import {
  extractMetrics,
  compareToBaseline,
  averageSamples,
  type PoseMetrics,
  type PostureStatus,
} from '@/lib/pose-engine';
import { updateFavicon } from '@/lib/favicon';
import {
  getBaseline,
  saveBaseline,
  getSettings,
  saveSettings as persistSettings,
  type Settings,
} from '@/lib/local-storage';
import { StatSync } from '@/lib/sync';
import { useMediaPipe } from './use-mediapipe';
import { useBattery } from './use-battery';

type MonitorStatus = 'loading' | 'ready' | 'calibrating' | 'monitoring';

export function usePostureMonitor(userId?: string | null) {
  const { landmarker, loading: mpLoading, error: mpError } = useMediaPipe();
  const { isLowBattery } = useBattery();

  const [status, setStatus] = useState<MonitorStatus>('loading');
  const [postureStatus, setPostureStatus] = useState<PostureStatus | 'away'>('good');
  const [stats, setStats] = useState<SessionStats>({
    checks: 0, good: 0, streak: 0, bestStreak: 0, startedAt: 0,
  });
  const [score, setScore] = useState(100);
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [error, setError] = useState<string | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);

  const cameraRef = useRef(new CameraManager());
  const monitorRef = useRef(new MonitorState());
  const rafRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isForegroundRef = useRef(true);
  const isMonitoringRef = useRef(false);
  const syncRef = useRef<StatSync | null>(null);
  const syncInitRef = useRef(false);
  const lastNotifiedStatusRef = useRef<PostureStatus>('good');
  const autoCalibrationTriggered = useRef(false);
  const cameraStartedRef = useRef(false);

  // Sync state from MonitorState to React
  const syncState = useCallback(() => {
    const m = monitorRef.current;
    setStats({ ...m.stats });
    setScore(m.score);
    setPostureStatus(m.isAway ? 'away' : m.postureStatus);
    updateFavicon(m.isAway ? 'away' : m.postureStatus);
  }, []);

  // Single frame inference
  const detectOnce = useCallback((video: HTMLVideoElement) => {
    const lm = landmarker.current;
    if (!lm || video.readyState < 2) return null;
    const result = lm.detect(video);
    if (!result?.landmarks?.[0]?.length) return null;
    return result.landmarks[0] as Array<{ x: number; y: number; z: number }>;
  }, [landmarker]);

  // Process a single check
  const processCheck = useCallback((video: HTMLVideoElement) => {
    const m = monitorRef.current;
    if (!m.baseline) return;

    const landmarks = detectOnce(video);
    if (!landmarks || landmarks.length === 0) {
      m.recordMiss();
    } else {
      const metrics = extractMetrics(landmarks);
      const result = compareToBaseline(metrics, m.baseline, settings.sensitivity);
      m.recordHit(result);

      if (
        result === 'bad' &&
        lastNotifiedStatusRef.current !== 'bad' &&
        settings.notificationsEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('posture//watch', {
          body: 'Sit up straight! Your posture needs attention.',
          silent: false,
        });
      }
      lastNotifiedStatusRef.current = result;

      if (syncRef.current) {
        syncRef.current.recordCheck(result, m.stats.streak);
      }
    }
    syncState();
  }, [detectOnce, settings.sensitivity, settings.notificationsEnabled, syncState]);

  // Foreground rAF loop
  const startForegroundLoop = useCallback(() => {
    const loop = () => {
      if (!isMonitoringRef.current || !isForegroundRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        processCheck(video);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [processCheck]);

  const stopForegroundLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  // Background setTimeout chain
  const startBackgroundLoop = useCallback(() => {
    const tick = async () => {
      if (!isMonitoringRef.current || isForegroundRef.current) return;
      const m = monitorRef.current;
      try {
        if (!bgVideoRef.current) {
          bgVideoRef.current = document.createElement('video');
          bgVideoRef.current.playsInline = true;
          bgVideoRef.current.muted = true;
        }
        const bgVideo = bgVideoRef.current;
        const bgCam = new CameraManager();
        await bgCam.start(bgVideo);
        await new Promise((r) => setTimeout(r, 300));
        processCheck(bgVideo);
        bgCam.stop(bgVideo);
      } catch {
        m.recordMiss();
        syncState();
      }

      const interval = m.getEffectiveInterval(settings.interval * 1000, isLowBattery);
      timeoutRef.current = setTimeout(tick, interval);
    };

    const m = monitorRef.current;
    const interval = m.getEffectiveInterval(settings.interval * 1000, isLowBattery);
    timeoutRef.current = setTimeout(tick, interval);
  }, [processCheck, settings.interval, isLowBattery, syncState]);

  const stopBackgroundLoop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Start camera immediately when status becomes 'ready' and video ref is available
  useEffect(() => {
    if (!mpLoading && !mpError) {
      setStatus('ready');
    }
    if (mpError) {
      setError(mpError);
    }
  }, [mpLoading, mpError]);

  // Start camera as soon as we're ready — poll for videoRef since it mounts async
  useEffect(() => {
    if (status !== 'ready' && status !== 'calibrating') return;
    if (cameraStartedRef.current) return;

    const tryStartCamera = () => {
      const video = videoRef.current;
      if (!video) {
        // Video element not mounted yet, retry
        setTimeout(tryStartCamera, 100);
        return;
      }
      cameraStartedRef.current = true;
      cameraRef.current.start(video).then(() => {
        setCameraReady(true);
      }).catch((e) => {
        setError(e instanceof Error ? e.message : 'Camera access denied');
      });
    };
    tryStartCamera();
  }, [status]);

  // Load saved baseline on mount
  useEffect(() => {
    const saved = getBaseline();
    if (saved) {
      monitorRef.current.calibrate(saved);
      setIsCalibrated(true);
    }
  }, []);

  // Initialize sync for authenticated users
  useEffect(() => {
    if (!userId || syncInitRef.current) return;
    syncInitRef.current = true;

    const sync = new StatSync();
    syncRef.current = sync;
    sync.start(userId).then(() => {
      sync.migrateLocalStorage();
    }).catch((e) => {
      console.error('Sync start failed:', e);
    });

    return () => {
      sync.stop();
      syncRef.current = null;
      syncInitRef.current = false;
    };
  }, [userId]);

  // Visibility change handler
  useEffect(() => {
    const handler = () => {
      const visible = document.visibilityState === 'visible';
      isForegroundRef.current = visible;

      if (!isMonitoringRef.current) return;

      if (visible) {
        stopBackgroundLoop();
        const video = videoRef.current;
        if (video) {
          cameraRef.current.start(video).then(() => {
            startForegroundLoop();
          }).catch(() => {});
        }
      } else {
        stopForegroundLoop();
        cameraRef.current.stop(videoRef.current ?? undefined);
        startBackgroundLoop();
      }
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [startForegroundLoop, stopForegroundLoop, startBackgroundLoop, stopBackgroundLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopForegroundLoop();
      stopBackgroundLoop();
      cameraRef.current.stop(videoRef.current ?? undefined);
    };
  }, [stopForegroundLoop, stopBackgroundLoop]);

  // Calibrate — camera is already running, just take samples
  const calibrate = useCallback(async () => {
    setStatus('calibrating');
    setError(null);
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        throw new Error('Camera not ready yet. Please wait a moment and try again.');
      }

      // Extra settle time for first calibration
      await new Promise((r) => setTimeout(r, 500));

      const samples: PoseMetrics[] = [];
      let consecutiveMisses = 0;
      for (let i = 0; i < 5; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 600));
        const landmarks = detectOnce(video);
        if (!landmarks || landmarks.length === 0) {
          consecutiveMisses++;
          if (consecutiveMisses >= 5) {
            throw new Error('Could not detect pose. Make sure your upper body is visible in the camera.');
          }
          i--;
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        consecutiveMisses = 0;
        samples.push(extractMetrics(landmarks));
      }

      const baseline = averageSamples(samples);
      monitorRef.current.calibrate(baseline);
      saveBaseline(baseline);
      setIsCalibrated(true);

      // Auto-start monitoring
      monitorRef.current.start();
      isMonitoringRef.current = true;
      setStatus('monitoring');
      syncState();
      startForegroundLoop();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calibration failed');
      setStatus('ready');
    }
  }, [detectOnce, syncState, startForegroundLoop]);

  // Auto-calibrate once camera is ready and model is loaded
  useEffect(() => {
    if (cameraReady && !autoCalibrationTriggered.current && !isCalibrated && landmarker.current) {
      autoCalibrationTriggered.current = true;
      // Give camera a full second to warm up before auto-calibrating
      setTimeout(() => calibrate(), 1000);
    }
  }, [cameraReady, isCalibrated, calibrate, landmarker]);

  // Start monitoring (for saved baseline case)
  const startMonitoring = useCallback(async () => {
    const m = monitorRef.current;
    if (!m.baseline) return;
    m.start();
    isMonitoringRef.current = true;
    setStatus('monitoring');
    syncState();

    if (isForegroundRef.current) {
      const video = videoRef.current;
      if (video) {
        await cameraRef.current.start(video);
        startForegroundLoop();
      }
    } else {
      startBackgroundLoop();
    }
  }, [syncState, startForegroundLoop, startBackgroundLoop]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;
    monitorRef.current.stop();
    stopForegroundLoop();
    stopBackgroundLoop();
    cameraRef.current.stop(videoRef.current ?? undefined);
    setStatus('ready');
    updateFavicon('away');
  }, [stopForegroundLoop, stopBackgroundLoop]);

  // Recalibrate
  const recalibrate = useCallback(() => {
    stopMonitoring();
    // Restart camera for calibration view
    const video = videoRef.current;
    if (video) {
      cameraRef.current.start(video).catch(() => {});
    }
    calibrate();
  }, [stopMonitoring, calibrate]);

  // Update settings
  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      persistSettings(next);
      return next;
    });
  }, []);

  return {
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
  };
}
