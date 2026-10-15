// The timer chime. Browsers only let an AudioContext start after a user gesture, so the context is created
// lazily on the first pointerdown (alarm.js) and kept for the life of the card. It is closed when the card
// leaves the page, so a dashboard that is opened and closed all day does not leak audio contexts.
// Ported from the pointerdown handler and _ring of the original; the sound is identical.

const TONES = 6;
const FREQUENCY = 880;
const TONE_GAP_S = 0.45;
const TONE_LENGTH_S = 0.3;
const PEAK_GAIN = 0.12;
const SILENCE_GAIN = 0.001;

/**
 * Create the AudioContext if it does not exist yet and ask it to resume (a context made inside a gesture
 * handler may start suspended). Returns the context, or null where the Web Audio API is missing.
 * Never throws: no sound is better than a broken page.
 * @param {{audio: AudioContext|null}} ext   the timer extension state
 */
export function unlockAudio(ext) {
  try {
    const Context = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
    ext.audio ||= new Context();
    ext.audio.resume()?.catch?.(() => {});
  } catch {
    /* no Web Audio, or the browser refused: stay silent */
  }
  return ext.audio;
}

/** Play six short 880 Hz beeps. Only a running (unlocked) context can sound, so otherwise this does nothing. */
export function ring(audio) {
  if (!audio || audio.state !== 'running') return;
  try {
    for (let i = 0; i < TONES; i++) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + i * TONE_GAP_S;
      tone.frequency.value = FREQUENCY;
      gain.gain.setValueAtTime(PEAK_GAIN, start);
      gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, start + TONE_LENGTH_S);
      tone.connect(gain);
      gain.connect(audio.destination);
      tone.start(start);
      tone.stop(start + TONE_LENGTH_S);
    }
  } catch {
    /* the chime is a courtesy; the banner still shows */
  }
}

/** Close the context (card disconnected). A later pointerdown creates a fresh one. */
export function closeAudio(ext) {
  const audio = ext.audio;
  ext.audio = null;
  try {
    audio?.close?.()?.catch?.(() => {});
  } catch {
    /* already closed */
  }
}
