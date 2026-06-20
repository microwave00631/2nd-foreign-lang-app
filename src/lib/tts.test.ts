import { afterEach, describe, expect, it, vi } from 'vitest';

// speechSynthesis をモックして音声環境ごとの挙動を検証する。
// tts.ts は音声リストをモジュール内にキャッシュするため、各シナリオで
// vi.resetModules() + 動的 import('./tts') で読み直す(freshTts ヘルパ)。

function mockSynth(voiceLangs: string[]) {
  const voices = voiceLangs.map((lang) => ({
    lang,
    name: `voice-${lang}`,
    default: false,
    localService: true,
    voiceURI: lang,
  }));
  const spoken: SpeechSynthesisUtterance[] = [];
  (globalThis as any).window = globalThis;
  (globalThis as any).speechSynthesis = {
    getVoices: () => voices,
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: () => {},
    speak: (u: SpeechSynthesisUtterance) => spoken.push(u),
  };
  (globalThis as any).SpeechSynthesisUtterance = class {
    text: string;
    lang = '';
    voice: unknown = null;
    rate = 1;
    constructor(text: string) {
      this.text = text;
    }
  };
  return spoken;
}

async function freshTts() {
  vi.resetModules();
  return import('./tts');
}

afterEach(() => {
  delete (globalThis as any).speechSynthesis;
});

describe('音声の選択', () => {
  it('th-TH 音声があれば getVoice は一致を返す', async () => {
    mockSynth(['zh-CN', 'th-TH', 'en-US']);
    const tts = await freshTts();
    expect((await tts.getVoice('th'))?.lang).toBe('th-TH');
    expect(await tts.hasVoice('th')).toBe(true);
  });

  it('地域なし th 音声でも prefix で拾える', async () => {
    mockSynth(['zh-CN', 'th']);
    const tts = await freshTts();
    expect((await tts.getVoice('th'))?.lang).toBe('th');
  });

  it('th_TH(アンダースコア)表記でも一致する', async () => {
    mockSynth(['th_TH']);
    const tts = await freshTts();
    expect((await tts.getVoice('th'))?.lang).toBe('th_TH');
  });

  it('タイ語音声が無い端末では getVoice/hasVoice が false', async () => {
    mockSynth(['zh-CN', 'en-US', 'ja-JP']);
    const tts = await freshTts();
    expect(await tts.getVoice('th')).toBeNull();
    expect(await tts.hasVoice('th')).toBe(false);
  });
});

describe('speak()(ボタンを無効化しない方針)', () => {
  it('同期関数であること(Promise を返さない)', async () => {
    mockSynth(['th-TH']);
    const tts = await freshTts();
    await tts.hasVoice('th'); // 起動時のウォームアップ相当
    const ret = tts.speak('สวัสดี', 'th');
    expect(ret).not.toBeInstanceOf(Promise);
  });

  it('タイ語音声があれば voice を設定して発話し hadVoice=true', async () => {
    const spoken = mockSynth(['zh-CN', 'th-TH']);
    const tts = await freshTts();
    await tts.hasVoice('th'); // キャッシュを温める
    const ret = tts.speak('สวัสดี', 'th');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('th-TH');
    expect((spoken[0].voice as SpeechSynthesisVoice).lang).toBe('th-TH');
    expect(ret).toEqual({ attempted: true, hadVoice: true });
  });

  it('★音声が無くても u.lang=th-TH で発話を試み、hadVoice=false を返す', async () => {
    const spoken = mockSynth(['zh-CN']);
    const tts = await freshTts();
    await tts.hasVoice('th');
    const ret = tts.speak('สวัสดี', 'th');
    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('th-TH'); // 案内表示はこの hadVoice=false を使って出す
    expect(ret).toEqual({ attempted: true, hadVoice: false });
  });

  it('speechSynthesis 非対応環境では attempted=false', async () => {
    (globalThis as any).window = globalThis;
    delete (globalThis as any).speechSynthesis;
    const tts = await freshTts();
    expect(tts.speak('สวัสดี', 'th')).toEqual({ attempted: false, hadVoice: false });
  });
});
