import { useEffect } from 'react';

let audioContext: AudioContext | undefined;
export function unlockCallAudio() {
  if (!window.AudioContext) return;
  audioContext ??= new AudioContext();
  void audioContext.resume().catch(() => {});
}

export function useCallTone(tone: 'incoming' | 'ringing' | 'dialing' | null) {
  useEffect(() => {
    if (!tone || !window.AudioContext) return;
    audioContext ??= new AudioContext();
    const context = audioContext;
    const voices = new Set<OscillatorNode>();
    function beep(frequency: number, offset: number, duration: number) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = frequency;
      const time = context.currentTime + offset;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(.065, time + .025);
      gain.gain.setValueAtTime(.065, time + duration - .025);
      gain.gain.linearRampToValueAtTime(0, time + duration);
      oscillator.connect(gain).connect(context.destination);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(time);
      oscillator.stop(time + duration);
    }
    function ring() {
      if (context.state !== 'running') return;
      if (tone === 'incoming') { beep(660, 0, .22); beep(880, .28, .22); beep(660, .56, .22); }
      else if (tone === 'ringing') { beep(440, 0, .45); beep(480, .6, .45); }
      else { beep(425, 0, .22); beep(425, .45, .22); }
    }
    ring();
    const timer = window.setInterval(ring, tone === 'incoming' ? 2200 : tone === 'ringing' ? 3500 : 2200);
    return () => { window.clearInterval(timer); voices.forEach(oscillator => { try { oscillator.stop(); } catch { /* Already ended. */ } }); };
  }, [tone]);
}
