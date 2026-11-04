/**
 * 番茄钟提示音的浏览器适配，见 docs/trd.md 8.6。
 * Web Audio 只在用户手势后创建，播放失败不影响计时。
 */

let audioContext: AudioContext | null = null;
let audioUnavailable = false;

/**
 * 在用户点击开始时调用，提前创建/恢复 AudioContext。
 * 浏览器若拦截自动播放，后续提示音播放失败也不会影响计时。
 */
export function primePomodoroAudio(): void {
  const context = resolveAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    void context.resume().catch(() => {});
  }
}

/** 阶段结束时播放三音提示；播放失败静默忽略。 */
export function playPomodoroChime(): void {
  const context = resolveAudioContext();
  if (!context) return;

  const schedule = (): void => {
    const startAt = context.currentTime + 0.02;
    const tones = [
      { frequency: 880, offset: 0, duration: 0.16 },
      { frequency: 1174.66, offset: 0.2, duration: 0.16 },
      { frequency: 1567.98, offset: 0.4, duration: 0.34 },
    ];

    for (const tone of tones) {
      const begin = startAt + tone.offset;
      const end = begin + tone.duration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, begin);
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(0.16, begin + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(begin);
      oscillator.stop(end + 0.02);
    }
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(schedule)
      .catch(() => {});
    return;
  }

  try {
    schedule();
  } catch {
    // 提示音失败不能阻塞阶段推进。
  }
}

function resolveAudioContext(): AudioContext | null {
  if (audioUnavailable || typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  const Constructor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Constructor) {
    audioUnavailable = true;
    return null;
  }

  try {
    audioContext = new Constructor();
  } catch {
    audioUnavailable = true;
    return null;
  }

  return audioContext;
}
