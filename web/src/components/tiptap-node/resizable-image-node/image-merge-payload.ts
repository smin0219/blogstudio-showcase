import type { ImageMergePayload } from "@/components/tiptap-node/resizable-image-node/resizable-image-extension";

let pendingMergePayload: ImageMergePayload | null = null;

export function getPendingMergePayload(): ImageMergePayload | null {
  return pendingMergePayload;
}

export function setPendingMergePayload(
  payload: ImageMergePayload | null,
): void {
  pendingMergePayload = payload;
}

/** 드래그 중 단일 이미지 위 좌/우 인디케이터와 실제 drop 순서를 동일하게 맞추기 위한 상태 */
export type MergeDragHighlight = {
  targetPos: number;
  edge: "left" | "right";
};

let mergeDragHighlight: MergeDragHighlight | null = null;
const mergeDragHighlightListeners = new Set<() => void>();

export function getMergeDragHighlight(): MergeDragHighlight | null {
  return mergeDragHighlight;
}

export function setMergeDragHighlight(
  highlight: MergeDragHighlight | null,
): void {
  mergeDragHighlight = highlight;
  for (const cb of mergeDragHighlightListeners) {
    cb();
  }
}

export function subscribeMergeDragHighlight(cb: () => void): () => void {
  mergeDragHighlightListeners.add(cb);
  cb();
  return () => {
    mergeDragHighlightListeners.delete(cb);
  };
}

/** 개별 이미지 → 갤러리 삽입 슬롯 인디케이터 (캡처 dragover 와 handleImageMergeDrop 동기화) */
export type GalleryDropHighlight = {
  galleryPos: number;
  insertIndex: number;
  /** `.tiptap-image-gallery__container` 기준 px */
  indicatorX: number;
};

let galleryDropHighlight: GalleryDropHighlight | null = null;
const galleryDropHighlightListeners = new Set<() => void>();

export function getGalleryDropHighlight(): GalleryDropHighlight | null {
  return galleryDropHighlight;
}

export function setGalleryDropHighlight(
  highlight: GalleryDropHighlight | null,
): void {
  galleryDropHighlight = highlight;
  for (const cb of galleryDropHighlightListeners) {
    cb();
  }
}

export function subscribeGalleryDropHighlight(cb: () => void): () => void {
  galleryDropHighlightListeners.add(cb);
  cb();
  return () => {
    galleryDropHighlightListeners.delete(cb);
  };
}
