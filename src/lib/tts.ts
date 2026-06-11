// SpeechSynthesis による発音再生。音声がない環境では speak() が false を返す。
import type { Lang } from '../db/schema';

const BCP47: Record<Lang, string> = { zh: 'zh-CN', th: 'th-TH' };

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const got = speechSynthesis.getVoices();
    if (got.length > 0) return resolve(got);
    const onChange = () => {
      speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener('voiceschanged', onChange);
    // voiceschanged が来ないエンジン対策
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });
  return voicesReady;
}

export async function getVoice(lang: Lang): Promise<SpeechSynthesisVoice | null> {
  const voices = await loadVoices();
  const prefix = lang === 'zh' ? 'zh' : 'th';
  // zh は zh-CN を優先、なければ zh-* で妥協
  const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === BCP47[lang].toLowerCase());
  if (exact) return exact;
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
}

export async function hasVoice(lang: Lang): Promise<boolean> {
  if (!('speechSynthesis' in window)) return false;
  return (await getVoice(lang)) !== null;
}

/** ユーザー操作のハンドラ内から呼ぶこと(iOS要件)。音声が見つからなくても lang 指定で試行する。 */
export async function speak(text: string, lang: Lang): Promise<boolean> {
  if (!('speechSynthesis' in window)) return false;
  const voice = await getVoice(lang);
  speechSynthesis.cancel(); // Chrome のキュー詰まり対策
  const u = new SpeechSynthesisUtterance(text);
  u.lang = BCP47[lang];
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
  return voice !== null;
}
