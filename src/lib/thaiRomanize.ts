// タイ語 → ラテン文字(ローマ字)へのおおまかな変換。
// 注意: タイ語は綴りと発音の対応が複雑で、正確な音訳には音節分割が必要なため、
// これは「API追加時に読みの初期値を自動生成する」ための近似変換です(声調記号は無視)。
// 既存辞書(public/dict/th.json)の表記スタイルに寄せています:
//   長母音は重ねる(ี→ii, ู→uu)、有気音は kh/ph/th/ch、声調は付けない。
// 変換しきれない文字は unmapped に集めて呼び出し側へ返します。

export interface ThaiRomanizeResult {
  /** 近似ローマ字。空文字なら変換不能。 */
  reading: string;
  /** 変換できなかったタイ文字(重複なし、出現順)。 */
  unmapped: string[];
}

// 子音(頭子音 / 末子音)。
const CONSONANTS: Record<string, { init: string; final: string }> = {
  'ก': { init: 'k', final: 'k' }, // ก
  'ข': { init: 'kh', final: 'k' }, // ข
  'ฃ': { init: 'kh', final: 'k' }, // ฃ
  'ค': { init: 'kh', final: 'k' }, // ค
  'ฅ': { init: 'kh', final: 'k' }, // ฅ
  'ฆ': { init: 'kh', final: 'k' }, // ฆ
  'ง': { init: 'ng', final: 'ng' }, // ง
  'จ': { init: 'ch', final: 't' }, // จ
  'ฉ': { init: 'ch', final: 't' }, // ฉ
  'ช': { init: 'ch', final: 't' }, // ช
  'ซ': { init: 's', final: 't' }, // ซ
  'ฌ': { init: 'ch', final: 't' }, // ฌ
  'ญ': { init: 'y', final: 'n' }, // ญ
  'ฎ': { init: 'd', final: 't' }, // ฎ
  'ฏ': { init: 't', final: 't' }, // ฏ
  'ฐ': { init: 'th', final: 't' }, // ฐ
  'ฑ': { init: 'th', final: 't' }, // ฑ
  'ฒ': { init: 'th', final: 't' }, // ฒ
  'ณ': { init: 'n', final: 'n' }, // ณ
  'ด': { init: 'd', final: 't' }, // ด
  'ต': { init: 't', final: 't' }, // ต
  'ถ': { init: 'th', final: 't' }, // ถ
  'ท': { init: 'th', final: 't' }, // ท
  'ธ': { init: 'th', final: 't' }, // ธ
  'น': { init: 'n', final: 'n' }, // น
  'บ': { init: 'b', final: 'p' }, // บ
  'ป': { init: 'p', final: 'p' }, // ป
  'ผ': { init: 'ph', final: 'p' }, // ผ
  'ฝ': { init: 'f', final: 'p' }, // ฝ
  'พ': { init: 'ph', final: 'p' }, // พ
  'ฟ': { init: 'f', final: 'p' }, // ฟ
  'ภ': { init: 'ph', final: 'p' }, // ภ
  'ม': { init: 'm', final: 'm' }, // ม
  'ย': { init: 'y', final: 'i' }, // ย
  'ร': { init: 'r', final: 'n' }, // ร
  'ล': { init: 'l', final: 'n' }, // ล
  'ว': { init: 'w', final: 'o' }, // ว
  'ศ': { init: 's', final: 't' }, // ศ
  'ษ': { init: 's', final: 't' }, // ษ
  'ส': { init: 's', final: 't' }, // ส
  'ห': { init: 'h', final: '' }, // ห
  'ฬ': { init: 'l', final: 'n' }, // ฬ
  'อ': { init: '', final: '' }, // อ 母音キャリア(下で母音 'o' 処理)
  'ฮ': { init: 'h', final: '' }, // ฮ
};

// 子音の後ろ・上下に付く母音記号。
const TRAILING_VOWELS: Record<string, string> = {
  'ะ': 'a', // ะ
  'ั': 'a', // ั (mai han-akat)
  'า': 'aa', // า
  'ำ': 'am', // ำ (sara am)
  'ิ': 'i', // ิ
  'ี': 'ii', // ี
  'ึ': 'ue', // ึ
  'ื': 'uue', // ื
  'ุ': 'u', // ุ
  'ู': 'uu', // ู
  'ๅ': 'aa', // ๅ
};

// 子音の前に書くが発音は後ろ(前置母音)。前処理で子音の後ろへ移動する。
const LEADING_VOWELS: Record<string, string> = {
  'เ': 'e', // เ
  'แ': 'ae', // แ
  'โ': 'o', // โ
  'ใ': 'ai', // ใ
  'ไ': 'ai', // ไ
};

// 単独で母音になる文字。
const STANDALONE: Record<string, string> = {
  'ฤ': 'rue', // ฤ
  'ฦ': 'lue', // ฦ
};

const O_CARRIER = 'อ'; // อ
// 声調記号・短音記号・พินทุ → 無視
const TONE_MARKS = new Set(['่', '้', '๊', '๋', '็', 'ฺ']);
const GARAN = '์'; // ์ (thanthakhat): 直前の子音を無音化
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'; // ๐-๙

function isConsonant(c: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONSONANTS, c);
}
function isVowelSign(c: string): boolean {
  return c in TRAILING_VOWELS || c in LEADING_VOWELS;
}
function inThaiBlock(c: string): boolean {
  const cp = c.codePointAt(0) ?? 0;
  return cp >= 0x0e00 && cp <= 0x0e7f;
}

// 先導の無音子音を落とす:
//  - ห + 低class共鳴音(ง ญ น ม ย ร ล ว) は ห が無音(声調のみ): หน→n
//  - อ + ย は อ が無音: อย่าง→yang
const SILENT_H_NEXT = new Set(['ง', 'ญ', 'ณ', 'น', 'ม', 'ย', 'ร', 'ล', 'ว', 'ฬ']);
function dropSilentLeaders(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (c === 'ห' && next && SILENT_H_NEXT.has(next)) continue; // ห 無音
    if (c === O_CARRIER && next === 'ย') continue; // อย の อ 無音
    out += c;
  }
  return out;
}

// クラスタを作る流音(頭子音の直後)。固有母音 'a' を入れない。
const CLUSTER_LIQUIDS = new Set(['ร', 'ล', 'ว']);

/** 前置母音(เ แ โ ใ ไ)を直後の子音の後ろへ入れ替える(単一子音のみ対応)。 */
function reorderLeadingVowels(s: string): string {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (c in LEADING_VOWELS && next && isConsonant(next)) {
      out.push(next, c);
      i++;
      continue;
    }
    out.push(c);
  }
  return out.join('');
}

export function romanizeThai(input: string): ThaiRomanizeResult {
  const unmapped: string[] = [];
  const addUnmapped = (c: string) => {
    if (!unmapped.includes(c)) unmapped.push(c);
  };

  const s = reorderLeadingVowels(dropSilentLeaders(input.normalize('NFC')));
  let out = '';
  let lastWasVowel = false; // 直前に母音を出したか(末子音判定用)

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];

    if (c === ' ') {
      out += ' ';
      lastWasVowel = false;
      continue;
    }
    if (TONE_MARKS.has(c)) continue;
    if (c === GARAN) {
      out = out.replace(/(kh|ph|th|ng|ch|[a-z])$/i, '');
      lastWasVowel = false;
      continue;
    }
    if (THAI_DIGITS.includes(c)) {
      out += String(THAI_DIGITS.indexOf(c));
      continue;
    }
    if (c in STANDALONE) {
      out += STANDALONE[c];
      lastWasVowel = true;
      continue;
    }

    if (isConsonant(c)) {
      // อ が母音位置(直前に子音、母音未出力、次が母音記号でない)なら長母音 'o'
      if (c === O_CARRIER && !lastWasVowel && out.length > 0 && !isVowelSign(next ?? '')) {
        out += 'o';
        lastWasVowel = true;
        continue;
      }
      const map = CONSONANTS[c];
      const nextIsVowel = next ? isVowelSign(next) : false;
      if (lastWasVowel && !nextIsVowel) {
        out += map.final; // 末子音
        lastWasVowel = false;
      } else {
        out += map.init; // 頭子音
        const after = s[i + 2];
        if (next && isConsonant(next) && next !== O_CARRIER && !CLUSTER_LIQUIDS.has(next)) {
          if (after && isVowelSign(after)) {
            out += 'a'; // 固有母音 'a'(次子音が母音を伴う:sabaai)
          } else if (!after || after === ' ') {
            out += 'o'; // CVC 単音節の固有母音 'o'(phom, khon)
            lastWasVowel = true;
          }
        }
        // クラスタ(khr, kl, pl…)は固有母音を入れず頭子音を連結
        if (!lastWasVowel) lastWasVowel = false;
      }
      continue;
    }

    if (c in TRAILING_VOWELS) {
      out += TRAILING_VOWELS[c];
      lastWasVowel = true;
      continue;
    }

    // 前処理で子音の後ろへ移動された前置母音(เ แ โ ใ ไ)
    if (c in LEADING_VOWELS) {
      if (c === 'เ' && next === 'า') {
        out += 'ao'; // เ◌า の組合せ母音(เขา→khao)
        i++;
      } else {
        out += LEADING_VOWELS[c];
      }
      lastWasVowel = true;
      continue;
    }

    if (inThaiBlock(c)) addUnmapped(c); // ฯ ๆ ๛ など未対応
    else out += c; // 非タイ文字はそのまま
  }

  return { reading: out.replace(/\s+/g, ' ').trim(), unmapped };
}
