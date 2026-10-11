// 格クイズ: 「読む」で調べた語形について、格・数・性(名詞・形容詞)や時制・人称・数・性(動詞)を当てる。
// 形からも文脈からも決められないもの・その語形では区別しないものは出題せず、理由(excuse)を表示する。
import type { Word, WordExample, GrammarTags } from '../db/schema';

export type Dim = 'tense' | 'person' | 'case' | 'number' | 'gender';
export type CaseV = NonNullable<GrammarTags['case']>;
export type NumberV = NonNullable<GrammarTags['number']>;
export type GenderV = NonNullable<GrammarTags['gender']>;
export type TenseV = NonNullable<GrammarTags['tense']>;

export const DIM_LABEL: Record<Dim, string> = { tense: '時制', person: '人称', case: '格', number: '数', gender: '性' };

export const OPTIONS: Record<Dim, { value: string; label: string }[]> = {
  tense: [
    { value: 'past', label: '過去' },
    { value: 'present', label: '現在' },
    { value: 'future', label: '未来' },
  ],
  person: [
    { value: '1', label: '1人称' },
    { value: '2', label: '2人称' },
    { value: '3', label: '3人称' },
  ],
  case: [
    { value: 'nom', label: '主格' },
    { value: 'gen', label: '生格' },
    { value: 'dat', label: '与格' },
    { value: 'acc', label: '対格' },
    { value: 'ins', label: '造格' },
    { value: 'prep', label: '前置格' },
  ],
  number: [
    { value: 'sg', label: '単数' },
    { value: 'pl', label: '複数' },
  ],
  gender: [
    { value: 'm', label: '男性' },
    { value: 'f', label: '女性' },
    { value: 'n', label: '中性' },
  ],
};

export const valueLabel = (dim: Dim, v: string) => OPTIONS[dim].find((o) => o.value === v)?.label ?? v;

// ---------------- 文字列の文法情報 → 構造化タグ ----------------

const CASES: [RegExp, CaseV][] = [
  [/主格/, 'nom'],
  [/[生属]格/, 'gen'],
  [/与格/, 'dat'],
  [/対格/, 'acc'],
  [/造格/, 'ins'],
  [/前置格|位格/, 'prep'],
];

/** 文中で最初に出てくる格(「対格(主格と同形)」なら対格) */
function firstCase(text: string): CaseV | undefined {
  let best: { i: number; v: CaseV } | undefined;
  for (const [re, v] of CASES) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.i)) best = { i: m.index, v };
  }
  return best?.v;
}

export function parseGender(text?: string): GenderV | undefined {
  if (!text) return undefined;
  if (/男性/.test(text)) return 'm';
  if (/女性/.test(text)) return 'f';
  if (/中性/.test(text)) return 'n';
  return undefined;
}

/**
 * LLM が書いた語形の説明(例「対格・複数」「過去・女性単数」「現在・3人称単数」)をタグにする。
 * 古い例文(構造化タグが無い頃に保存したもの)用。
 */
export function parseForm(form: string): GrammarTags {
  const t: GrammarTags = {};
  if (!form) return t;
  const c = firstCase(form);
  if (c) t.case = c;
  // 「主格または対格」のように格が1つに決まっていない
  if (c && /または|もしくは|か\s*[主生属与対造前]|\bor\b|[/／]/.test(form) && CASES.filter(([re]) => re.test(form)).length > 1) {
    t.caseAmbiguous = true;
  }
  if (/複数/.test(form)) t.number = 'pl';
  else if (/単数/.test(form)) t.number = 'sg';
  const g = parseGender(form);
  if (g) t.gender = g;
  if (/過去/.test(form)) t.tense = 'past';
  else if (/現在/.test(form)) t.tense = 'present';
  else if (/未来/.test(form)) t.tense = 'future';
  else if (/不定形|不定詞|原形/.test(form)) t.tense = 'infinitive';
  else if (/命令/.test(form)) t.tense = 'imperative';
  const p = /([123１２３])\s*人称/.exec(form);
  if (p) t.person = String('１２３'.includes(p[1]) ? '１２３'.indexOf(p[1]) + 1 : p[1]) as GrammarTags['person'];
  if (/不変化|格変化しない|変化しない/.test(form)) t.indeclinable = true;
  if (/短語尾|短語形|短形/.test(form)) t.shortForm = true;
  return t;
}

// ---------------- 品詞の大分類 ----------------

export type PosClass = 'verb' | 'noun' | 'adj' | 'numeral' | 'other';

export function posClass(pos = ''): PosClass {
  if (/副動詞|助動詞/.test(pos)) return 'other';
  if (/形動詞|形容詞|序数/.test(pos)) return 'adj';
  if (/動詞/.test(pos)) return 'verb';
  if (/名詞/.test(pos)) return 'noun';
  if (/代名詞/.test(pos)) return 'adj'; // 格・数・性で変化する代名詞が多い(性が無いものは excuse になる)
  if (/数詞/.test(pos)) return 'numeral';
  return 'other';
}

// ---------------- 出題 ----------------

export interface AskedDim {
  dim: Dim;
  answer: string;
}
export interface ExcusedDim {
  dim: Dim;
  /** 分かっていれば表示する値(例: 不変化名詞の、文脈から決まる格) */
  value?: string;
  reason: string;
}

export interface CaseQuestion {
  key: string;
  word: Word;
  example: WordExample;
  posClass: PosClass;
  asked: AskedDim[];
  excused: ExcusedDim[];
}

/** 例文の構造化タグ(無ければ form の文字列から推定) */
export function tagsOf(word: Word, ex: WordExample): GrammarTags {
  // サーバーが構造化タグを返していればそれだけを使う(説明文の括弧書きなどを拾って混ぜないため)
  const t: GrammarTags = ex.tags ? { ...ex.tags } : parseForm(ex.form ?? '');
  // 名詞の性は語彙的な性質なので、語形の説明に無ければ辞書情報から補う
  if (!t.gender && posClass(word.pos) === 'noun') t.gender = parseGender(word.grammar?.gender);
  if (/不変化/.test(word.grammar?.notes ?? '') && posClass(word.pos) === 'noun') t.indeclinable = true;
  return t;
}

const genderWord = (g?: GenderV) => (g ? valueLabel('gender', g) : '');

/**
 * 1つの例文から問題を作る。出題できる次元が無ければ null。
 * 決められない・区別しない次元は excused に理由付きで入れる。
 */
export function buildQuestion(word: Word, ex: WordExample, index = 0): CaseQuestion | null {
  const cls = posClass(word.pos);
  if (cls === 'other') return null;
  const t = tagsOf(word, ex);
  const asked: AskedDim[] = [];
  const excused: ExcusedDim[] = [];
  const ask = (dim: Dim, v?: string, missing = 'この語形の情報が足りないため出題しません') => {
    if (v) asked.push({ dim, answer: v });
    else excused.push({ dim, reason: missing });
  };

  if (cls === 'verb') {
    if (t.tense === 'infinitive' || t.tense === 'imperative' || !t.tense) return null; // 不定形・命令形は対象外
    ask('tense', t.tense);
    if (t.tense === 'past') {
      ask('number', t.number);
      if (t.number === 'pl') {
        excused.push({ dim: 'gender', reason: '過去形の複数(-ли)は性で形が変わらない' });
      } else {
        ask('gender', t.gender, '性を判定できる情報が無いため出題しません');
      }
      excused.push({ dim: 'person', reason: '過去形は人称で形が変わらない(主語の性・数に合わせる)' });
    } else {
      ask('person', t.person);
      ask('number', t.number);
      excused.push({ dim: 'gender', reason: '現在形・未来形は性ではなく人称と数で変化する' });
    }
  } else {
    // 名詞・形容詞・数詞
    if (t.indeclinable) {
      excused.push({
        dim: 'case',
        value: t.case,
        reason: '不変化語なので語形からは格が分からない(文脈だけで決まる)',
      });
      excused.push({ dim: 'number', value: t.number, reason: '不変化語なので語形からは数が分からない' });
    } else if (t.shortForm) {
      excused.push({ dim: 'case', reason: '短語尾形は格変化しない(述語として使う形)' });
      ask('number', t.number);
    } else if (t.caseAmbiguous) {
      excused.push({ dim: 'case', reason: `文脈からも格が1つに決まらない(${ex.form ?? ''})` });
      ask('number', t.number);
    } else {
      ask('case', t.case);
      if (cls !== 'numeral') ask('number', t.number);
    }

    if (cls === 'numeral') {
      excused.push({ dim: 'gender', reason: '数詞は性で問わない' });
    } else if (t.number === 'pl') {
      excused.push({
        dim: 'gender',
        value: cls === 'noun' ? t.gender : undefined,
        reason:
          cls === 'noun'
            ? `複数形の語尾では性の区別が付かない${t.gender ? `(この語は${genderWord(t.gender)}名詞)` : ''}`
            : '複数形の形容詞・形動詞は性の区別がない',
      });
    } else if (cls === 'noun' && /ь$/.test(word.headword)) {
      excused.push({
        dim: 'gender',
        value: t.gender,
        reason: `辞書形が -ь で終わる名詞は語尾から性が分からない${t.gender ? `(この語は${genderWord(t.gender)}名詞)` : ''}`,
      });
    } else {
      ask('gender', t.gender, '性を判定できる情報が無いため出題しません');
    }
  }

  if (asked.length === 0) return null;
  return { key: `${word.id}:${index}:${ex.at}`, word, example: ex, posClass: cls, asked, excused };
}

/** 単語帳(ロシア語)の例文から問題を集める */
export function collectQuestions(words: Word[]): CaseQuestion[] {
  const qs: CaseQuestion[] = [];
  for (const w of words) {
    (w.examples ?? []).forEach((ex, i) => {
      const q = buildQuestion(w, ex, i);
      if (q) qs.push(q);
    });
  }
  return qs;
}

export function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 選んだ答えの採点。全次元正解で正解 */
export function grade(q: CaseQuestion, picked: Partial<Record<Dim, string>>) {
  const perDim = q.asked.map((a) => ({ ...a, picked: picked[a.dim], ok: picked[a.dim] === a.answer }));
  return { perDim, allOk: perDim.every((d) => d.ok) };
}
