import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Stage } from '../db/schema';
import { localDateKey } from '../lib/time';
import { useSettings } from '../context/SettingsContext';
import { SpeakButton } from '../components/SpeakButton';

const STAGE_LABEL: Record<Stage, string> = {
  new: '未学習',
  learning: '学習中',
  review: '復習中',
  mastered: '習得済み',
};

const FILTERS: ('all' | Stage)[] = ['all', 'new', 'learning', 'review', 'mastered'];

export function WordsPage() {
  const { settings } = useSettings();
  const [filter, setFilter] = useState<'all' | Stage>('all');
  const [expanded, setExpanded] = useState<number | null>(null);

  const words = useLiveQuery(
    async () => {
      const all = await db.words
        .where('[lang+headword]')
        .between([settings.activeLang, ''], [settings.activeLang, '￿'])
        .toArray();
      const filtered = filter === 'all' ? all : all.filter((w) => w.stage === filter);
      return filtered.sort((a, b) => b.addedAt - a.addedAt);
    },
    [settings.activeLang, filter],
    [],
  );

  const remove = async (id: number) => {
    await db.words.delete(id);
    await db.reviews.where('wordId').equals(id).delete();
  };

  return (
    <div>
      <h1>単語帳({words.length}語)</h1>
      <div className="filter-row">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'すべて' : STAGE_LABEL[f]}
          </button>
        ))}
      </div>
      {words.length === 0 && <p className="muted">単語がありません。クイズを始めるか、翻訳・検索から追加してください。</p>}
      {words.map((w) => (
        <div key={w.id}>
          <div className="word-row" onClick={() => setExpanded(expanded === w.id ? null : w.id!)}>
            <div className="w-main">
              <div className="w-head">{w.headword}</div>
              <div className="w-sub">
                {w.reading} ・ {w.meaningJa}
              </div>
            </div>
            <span className={`stage-chip stage-${w.stage}`}>{STAGE_LABEL[w.stage]}</span>
          </div>
          {expanded === w.id && (
            <div className="card" style={{ marginTop: 0 }}>
              <div className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.8 }}>
                {w.pos && <div>品詞: {w.pos}</div>}
                {w.level && <div>レベル: {w.level.toUpperCase()}</div>}
                <div>正答間隔: {w.intervalDays}日 / 易しさ: {w.easeFactor.toFixed(2)} / 失敗: {w.lapses}回</div>
                <div>次回復習: {w.dueAt > 0 ? localDateKey(w.dueAt) : '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <SpeakButton text={w.headword} lang={w.lang} />
                <button
                  className="btn-secondary"
                  style={{ color: 'var(--red)' }}
                  onClick={() => void remove(w.id!)}
                >
                  削除
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
