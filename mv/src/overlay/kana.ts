/** Kana helpers: mora segmentation and loose romaji for aligning lyric notes. */

const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ']);

export const isSmallKana = (ch: string) => SMALL.has(ch);
export const isKana = (ch: string) => /[ぁ-ゟ゠-ヿ]/.test(ch);
export const isKanji = (ch: string) => /[㐀-鿿豈-﫿々〆]/.test(ch);
export const isPunct = (ch: string) => /[、。，．！？!?・…「」『』（）—―]/.test(ch);

/** Katakana → hiragana (ー is kept). */
export function toHira(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/** Split a kana reading into morae: small ゃゅょ… attach to the previous kana; っ, ん, ー are morae. */
export function splitMorae(kana: string): string[] {
  const out: string[] = [];
  for (const ch of kana) {
    if (SMALL.has(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

const ROMAJI: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'wo', ん: 'n', ゔ: 'vu',
};
const YOON: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };

function moraRomaji(m: string): string {
  const h = toHira(m);
  const base = ROMAJI[h[0]];
  if (!base) return h;
  if (h.length === 1) return base;
  const v = YOON[h[1]];
  if (!v) return base;
  // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja, ふぁ → fa
  if (base.endsWith('hi') || base === 'ji' || base === 'chi') return base.slice(0, -1) + v;
  if (base === 'fu') return 'f' + v;
  return base.slice(0, -1) + 'y' + v;
}

/** Romaji per mora (っ takes the next consonant, ー the previous vowel). */
export function romajiOf(morae: string[]): string[] {
  const r = morae.map((m) => (m === 'ー' || m === 'っ' || m === 'ッ' ? '' : moraRomaji(m)));
  for (let i = 0; i < morae.length; i++) {
    const m = morae[i];
    if (m === 'ー') r[i] = vowelOf(r[i - 1] ?? 'a');
    else if (m === 'っ' || m === 'ッ') r[i] = (r[i + 1] ?? 't')[0] ?? 't';
  }
  return r;
}

export function vowelOf(romaji: string): string {
  if (romaji === 'n') return 'n';
  const m = /[aiueo](?!.*[aiueo])/.exec(romaji);
  return m ? m[0] : '';
}

/** Loose comparison key for aligning external note data with our morae. */
export function romajiKey(s: string): string {
  const x = s.toLowerCase().replace(/[^a-z]/g, '');
  if (x === 'o') return 'wo';
  return x
    .replace(/^si$/, 'shi')
    .replace(/^ti$/, 'chi')
    .replace(/^tu$/, 'tsu')
    .replace(/^hu$/, 'fu')
    .replace(/^zi$/, 'ji')
    .replace(/^xtu$|^q$|^ltu$/, 't');
}
