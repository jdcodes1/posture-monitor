export class CameraManager {
  private stream: MediaStream | null = null;

  async acquire(): Promise<MediaStream> {
    if (this.stream) return this.stream;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });

    return this.stream;
  }

  release(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
