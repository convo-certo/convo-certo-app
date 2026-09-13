class MicrophoneCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(2048);
    this.writeIndex = 0;
    this.filled = 0;
    this.sinceFrame = 0;
    this.hop = Math.round(sampleRate / 40);
    this.energySize = Math.round(sampleRate / 200);
    this.energyCount = 0;
    this.energy = 0;
    this.quietWindows = 0;
    this.quietGap = false;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.ring[this.writeIndex] = channel[i];
      this.energy += channel[i] * channel[i];
      this.energyCount++;
      if (this.energyCount >= this.energySize) {
        this.quietWindows = this.energy / this.energyCount < 0.008 ** 2 ? this.quietWindows + 1 : 0;
        if (this.quietWindows >= 2) this.quietGap = true;
        this.energyCount = 0; this.energy = 0;
      }
      this.writeIndex = (this.writeIndex + 1) % this.ring.length;
      this.filled = Math.min(this.ring.length, this.filled + 1);
      this.sinceFrame++;
      if (this.sinceFrame < this.hop) continue;
      this.sinceFrame = 0;
      if (this.filled < this.ring.length) continue;
      const samples = new Float32Array(this.ring.length);
      samples.set(this.ring.subarray(this.writeIndex));
      samples.set(this.ring.subarray(0, this.writeIndex), this.ring.length - this.writeIndex);
      this.port.postMessage({ samples, time: (currentFrame + i + 1) / sampleRate, quietGap: this.quietGap }, [samples.buffer]);
      this.quietGap = false;
    }
    return true;
  }
}

registerProcessor("convocerto-microphone-capture", MicrophoneCapture);
