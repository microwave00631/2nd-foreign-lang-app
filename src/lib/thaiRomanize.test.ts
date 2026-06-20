import { describe, expect, it } from 'vitest';
import { romanizeThai } from './thaiRomanize';

describe('romanizeThai(近似ローマ字化)', () => {
  it('辞書スタイルに一致する代表語', () => {
    // 長母音の重ね・有気音・声調なし
    expect(romanizeThai('ขอบคุณ').reading).toBe('khopkhun');
    // 入力に空白が無いと語境界は推定できない(辞書は 'sabaai dii' と分かち書き)
    expect(romanizeThai('สบายดี').reading).toBe('sabaaidii');
    expect(romanizeThai('ผม').reading).toBe('phom');
    expect(romanizeThai('เขา').reading).toBe('khao'); // เ◌า 結合母音
  });

  it('子音クラスタは固有母音を入れない(khr/kl…)', () => {
    expect(romanizeThai('ครับ').reading).toBe('khrap');
  });

  it('先導の無音子音を落とす(หน→n, อย→y)', () => {
    expect(romanizeThai('หมา').reading).toBe('maa'); // ห 無音
    expect(romanizeThai('อย่าง').reading).toBe('yaang'); // อย の อ 無音
  });

  it('声調記号は無視する', () => {
    expect(romanizeThai('ไม่').reading).toBe('mai');
  });

  it('変換できない文字は unmapped に集める(発話は試みる)', () => {
    const r = romanizeThai('ไม้ ๆ'); // ๆ(repetition)は未対応
    expect(r.unmapped).toContain('ๆ');
    expect(r.reading.length).toBeGreaterThan(0);
  });

  it('全角空白や非タイ文字はそのまま通す', () => {
    expect(romanizeThai('a ก').reading).toBe('a k');
  });
});
