// タイピング回答の正誤判定(純関数)。
// シード辞書の表記規約: 中国語=声調記号付きピンイン(空白区切り)、
// タイ語=声調記号なしローマ字(ハイフン・空白あり得る)。
import type { Lang } from '../db/schema';

const PINYIN_TONED: Record<string, [string, number]> = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['v', 1], ǘ: ['v', 2], ǚ: ['v', 3], ǜ: ['v', 4],
  ü: ['v', 0],
};

/**
 * ピンインを「無声調の音節列 + 声調数字列」に正規化する。
 * 例: "nǐ hǎo" → { base: "nihao", tones: "33" }
 *     "ni3 hao3" → { base: "nihao", tones: "33" }
 *     "ni hao"  → { base: "nihao", tones: "" } (声調情報なし)
 */
export function normalizePinyin(input: string): { base: string; tones: string } {
  const s = input.toLowerCase().trim();
  let base = '';
  let tones = '';
  // 音節区切り(空白/アポストロフィ)ごとに声調を1つ拾う
  for (const syl of s.split(/[\s'’-]+/)) {
    if (!syl) continue;
    let tone = '';
    for (const ch of syl) {
      const toned = PINYIN_TONED[ch];
      if (toned) {
        base += toned[0];
        if (toned[1] > 0) tone = String(toned[1]);
      } else if (ch >= '1' && ch <= '5') {
        tone = ch === '5' ? '' : ch; // 軽声(5/0)は無声調扱い
      } else if (ch === '0') {
        tone = '';
      } else if (/[a-z]/.test(ch)) {
        base += ch;
      }
    }
    tones += tone;
  }
  return { base, tones };
}

/** タイ語ローマ字の正規化: 声調記号・長音記号・区切りを除去 */
export function normalizeThai(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // 結合ダイアクリティカル除去
    .replace(/[\s'’\-.]/g, '');
}

const HAN_RE = /[一-鿿]/;
const THAI_RE = /[฀-๿]/;

export interface CheckOptions {
  toneStrict: boolean; // 中国語: 声調まで一致を要求
}

/**
 * タイピング回答の判定。headword(原語表記)そのもの、または reading を受理。
 */
export function checkTypingAnswer(
  lang: Lang,
  answer: string,
  headword: string,
  reading: string,
  opts: CheckOptions = { toneStrict: false },
): boolean {
  const a = answer.trim();
  if (!a) return false;

  // 原語スクリプトでの回答はそのまま比較
  if (lang === 'zh' && HAN_RE.test(a)) return a === headword.trim();
  if (lang === 'th' && THAI_RE.test(a)) return a === headword.trim();

  if (lang === 'zh') {
    const ans = normalizePinyin(a);
    const ref = normalizePinyin(reading);
    if (ans.base !== ref.base) return false;
    if (!opts.toneStrict) return true;
    // 厳格モード: 回答に声調が含まれる場合のみ照合(無声調回答は不正解)
    return ans.tones === ref.tones;
  }
  return normalizeThai(a) === normalizeThai(reading);
}
