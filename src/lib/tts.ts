// SpeechSynthesis による発音再生。
// 方針:
//  - 端末に該当言語の音声が無くても speak() は u.lang 指定で発話を試みる(ボタンは無効化しない)。
//  - ユーザー操作の同期性を守るため、speak() 内では await せず、事前ロード済みの音声キャッシュを
//    同期参照する(iOS/一部ブラウザは非同期境界をまたぐと発話をブロックするため)。
import type { Lang } from '../db/schema';

const BCP47: Record<Lang, string> = { zh: 'zh-CN', th: 'th-TH' };

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
// speak() から同期参照するためのキャッシュ。loadVoices() の解決時に更新する。
let voiceCache: SpeechSynthesisVoice[] = [];

function refreshCache(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  voiceCache = voices;
  return voices;
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const got = speechSynthesis.getVoices();
    if (got.length > 0) return resolve(refreshCache(got));
    const onChange = () => {
      speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve(refreshCache(speechSynthesis.getVoices()));
    };
    speechSynthesis.addEventListener('voiceschanged', onChange);
    // voiceschanged が来ないエンジン対策
    setTimeout(() => resolve(refreshCache(speechSynthesis.getVoices())), 1500);
  });
  return voicesReady;
}

// 音声リストから lang に最も合う音声を選ぶ(純粋関数・同期)。
function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  const prefix = lang === 'zh' ? 'zh' : 'th';
  const exact = voices.find(
    (v) => v.lang.replace('_', '-').toLowerCase() === BCP47[lang].toLowerCase(),
  );
  if (exact) return exact;
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
}

export async function getVoice(lang: Lang): Promise<SpeechSynthesisVoice | null> {
  return pickVoice(await loadVoices(), lang);
}

export async function hasVoice(lang: Lang): Promise<boolean> {
  if (!('speechSynthesis' in window)) return false;
  return (await getVoice(lang)) !== null;
}

export interface SpeakResult {
  /** 発話を試みたか(speechSynthesis 自体が使えれば true)。 */
  attempted: boolean;
  /** 該当言語の音声が見つかったか。false でも発話自体は試みている。 */
  hadVoice: boolean;
}

/**
 * 発音を再生する。ユーザー操作のハンドラ内から同期的に呼ぶこと。
 * 音声が見つからなくても u.lang を指定して発話を試みる(OS 側のフォールバックに委ねる)。
 * 音声リストがまだ未ロードでも、ここでは await せずキャッシュを使い、裏で次回用にロードを進める。
 */
export function speak(text: string, lang: Lang): SpeakResult {
  if (!('speechSynthesis' in window)) return { attempted: false, hadVoice: false };
  // 次回以降のためにロードを進めておく(初回は空のことがある)。
  void loadVoices();
  const voice = pickVoice(voiceCache, lang);
  speechSynthesis.cancel(); // Chrome のキュー詰まり対策
  const u = new SpeechSynthesisUtterance(text);
  u.lang = BCP47[lang];
  if (voice) u.voice = voice;
  u.rate = 0.85;
  speechSynthesis.speak(u);
  return { attempted: true, hadVoice: voice !== null };
}
