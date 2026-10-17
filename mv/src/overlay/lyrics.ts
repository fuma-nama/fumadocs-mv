/**
 * Public lyric API for scenes (see docs/overlay.md).
 *
 *   import { lyricState, lyricLine, hints, drawLyric } from '../../overlay/lyrics';
 *
 * Timing comes from /music/timing.json lead notes when present, otherwise from the overlay's
 * provisional melody (also injected into f.e.audio.timing.events.lead) — same interface.
 */
export { hints, lyricState, lyricLine, lyricLines, sungText, moraLit, PRE_ROLL, POST_HOLD } from './state';
export type { Hints, OverlayExtra, LyricState, LyricStyleName, Corner } from './state';
export type { LineTiming, MoraTiming, CharTiming, Seg } from './timing';
export { realTiming } from './timing';
export { drawLyric, drawPreCell, drawBoxWord } from './styles';
export type { DrawLyricOpts } from './styles';
