// 言語ごとの表示名・BCP47 などの一元管理
import type { Lang } from '../db/schema';

export const LANGS: Lang[] = ['zh', 'th', 'ru'];

export const LANG_LABEL: Record<Lang, string> = { zh: '中国語', th: 'タイ語', ru: 'ロシア語' };
export const LANG_FLAG: Record<Lang, string> = { zh: '🇨🇳', th: '🇹🇭', ru: '🇷🇺' };
export const BCP47: Record<Lang, string> = { zh: 'zh-CN', th: 'th-TH', ru: 'ru-RU' };

export const SCRIPT_RE: Record<Lang, RegExp> = {
  zh: /[一-鿿]/,
  th: /[฀-๿]/,
  ru: /[Ѐ-ӿ]/,
};

/** ロシア語の比較用正規化: アクセント記号を除き、ё→е、小文字化 */
export function normalizeRu(s: string): string {
  return s
    .normalize('NFD')
    .replace(/́|̀/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s'’\-.]/g, '');
}
