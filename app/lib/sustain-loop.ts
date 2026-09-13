export const sustainedInstruments = new Set(['string_ensemble_1','flute','bassoon','french_horn','contrabass','clarinet','oboe','english_horn','trumpet','trombone','tuba','violin','viola','cello','piccolo','alto_sax','tenor_sax','baritone_sax','soprano_sax']);

export function sustainLoop(context: BaseAudioContext, original: AudioBuffer): {buffer:AudioBuffer;start:number;end:number} | null {
  if (original.duration < 1.5) return null;
  const rate=original.sampleRate, fade=Math.floor(rate*0.05), start=Math.floor(rate*0.7);
  const data=original.getChannelData(0);
  const low=Math.floor(rate*Math.min(2.2,original.duration*0.7));
  const high=Math.min(original.length-fade,low+Math.floor(rate*0.12));
  let best=low, error=Infinity;
  for (let end=low;end<=high;end+=4) {
    let difference=0;
    for(let i=0;i<fade;i+=16) difference+=(data[end-fade+i]-data[start+i])**2;
    if(difference<error){error=difference;best=end;}
  }
  const buffer=context.createBuffer(original.numberOfChannels,best,rate);
  for(let channel=0;channel<original.numberOfChannels;channel++) {
    const source=original.getChannelData(channel), target=buffer.getChannelData(channel);
    target.set(source.subarray(0,best));
    for(let i=0;i<fade;i++) {
      const mix=i/(fade-1);
      target[best-fade+i]=source[best-fade+i]*(1-mix)+source[start+i]*mix;
    }
  }
  return {buffer,start:(start+fade)/rate,end:best/rate};
}
