// 内蔵辞書(public/dict/*.json)を初回起動時に IndexedDB へ取り込む。
// dictVersionImported でバージョンゲートし、再インポートは version 更新時のみ。
import { db, getSettings, saveSettings, type DictEntry, type Lang } from './schema';

interface RawDictFile {
  lang: Lang;
  version: number;
  entries: {
    h: string; // headword
    r: string; // reading
    m: string; // meaningJa
    p?: string; // pos
    lv: string; // level
    t?: string[]; // tags
  }[];
}

const DICT_URLS: Record<Lang, string> = {
  zh: `${import.meta.env.BASE_URL}dict/zh.json`,
  th: `${import.meta.env.BASE_URL}dict/th.json`,
};

async function importLang(lang: Lang): Promise<void> {
  const settings = await getSettings();
  let raw: RawDictFile;
  try {
    const res = await fetch(DICT_URLS[lang]);
    if (!res.ok) return;
    raw = await res.json();
  } catch {
    return; // オフラインかつ未precacheの場合のみ。次回起動で再試行。
  }
  if (raw.version <= settings.dictVersionImported[lang]) return;

  const rows: DictEntry[] = raw.entries.map((e, i) => ({
    lang,
    headword: e.h,
    reading: e.r,
    meaningJa: e.m,
    pos: e.p,
    level: e.lv,
    levelOrder: i, // 配列順 = 学習優先順
    tags: e.t ?? [],
  }));

  await db.transaction('rw', db.dictionary, async () => {
    await db.dictionary.where('[lang+headword]').between([lang, ''], [lang, '￿']).delete();
    await db.dictionary.bulkAdd(rows);
  });
  await saveSettings({
    dictVersionImported: { ...settings.dictVersionImported, [lang]: raw.version },
  });
}

export async function seedDictionaries(): Promise<void> {
  await importLang('zh');
  await importLang('th');
}
