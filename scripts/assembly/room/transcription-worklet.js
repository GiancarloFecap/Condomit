class CondomitPcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.frames=[]; this.length=0; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input && input.length) {
      this.frames.push(new Float32Array(input));
      this.length += input.length;
      if (this.length >= 8192) {
        const buffer = new Float32Array(this.length);
        let offset=0;
        for (const frame of this.frames) {buffer.set(frame,offset); offset+=frame.length;}
        this.port.postMessage({buffer,rate:sampleRate},[buffer.buffer]);
        this.frames=[];this.length=0;
      }
    }
    return true;
  }
}
registerProcessor('condomit-pcm-capture',CondomitPcmCapture);
