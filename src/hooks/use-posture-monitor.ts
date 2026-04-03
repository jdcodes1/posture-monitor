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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cameraRef = useRef(new CameraManager());
  const monitorRef = useRef(new MonitorState());
  const rafRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isForegroundRef = useRef(true);
  const isMonitoringRef = useRef(false);
  const syncRef = useRef<StatSync | null>(null);
  const syncInitRef = useRef(false);

  // Sync state from MonitorState
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
    if (!lm) return null;
    const result = lm.detect(video);
    if (!result?.landmarks?.[0]?.length) return null;
    return result.landmarks[0] as Array<{ x: number; y: number; z: number; visibility?: number }>;
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
      // Record to sync buffer if authenticated
      if (syncRef.current) {
        syncRef.current.recordCheck(result, m.stats.streak);
      }
    }
    syncState();
  }, [detectOnce, settings.sensitivity, syncState]);

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
        const video = await cameraRef.current.acquire();
        processCheck(video);
        cameraRef.current.release();
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

  // Set ready once MediaPipe loads
  useEffect(() => {
    if (!mpLoading && !mpError) {
      setStatus('ready');
    }
    if (mpError) {
      setError(mpError);
    }
  }, [mpLoading, mpError]);

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
        // Acquire camera and attach to video element for live preview
        cameraRef.current.acquire().then((video) => {
          if (videoRef.current) {
            videoRef.current.srcObject = video.srcObject;
            videoRef.current.play().catch(() => {});
          }
          startForegroundLoop();
        }).catch(() => {});
      } else {
        stopForegroundLoop();
        // Release camera for background mode
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        cameraRef.current.release();
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
      cameraRef.current.release();
    };
  }, [stopForegroundLoop, stopBackgroundLoop]);

  // Calibrate
  const calibrate = useCallback(async () => {
    setStatus('calibrating');
    setError(null);
    try {
      const video = await cameraRef.current.acquire();
      if (videoRef.current) {
        videoRef.current.srcObject = video.srcObject;
        await videoRef.current.play().catch(() => {});
      }

      const samples: PoseMetrics[] = [];
      for (let i = 0; i < 5; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 600));
        const landmarks = detectOnce(video);
        if (!landmarks || landmarks.length === 0) {
          throw new Error('Could not detect pose. Make sure you are visible in the camera.');
        }
        samples.push(extractMetrics(landmarks));
      }

      const baseline = averageSamples(samples);
      monitorRef.current.calibrate(baseline);
      saveBaseline(baseline);
      setIsCalibrated(true);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calibration failed');
      setStatus('ready');
      // Release camera on failure
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      cameraRef.current.release();
    }
  }, [detectOnce]);

  // Start monitoring
  const startMonitoring = useCallback(() => {
    const m = monitorRef.current;
    if (!m.baseline) return;
    m.start();
    isMonitoringRef.current = true;
    setStatus('monitoring');
    syncState();

    if (isForegroundRef.current) {
      // Camera already acquired from calibration, start loop
      cameraRef.current.acquire().then((video) => {
        if (videoRef.current) {
          videoRef.current.srcObject = video.srcObject;
          videoRef.current.play().catch(() => {});
        }
        startForegroundLoop();
      }).catch(() => {});
    } else {
      cameraRef.current.release();
      startBackgroundLoop();
    }
  }, [syncState, startForegroundLoop, startBackgroundLoop]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;
    monitorRef.current.stop();
    stopForegroundLoop();
    stopBackgroundLoop();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    cameraRef.current.release();
    setStatus('ready');
    updateFavicon('away');
  }, [stopForegroundLoop, stopBackgroundLoop]);

  // Recalibrate
  const recalibrate = useCallback(() => {
    stopMonitoring();
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
    canvasRef,
    calibrate,
    startMonitoring,
    stopMonitoring,
    recalibrate,
    updateSettings,
  };
}
