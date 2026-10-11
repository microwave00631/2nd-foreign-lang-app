// vocab-reader: 語彙トレ PWA の「読む」画面用バックエンド(Supabase Edge Function)
//
//  POST { mode: "fetch", url }                       → { title, paragraphs: string[], url }
//      記事ページを取得して本文だけを取り出す(ブラウザから直接は CORS で取れないため)
//  POST { mode: "analyze", lang: "ru", word, sentence } → 単語の文法解説(下の ANALYSIS_TOOL の形)
//      長押しした単語を、その文の中での形として Claude に解説させる
//
//  認証: ヘッダ x-app-key が app_secrets.vocab_reader_key と一致すること
//  必要な Secrets: READER_ANTHROPIC_API_KEY(このアプリ専用のキー。無ければ ANTHROPIC_API_KEY を使う)
//  任意: READER_MODEL, READER_DAILY_LIMIT(解説の1日あたり上限。既定 300。日付は日本時間)
import { createClient } from "npm:@supabase/supabase-js@2";
import { Readability } from "npm:@mozilla/readability@0.5.0";
import { parseHTML } from "npm:linkedom@0.18.5";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODEL = Deno.env.get("READER_MODEL") ?? "claude-haiku-5-5";
// Haiku 5.5 は既定で考えてから答える。解説は速さ優先なので考えずに答えさせる
const THINKING = MODEL.startsWith("claude-haiku-5") ? { thinking: { type: "disabled" } } : {};
// スタックチャン等と請求・上限を分けられるよう、専用キーがあればそちらを使う
const API_KEY = Deno.env.get("READER_ANTHROPIC_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY");
const DAILY_LIMIT = Math.max(1, Number(Deno.env.get("READER_DAILY_LIMIT")) || 300);

/** 解説1回分の枠を取る。上限に達していたら false(DB の関数で数えるので同時アクセスでも超えない) */
async function takeQuota(): Promise<boolean> {
  const { data, error } = await db.rpc("vocab_reader_take", { p_limit: DAILY_LIMIT });
  if (error) {
    console.error(`quota: ${error.message}`);
    return false; // 数えられないときは使わせない(請求の暴走を防ぐ側に倒す)
  }
  return data != null;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-app-key",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

let cachedKey: string | null = null;
async function authorized(req: Request) {
  const key = req.headers.get("x-app-key");
  if (!key) return false;
  if (!cachedKey) {
    const { data } = await db.from("app_secrets").select("value").eq("name", "vocab_reader_key").single();
    cachedKey = data?.value ?? null;
  }
  return !!cachedKey && key === cachedKey;
}

// ---------------- 記事の取得 ----------------
const MAX_BYTES = 4_000_000;

function blockedHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true;
  if (h.includes(":")) return h === "::1" || /^(fc|fd|fe80|::ffff:)/.test(h); // IPv6 のループバック・内部
  return false;
}

function decode(buf: Uint8Array, contentType: string | null) {
  let charset = contentType?.match(/charset=([\w-]+)/i)?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(buf.subarray(0, 4096));
    charset = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  }
  try {
    return new TextDecoder(charset?.toLowerCase() ?? "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

async function fetchArticle(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return json({ error: "URL の形式が正しくありません" }, 400);
  }
  if (!/^https?:$/.test(url.protocol) || blockedHost(url.hostname)) return json({ error: "この URL は開けません" }, 400);

  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "user-agent": "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "accept-language": "ru,ja;q=0.8,en;q=0.6",
    },
  });
  if (!res.ok) return json({ error: `ページを取得できませんでした(HTTP ${res.status})` }, 502);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return json({ error: "ページが大きすぎます" }, 413);
  const html = decode(buf, res.headers.get("content-type"));

  const { document } = parseHTML(html);
  // 相対リンク等は使わないので base は不要。Readability は document を書き換えるので先に title を取る
  const fallbackTitle = clean(document.querySelector("title")?.textContent ?? "");
  const article = new Readability(document as unknown as Document).parse();
  if (!article?.content) return json({ error: "本文を見つけられませんでした" }, 422);

  const { document: body } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  const paragraphs: string[] = [];
  for (const el of body.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,figcaption,td")) {
    // 入れ子(li の中の p など)は内側だけを拾う
    if (el.querySelector("p,li,h1,h2,h3,h4,blockquote")) continue;
    const t = clean(el.textContent ?? "");
    if (t.length >= 2) paragraphs.push(t);
  }
  if (!paragraphs.length) {
    const t = clean(article.textContent ?? "");
    if (t) paragraphs.push(t);
  }
  const title = clean(article.title ?? "") || fallbackTitle;
  // 見出しより前に拾ったパンくず・日付などは捨てる(見出し自体は残す)
  const titleAt = title ? paragraphs.findIndex((p) => p === title) : -1;
  const body_ = titleAt > 0 && titleAt <= 8 ? paragraphs.slice(titleAt) : paragraphs;
  return json({ url: res.url || url.toString(), title, paragraphs: body_.slice(0, 400) });
}

// ---------------- 単語の解説 ----------------
const ANALYSIS_TOOL = {
  name: "report",
  description: "長押しされた単語の解説を報告する",
  input_schema: {
    type: "object",
    properties: {
      lemma: { type: "string", description: "辞書形(見出し語)。アクセント記号なし。固有名詞以外は小文字" },
      lemmaStressed: { type: "string", description: "辞書形にアクセント記号(U+0301)を付けたもの。例: погружа́ть" },
      pos: { type: "string", description: "品詞(日本語)。名詞/動詞/形容詞/副詞/前置詞/接続詞/代名詞/数詞/形動詞/副動詞/助詞 など" },
      meaningJa: { type: "string", description: "見出し語の代表的な訳。単語帳の見出しに使うので簡潔に(15字以内、複数なら・区切り)" },
      contextJa: { type: "string", description: "この文の中での意味(簡潔に)" },
      form: { type: "string", description: "この語形の文法情報。例: 対格・複数 / 現在・3人称単数 / 過去・女性単数 / 生格・単数。変化しない語は「不変化」" },
      formReason: { type: "string", description: "なぜこの文でこの形になっているか。前置詞・動詞の支配・主語との一致など、文中の根拠となる語を挙げて1〜2文で" },
      gender: { type: "string", description: "名詞なら 男性/女性/中性/複数のみ。活動体なら「・活動体」を付ける。名詞以外は空文字" },
      aspect: { type: "string", description: "動詞なら 不完了体/完了体/両体。動詞以外は空文字" },
      aspectPair: { type: "string", description: "動詞ならアスペクトの対になる動詞(アクセント付き)。なければ空文字" },
      government: { type: "string", description: "この語が要求する格・前置詞(支配)。例: что(対格)を во что(対格)へ / кому(与格)に。前置詞ならそれが要求する格と意味の違い。特になければ空文字" },
      notes: { type: "string", description: "学習者向けの補足(不規則変化、移動アクセント、よく使う結合など)。なければ空文字" },
      sentenceJa: { type: "string", description: "文全体の自然な日本語訳" },
    },
    required: ["lemma", "lemmaStressed", "pos", "meaningJa", "contextJa", "form", "formReason", "gender", "aspect", "aspectPair", "government", "notes", "sentenceJa"],
  },
};

const SYSTEM = `あなたは日本語話者にロシア語を教える文法の先生。学習者がロシア語の記事を読んでいて、知らない単語を長押しした。
必ず report ツールを1回だけ呼んで解説する(文章で返答しない)。
- 単語は「この文の中のこの形」として分析する。同じ綴りで複数の解釈があり得るとき(例: 単数生格と複数主格)は文脈から1つに決め、formReason でその根拠を述べる
- 用語は日本の教科書の用語(主格・生格・与格・対格・造格・前置格、不完了体・完了体、活動体)を使う
- 例文や語形にはアクセント記号(U+0301)を付けてよい。lemma だけはアクセント記号なし
- 確信がない点は推測と分かるように書く。存在しない語形や意味をでっち上げない`;

// モデルがアクセントをラテン文字の é などで書くことがある(ячéйка)。
// キリル文字の語の中に混ざったラテン文字をキリル文字+結合アクセント(U+0301)に直す
const LATIN_TO_CYR: Record<string, string> = { a: "а", e: "е", o: "о", y: "у", u: "у", i: "и", x: "х", c: "с", p: "р", A: "А", E: "Е", O: "О", Y: "У", X: "Х", C: "С", P: "Р" };
function fixStress(text: string) {
  return text.replace(/[\p{L}\p{M}]+/gu, (w) => {
    if (!/[\u0400-\u04ff]/.test(w)) return w; // キリル文字を含む語だけ
    return w.normalize("NFD").replace(/[A-Za-z]/g, (ch) => LATIN_TO_CYR[ch] ?? ch).replace(/\u0300/g, "\u0301").normalize("NFC");
  });
}

async function analyze(body: any) {
  const word = String(body.word ?? "").trim().slice(0, 60);
  const sentence = String(body.sentence ?? "").trim().slice(0, 800);
  const lang = String(body.lang ?? "ru");
  if (!word || !sentence) return json({ error: "word と sentence が必要です" }, 400);
  if (lang !== "ru") return json({ error: "未対応の言語です" }, 400);
  if (!API_KEY) return json({ error: "サーバーに API キーが設定されていません" }, 500);
  if (!(await takeQuota())) {
    return json({ error: `今日の解説の上限(${DAILY_LIMIT}回)に達しました。明日また使えます` }, 429);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      ...THINKING,
      system: SYSTEM,
      tools: [ANALYSIS_TOOL],
      messages: [{ role: "user", content: `文: ${sentence}\n長押しした単語: ${word}` }],
    }),
  });
  const out = await res.json();
  if (!res.ok) {
    console.error(`claude ${res.status}: ${JSON.stringify(out)}`);
    return json({ error: "解説を作れませんでした" }, 502);
  }
  const use = out.content?.find((c: any) => c.type === "tool_use" && c.name === "report");
  let result = use?.input;
  if (!result) {
    // ツールを呼ばずに JSON を文章で返したときの保険
    const text = out.content?.filter((c: any) => c.type === "text").map((c: any) => c.text).join("") ?? "";
    try {
      result = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    } catch {
      console.error(`no tool_use: ${text.slice(0, 300)}`);
      return json({ error: "解説を作れませんでした" }, 502);
    }
  }
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const unstress = (t: string) => t.normalize("NFD").replace(/[\u0300\u0301]/g, "").normalize("NFC");
  const stressed = fixStress(s(result.lemmaStressed));
  const lemma = unstress(fixStress(s(result.lemma))) || unstress(stressed) || word.toLowerCase();
  return json({
    word,
    lemma,
    lemmaStressed: stressed || lemma,
    pos: s(result.pos),
    meaningJa: s(result.meaningJa),
    contextJa: s(result.contextJa),
    form: s(result.form),
    formReason: s(result.formReason),
    gender: s(result.gender),
    aspect: s(result.aspect),
    aspectPair: fixStress(s(result.aspectPair)),
    government: s(result.government),
    notes: s(result.notes),
    sentenceJa: s(result.sentenceJa),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    if (!(await authorized(req))) return json({ error: "アクセスキーが違います(設定画面で確認してください)" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.mode === "fetch") return await fetchArticle(String(body.url ?? ""));
    if (body.mode === "analyze") return await analyze(body);
    return json({ error: "unknown mode" }, 400);
  } catch (e) {
    console.error(String(e));
    return json({ error: "サーバーでエラーが起きました" }, 502);
  }
});
