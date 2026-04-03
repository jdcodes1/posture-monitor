export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;

  async acquire(): Promise<HTMLVideoElement> {
    if (this.stream && this.video) return this.video;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });

    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;
    await this.video.play();

    // Wait for video to have dimensions
    await new Promise<void>((resolve) => {
      if (this.video!.videoWidth > 0) return resolve();
      this.video!.addEventListener('loadeddata', () => resolve(), { once: true });
    });

    return this.video;
  }

  release(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  isActive(): boolean {
    return this.stream !== null;
  }
}
