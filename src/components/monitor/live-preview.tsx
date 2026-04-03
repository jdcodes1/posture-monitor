'use client';

import { type RefObject } from 'react';
import type { PostureStatus } from '@/lib/pose-engine';
import type { SessionStats } from '@/lib/monitor-controller';

interface LivePreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  postureStatus: PostureStatus | 'away';
  stats: SessionStats;
  score: number;
  onRecalibrate: () => void;
  onStop: () => void;
}

const STATUS_COLORS: Record<PostureStatus | 'away', string> = {
  good: '#3ee8a5',
  warn: '#f5c842',
  bad: '#f5564a',
  away: '#5c6370',
};

const STATUS_LABELS: Record<PostureStatus | 'away', string> = {
  good: 'Good posture',
  warn: 'Check posture',
  bad: 'Fix posture',
  away: 'Away',
};

export function LivePreview({
  videoRef,
  canvasRef,
  postureStatus,
  stats,
  score,
  onRecalibrate,
  onStop,
}: LivePreviewProps) {
  const color = STATUS_COLORS[postureStatus];

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-[#141820] border border-[#252b38]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none scale-x-[-1]"
        />
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-3">
        <span
          className="w-3 h-3 rounded-full animate-pulse"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm" style={{ color }}>
          {STATUS_LABELS[postureStatus]}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 w-full">
        <div className="text-center">
          <p className="font-mono text-lg text-[#c8cfd8]">{stats.checks}</p>
          <p className="text-xs text-[#5c6370]">Checks</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-lg text-[#c8cfd8]">{score}%</p>
          <p className="text-xs text-[#5c6370]">Score</p>
        </div>
        <div className="text-center">
          <p className="font-mono text-lg text-[#c8cfd8]">{stats.streak}</p>
          <p className="text-xs text-[#5c6370]">Streak</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={onRecalibrate}
          className="px-4 py-2 rounded-lg bg-[#1a1f2b] text-[#5c6370] text-sm hover:text-[#c8cfd8] transition-colors"
        >
          Recalibrate
        </button>
        <button
          onClick={onStop}
          className="px-4 py-2 rounded-lg bg-[#f5564a]/10 text-[#f5564a] text-sm hover:bg-[#f5564a]/20 transition-colors"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
