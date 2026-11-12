/**
 * 이미지 위에 부착되는 이모티콘 스티커.
 * - 좌표/크기는 모두 이미지 크기에 대한 % — 이미지가 리사이즈되어도 상대 위치 유지
 */
export interface ImageSticker {
  id: string;
  emoji: string;
  /** 스티커 중심의 가로 위치 (이미지 너비 %) */
  x: number;
  /** 스티커 중심의 세로 위치 (이미지 높이 %) */
  y: number;
  /** 스티커 너비 (이미지 너비 %) */
  size: number;
}

export const STICKER_MIN_SIZE = 4;
export const STICKER_MAX_SIZE = 50;
export const STICKER_DEFAULT_SIZE = 14;

export function createSticker(emoji: string): ImageSticker {
  return {
    id: `stk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    emoji,
    x: 50,
    y: 50,
    size: STICKER_DEFAULT_SIZE,
  };
}

export function parseStickersAttr(raw: string | null): ImageSticker[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (s): s is ImageSticker =>
        s &&
        typeof s.id === "string" &&
        typeof s.emoji === "string" &&
        typeof s.x === "number" &&
        typeof s.y === "number" &&
        typeof s.size === "number",
    );
  } catch {
    return [];
  }
}
