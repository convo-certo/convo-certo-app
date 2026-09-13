export function hasSampleSignal(buffer: AudioBuffer): boolean {
  for (let channel=0;channel<buffer.numberOfChannels;channel++) {
    const data=buffer.getChannelData(channel);
    for(let index=0;index<data.length;index++) if(Number.isFinite(data[index]) && Math.abs(data[index])>1e-6) return true;
  }
  return false;
}
