'use client';

import { useEffect, useRef } from 'react';
import type { PostureStatus } from '@/lib/pose-engine';

interface PoseOverlayProps {
  landmarks: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
  width: number;
  height: number;
  status: PostureStatus | 'away';
}

const KEY_LANDMARKS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24];
const CONNECTIONS: [number, number][] = [
  [0, 7], [0, 8], [7, 8],
  [11, 12], [11, 13], [12, 14],
  [13, 15], [14, 16],
  [11, 23], [12, 24], [23, 24],
];

const STATUS_COLORS: Record<PostureStatus | 'away', string> = {
  good: '#3ee8a5',
  warn: '#f5c842',
  bad: '#f5564a',
  away: '#5c6370',
};

export function PoseOverlay({ landmarks, width, height, status }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!landmarks || landmarks.length === 0) return;

    const color = STATUS_COLORS[status];

    // Draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const [a, b] of CONNECTIONS) {
      const la = landmarks[a];
      const lb = landmarks[b];
      if (!la || !lb) continue;
      ctx.beginPath();
      ctx.moveTo(la.x * width, la.y * height);
      ctx.lineTo(lb.x * width, lb.y * height);
      ctx.stroke();
    }

    // Draw key landmarks
    ctx.fillStyle = color;
    for (const i of KEY_LANDMARKS) {
      const lm = landmarks[i];
      if (!lm) continue;
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [landmarks, width, height, status]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width, height }}
    />
  );
}
