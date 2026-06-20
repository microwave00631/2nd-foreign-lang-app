import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../db/schema';
import { hasVoice, speak } from '../lib/tts';

const LANG_LABEL: Record<Lang, string> = { zh: '中国語', th: 'タイ語' };

export function SpeakButton({ text, lang }: { text: string; lang: Lang }) {
  // 音声の有無は「案内表示の判断」にのみ使い、ボタンは無効化しない。
  const [available, setAvailable] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let alive = true;
    // 起動時に音声リストを温めておく(speak() がキャッシュを同期参照できるように)。
    hasVoice(lang).then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, [lang]);

  useEffect(() => () => clearTimeout(hintTimer.current), []);

  function onClick() {
    // ユーザー操作と同じ同期フレームで発話する(iOS等のブロック回避)。
    const { hadVoice } = speak(text, lang);
    if (!hadVoice) {
      setAvailable(false);
      setShowHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setShowHint(false), 4000);
    }
  }

  return (
    <span className="speak-wrap">
      <button
        className="speak-btn"
        title={available === false ? `${LANG_LABEL[lang]}の音声がこの端末にありません` : '発音を再生'}
        onClick={onClick}
      >
        🔊
      </button>
      {showHint && (
        <span className="speak-hint" role="status">
          この端末に{LANG_LABEL[lang]}の音声がないため再生できません。OSの設定で{LANG_LABEL[lang]}の音声を追加してください。
        </span>
      )}
    </span>
  );
}
