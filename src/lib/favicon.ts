import type { PostureStatus } from './pose-engine';

const COLORS: Record<PostureStatus | 'away', string> = {
  good: '#3ee8a5',
  warn: '#f5c842',
  bad: '#f5564a',
  away: '#5c6370',
};

const TITLES: Record<PostureStatus | 'away', string> = {
  good: '✓ posture//watch',
  warn: '⚠ posture//watch',
  bad: '✗ Fix posture!',
  away: 'posture//watch',
};

let canvas: HTMLCanvasElement | null = null;

export function updateFavicon(status: PostureStatus | 'away'): void {
  if (typeof document === 'undefined') return;

  document.title = TITLES[status];

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
  }

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 32, 32);
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.fillStyle = COLORS[status];
  ctx.fill();

  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL('image/png');
}
