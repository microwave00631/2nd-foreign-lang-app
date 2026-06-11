import { describe, expect, it } from 'vitest';
import { checkTypingAnswer, normalizePinyin, normalizeThai } from './answer';

describe('normalizePinyin', () => {
  it('声調記号を分解する', () => {
    expect(normalizePinyin('nǐ hǎo')).toEqual({ base: 'nihao', tones: '33' });
    expect(normalizePinyin('xièxie')).toEqual({ base: 'xiexie', tones: '4' });
  });
  it('声調数字を受理する', () => {
    expect(normalizePinyin('ni3 hao3')).toEqual({ base: 'nihao', tones: '33' });
  });
  it('無声調はトーンなし', () => {
    expect(normalizePinyin('ni hao')).toEqual({ base: 'nihao', tones: '' });
  });
  it('ü → v に正規化', () => {
    expect(normalizePinyin("nǚ'ér").base).toBe('nver');
  });
});

describe('normalizeThai', () => {
  it('空白・ハイフン・大小文字を無視', () => {
    expect(normalizeThai('Sawat-dii')).toBe('sawatdii');
    expect(normalizeThai('mai pen rai')).toBe('maipenrai');
  });
});

describe('checkTypingAnswer (zh)', () => {
  const head = '你好';
  const reading = 'nǐ hǎo';
  it('声調記号付きで正解', () => {
    expect(checkTypingAnswer('zh', 'nǐ hǎo', head, reading)).toBe(true);
  });
  it('声調数字で正解', () => {
    expect(checkTypingAnswer('zh', 'ni3 hao3', head, reading)).toBe(true);
  });
  it('無声調でも非厳格なら正解', () => {
    expect(checkTypingAnswer('zh', 'ni hao', head, reading)).toBe(true);
    expect(checkTypingAnswer('zh', 'nihao', head, reading)).toBe(true);
  });
  it('厳格モードでは声調必須', () => {
    expect(checkTypingAnswer('zh', 'ni hao', head, reading, { toneStrict: true })).toBe(false);
    expect(checkTypingAnswer('zh', 'ni3 hao3', head, reading, { toneStrict: true })).toBe(true);
    expect(checkTypingAnswer('zh', 'ni2 hao3', head, reading, { toneStrict: true })).toBe(false);
  });
  it('漢字そのものも正解', () => {
    expect(checkTypingAnswer('zh', '你好', head, reading)).toBe(true);
    expect(checkTypingAnswer('zh', '你坏', head, reading)).toBe(false);
  });
  it('間違った音節は不正解', () => {
    expect(checkTypingAnswer('zh', 'ni hen', head, reading)).toBe(false);
  });
});

describe('checkTypingAnswer (th)', () => {
  const head = 'สวัสดี';
  const reading = 'sawatdii';
  it('ローマ字で正解(大小文字・空白無視)', () => {
    expect(checkTypingAnswer('th', 'Sawatdii', head, reading)).toBe(true);
    expect(checkTypingAnswer('th', 'sawat dii', head, reading)).toBe(true);
  });
  it('タイ文字そのものも正解', () => {
    expect(checkTypingAnswer('th', 'สวัสดี', head, reading)).toBe(true);
  });
  it('違う語は不正解', () => {
    expect(checkTypingAnswer('th', 'khopkhun', head, reading)).toBe(false);
  });
  it('空文字は不正解', () => {
    expect(checkTypingAnswer('th', '  ', head, reading)).toBe(false);
  });
});
