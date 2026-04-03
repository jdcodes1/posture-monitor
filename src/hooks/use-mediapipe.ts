'use client';

import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PoseLandmarker = any;

const CDN_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export function useMediaPipe() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await import(/* webpackIgnore: true */ CDN_URL);
        const { PoseLandmarker, FilesetResolver } = vision;

        const wasmFileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        let delegate: 'GPU' | 'CPU' = 'GPU';
        let landmarker: PoseLandmarker;

        try {
          landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate,
            },
            runningMode: 'IMAGE',
            numPoses: 1,
          });
        } catch {
          delegate = 'CPU';
          landmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate,
            },
            runningMode: 'IMAGE',
            numPoses: 1,
          });
        }

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load MediaPipe');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close?.();
        landmarkerRef.current = null;
      }
    };
  }, []);

  return { landmarker: landmarkerRef, loading, error };
}
