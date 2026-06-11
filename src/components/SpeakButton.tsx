import { useEffect, useState } from 'react';
import type { Lang } from '../db/schema';
import { hasVoice, speak } from '../lib/tts';

export function SpeakButton({ text, lang }: { text: string; lang: Lang }) {
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let alive = true;
    hasVoice(lang).then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, [lang]);

  return (
    <button
      className="speak-btn"
      disabled={!available}
      title={available ? '発音を再生' : 'この言語の音声がデバイスにありません'}
      onClick={() => void speak(text, lang)}
    >
      🔊
    </button>
  );
}
