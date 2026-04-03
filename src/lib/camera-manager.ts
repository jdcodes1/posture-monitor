export class CameraManager {
  private stream: MediaStream | null = null;

  async start(video: HTMLVideoElement): Promise<void> {
    if (this.stream) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });

    video.srcObject = this.stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();

    // Wait for video to have dimensions
    await new Promise<void>((resolve) => {
      if (video.videoWidth > 0) return resolve();
      video.addEventListener('loadeddata', () => resolve(), { once: true });
    });
  }

  stop(video?: HTMLVideoElement): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (video) {
      video.srcObject = null;
    }
  }

  isActive(): boolean {
    return this.stream !== null;
  }
}
