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

  // Visible video element for camera preview (lives in the page, not in child components)
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  // Hidden video element for MediaPipe detection (created once, never in DOM)
  const detectionVideoRef = useRef<HTMLVideoElement | null>(null);

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

  // Attach a stream to both the display and detection videos
  const attachStream = useCallback((stream: MediaStream) => {
    // Display video (visible, mirrored via CSS)
    if (displayVideoRef.current) {
      displayVideoRef.current.srcObject = stream;
      displayVideoRef.current.play().catch(() => {});
    }
    // Detection video (hidden, used by MediaPipe)
    if (!detectionVideoRef.current) {
      detectionVideoRef.current = document.createElement('video');
      detectionVideoRef.current.playsInline = true;
      detectionVideoRef.current.muted = true;
      // Give it real dimensions so MediaPipe can read it
      detectionVideoRef.current.width = 640;
      detectionVideoRef.current.height = 480;
    }
    detectionVideoRef.current.srcObject = stream;
    detectionVideoRef.current.play().catch(() => {});
  }, []);

  // Detach streams from both videos
  const detachStream = useCallback(() => {
    if (displayVideoRef.current) {
      displayVideoRef.current.srcObject = null;
    }
    if (detectionVideoRef.current) {
      detectionVideoRef.current.srcObject = null;
    }
  }, []);

  // Sync state from MonitorState to React
  const syncState = useCallback(() => {
    const m = monitorRef.current;
    setStats({ ...m.stats });
    setScore(m.score);
    setPostureStatus(m.isAway ? 'away' : m.postureStatus);
    updateFavicon(m.isAway ? 'away' : m.postureStatus);
  }, []);

  // Single frame inference — always uses the hidden detection video
  const detectOnce = useCallback(() => {
    const lm = landmarker.current;
    const video = detectionVideoRef.current;
    if (!lm || !video || video.readyState < 2) return null;
    try {
      const result = lm.detect(video);
      if (!result?.landmarks?.[0]?.length) return null;
      return result.landmarks[0] as Array<{ x: number; y: number; z: number }>;
    } catch {
      return null;
    }
  }, [landmarker]);

  // Process a single check
  const processCheck = useCallback(() => {
    const m = monitorRef.current;
    if (!m.baseline) return;

    const landmarks = detectOnce();
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
      processCheck();
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
        // Acquire camera, attach to detection video, run one check, release
        const stream = await cameraRef.current.acquire();
        attachStream(stream);
        // Wait for detection video to have a frame
        await new Promise<void>((resolve) => {
          const check = () => {
            const v = detectionVideoRef.current;
            if (v && v.readyState >= 2) return resolve();
            setTimeout(check, 50);
          };
          check();
        });
        await new Promise((r) => setTimeout(r, 200));
        processCheck();
        detachStream();
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
  }, [processCheck, attachStream, detachStream, settings.interval, isLowBattery, syncState]);

  const stopBackgroundLoop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // MediaPipe loaded → set status to ready
  useEffect(() => {
    if (!mpLoading && !mpError) {
      setStatus('ready');
    }
    if (mpError) {
      setError(mpError);
    }
  }, [mpLoading, mpError]);

  // Start camera as soon as we're ready — poll for displayVideoRef
  useEffect(() => {
    if (status !== 'ready' && status !== 'calibrating') return;
    if (cameraReady) return;

    let cancelled = false;

    const tryStart = async () => {
      // Poll until the display video element is mounted
      while (!displayVideoRef.current && !cancelled) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (cancelled) return;

      try {
        const stream = await cameraRef.current.acquire();
        if (cancelled) return;
        attachStream(stream);

        // Wait for detection video to have a real frame
        await new Promise<void>((resolve) => {
          const check = () => {
            const v = detectionVideoRef.current;
            if (v && v.readyState >= 2 && v.videoWidth > 0) return resolve();
            setTimeout(check, 50);
          };
          check();
        });

        if (!cancelled) setCameraReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Camera access denied');
        }
      }
    };

    tryStart();
    return () => { cancelled = true; };
  }, [status, cameraReady, attachStream]);

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
        cameraRef.current.acquire().then((stream) => {
          attachStream(stream);
          startForegroundLoop();
        }).catch(() => {});
      } else {
        stopForegroundLoop();
        detachStream();
        cameraRef.current.release();
        startBackgroundLoop();
      }
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [startForegroundLoop, stopForegroundLoop, startBackgroundLoop, stopBackgroundLoop, attachStream, detachStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopForegroundLoop();
      stopBackgroundLoop();
      detachStream();
      cameraRef.current.release();
    };
  }, [stopForegroundLoop, stopBackgroundLoop, detachStream]);

  // Calibrate — camera and detection video are already running
  const calibrate = useCallback(async () => {
    setStatus('calibrating');
    setError(null);
    try {
      // Wait a moment for camera to settle
      await new Promise((r) => setTimeout(r, 500));

      const samples: PoseMetrics[] = [];
      let consecutiveMisses = 0;
      for (let i = 0; i < 5; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 600));
        const landmarks = detectOnce();
        if (!landmarks || landmarks.length === 0) {
          consecutiveMisses++;
          if (consecutiveMisses >= 8) {
            throw new Error('Could not detect pose. Make sure your upper body is visible in the camera.');
          }
          i--;
          await new Promise((r) => setTimeout(r, 500));
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
      setTimeout(() => calibrate(), 1500);
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
      const stream = await cameraRef.current.acquire();
      attachStream(stream);
      startForegroundLoop();
    } else {
      startBackgroundLoop();
    }
  }, [syncState, startForegroundLoop, startBackgroundLoop, attachStream]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false;
    monitorRef.current.stop();
    stopForegroundLoop();
    stopBackgroundLoop();
    detachStream();
    cameraRef.current.release();
    setStatus('ready');
    updateFavicon('away');
    setCameraReady(false);
  }, [stopForegroundLoop, stopBackgroundLoop, detachStream]);

  // Recalibrate
  const recalibrate = useCallback(async () => {
    stopMonitoring();
    // Restart camera
    const stream = await cameraRef.current.acquire();
    attachStream(stream);
    setCameraReady(true);
    calibrate();
  }, [stopMonitoring, calibrate, attachStream]);

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
    displayVideoRef,
    calibrate,
    startMonitoring,
    stopMonitoring,
    recalibrate,
    updateSettings,
  };
}
