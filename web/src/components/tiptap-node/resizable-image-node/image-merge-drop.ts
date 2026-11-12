import type { Node, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { getNextLayoutAfterAdd } from "@/components/tiptap-node/image-gallery-node/image-gallery-node";
import type { ImageGalleryItem } from "@/components/tiptap-node/image-gallery-node/image-gallery-node-extension";
import {
  getGalleryDropHighlight,
  getMergeDragHighlight,
  getPendingMergePayload,
  setGalleryDropHighlight,
  setMergeDragHighlight,
  setPendingMergePayload,
} from "@/components/tiptap-node/resizable-image-node/image-merge-payload";
import type { ImageMergePayload } from "@/components/tiptap-node/resizable-image-node/resizable-image-extension";
import type { ImageLayoutType } from "@/components/tiptap-ui/image-layout-dialog/image-layout-dialog";

const MAX_GALLERY_COLUMNS = 3;

const GALLERY_HORIZONTAL_2: ImageLayoutType = "horizontal-2";

/**
 * ProseMirror 가 드롭 시 넘기는 slice 로부터 드래그 소스 resizableImage 위치를 복원한다.
 * (pendingMergePayload / dataTransfer 에 의존하지 않음)
 */
export function getMergePayloadFromSlice(
  state: EditorState,
  slice: Slice,
  moved: boolean,
): ImageMergePayload | null {
  if (!moved) return null;
  if (slice.openStart !== 0 || slice.openEnd !== 0) return null;
  if (slice.content.childCount !== 1) return null;
  const dragged = slice.content.firstChild;
  if (!dragged || dragged.type.name !== "resizableImage") return null;

  let fromPos: number | null = null;
  state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
    if (node.type.name === "resizableImage" && node.eq(dragged)) {
      fromPos = pos;
      return false;
    }
    return true;
  });

  if (fromPos == null) {
    const src = dragged.attrs.src as string;
    state.doc.nodesBetween(0, state.doc.content.size, (node, pos) => {
      if (node.type.name === "resizableImage" && node.attrs.src === src) {
        fromPos = pos;
        return false;
      }
      return true;
    });
  }

  if (fromPos == null) return null;

  return {
    src: dragged.attrs.src as string,
    alt: (dragged.attrs.alt as string | null) ?? null,
    title: (dragged.attrs.title as string | null) ?? null,
    fromPos,
    fromSize: dragged.nodeSize,
  };
}

/**
 * ProseMirror dragstart 가 dataTransfer 를 clear 한 뒤에도 view.dragging.slice 에 남는다.
 * (개별 이미지 드래그 중 dragover 하이라이트용 — pendingMergePayload 만으로는 부족할 수 있음)
 */
export function isDraggingSingleResizableImage(view: EditorView): boolean {
  const v = view as EditorView & {
    dragging?: { slice?: Slice } | null;
  };
  const d = v.dragging;
  if (!d?.slice) return false;
  const slice = d.slice;
  if (slice.openStart !== 0 || slice.openEnd !== 0) return false;
  if (slice.content.childCount !== 1) return false;
  const n = slice.content.firstChild;
  return n?.type.name === "resizableImage";
}

export type DropHighlightTarget =
  | { kind: "gallery"; root: Element }
  | { kind: "resizable"; container: Element };

/**
 * dragover 의 event.target 은 드래그 중 부정확할 수 있어 elementsFromPoint 로 판별한다.
 */
export function findDropHighlightTargetAt(
  editorDom: HTMLElement,
  clientX: number,
  clientY: number,
): DropHighlightTarget | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof Element)) continue;
    if (!editorDom.contains(node)) continue;
    const gal = node.closest(".tiptap-image-gallery");
    if (gal && editorDom.contains(gal)) {
      return { kind: "gallery", root: gal };
    }
    const res = node.closest(".resizable-image-container");
    if (res && editorDom.contains(res)) {
      return { kind: "resizable", container: res };
    }
  }
  return null;
}

function findClosestFromPoint(
  clientX: number,
  clientY: number,
  selector: string,
): Element | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (el instanceof Element) {
      const hit = el.closest(selector);
      if (hit) return hit;
    }
  }
  return null;
}

function resolveBlockNodeAtDrop(
  view: EditorView,
  event: DragEvent,
  typeName: "resizableImage" | "imageGallery",
): { pos: number; node: Node; dom: Element } | null {
  const cx = event.clientX;
  const cy = event.clientY;
  const selector =
    typeName === "resizableImage"
      ? ".resizable-image-wrapper"
      : ".tiptap-image-gallery";

  const fromStack = findClosestFromPoint(cx, cy, selector);
  if (fromStack) {
    const pos = view.posAtDOM(fromStack as HTMLElement, 0);
    if (pos != null && pos >= 0) {
      const node = view.state.doc.nodeAt(pos);
      if (node && node.type.name === typeName) {
        return { pos, node, dom: fromStack };
      }
    }
  }

  const coords = view.posAtCoords({ left: cx, top: cy });
  if (!coords) return null;
  const $pos = view.state.doc.resolve(coords.pos);
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d);
    if (n.type.name === typeName) {
      const pos = $pos.before(d);
      const dom = view.nodeDOM(pos);
      if (dom instanceof Element) {
        return { pos, node: n, dom };
      }
    }
  }
  return null;
}

/**
 * 좌/우 병합 판정은 flex 로 퍼진 `.resizable-image-wrapper` 가 아니라
 * 실제 이미지 박스인 `.resizable-image-container` 기준으로 한다 (UI 인디케이터와 동일).
 */
function getResizableImageDropSideRect(dom: Element): DOMRect {
  const container = dom.querySelector(".resizable-image-container");
  if (container instanceof HTMLElement) {
    return container.getBoundingClientRect();
  }
  return dom.getBoundingClientRect();
}

/**
 * 갤러리 DOM 과 image-gallery-node 의 computeExternalDropTarget 와 동일 규칙.
 * (삽입 인덱스 + 컨테이너 기준 인디케이터 X)
 */
export function getGalleryInsertIndexAndIndicatorX(
  galleryRoot: Element,
  clientX: number,
  currentImageCount: number,
): { insertIndex: number; indicatorX: number } | null {
  if (currentImageCount >= MAX_GALLERY_COLUMNS) return null;

  const container = galleryRoot.querySelector(
    ".tiptap-image-gallery__container",
  );
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const itemEls = Array.from(
    container.querySelectorAll<HTMLDivElement>(".tiptap-image-gallery__item"),
  );
  if (itemEls.length === 0) {
    return { insertIndex: 0, indicatorX: 0 };
  }

  for (let i = 0; i < itemEls.length; i++) {
    const rect = itemEls[i].getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    if (clientX < midX) {
      return {
        insertIndex: i,
        indicatorX: rect.left - containerRect.left,
      };
    }
  }
  const lastRect = itemEls[itemEls.length - 1].getBoundingClientRect();
  return {
    insertIndex: itemEls.length,
    indicatorX: lastRect.right - containerRect.left,
  };
}

function computeGalleryInsertIndex(
  galleryRoot: Element,
  clientX: number,
  currentImageCount: number,
): number | null {
  const r = getGalleryInsertIndexAndIndicatorX(
    galleryRoot,
    clientX,
    currentImageCount,
  );
  return r ? r.insertIndex : null;
}

function buildMergeTwoResizableImagesTransaction(
  state: EditorState,
  payload: ImageMergePayload,
  targetPos: number,
  targetNode: Node,
  dropToLeft: boolean,
): Transaction | null {
  if (payload.fromPos === targetPos) return null;

  const targetItem = {
    src: targetNode.attrs.src as string,
    alt: (targetNode.attrs.alt as string | null | undefined) ?? undefined,
    title: (targetNode.attrs.title as string | null | undefined) ?? undefined,
  };
  const draggedItem = {
    src: payload.src,
    alt: payload.alt ?? undefined,
    title: payload.title ?? undefined,
  };
  const orderedImages = dropToLeft
    ? [draggedItem, targetItem]
    : [targetItem, draggedItem];

  const galleryNode = state.schema.nodes.imageGallery.create({
    images: orderedImages,
    layout: GALLERY_HORIZONTAL_2,
  });

  const draggedRange = {
    from: payload.fromPos,
    to: payload.fromPos + payload.fromSize,
  };
  const targetNodeSize = targetNode.nodeSize;

  const tr = state.tr;
  if (payload.fromPos > targetPos) {
    tr.delete(draggedRange.from, draggedRange.to);
    tr.replaceWith(targetPos, targetPos + targetNodeSize, galleryNode);
  } else {
    tr.delete(draggedRange.from, draggedRange.to);
    const adjustedTargetFrom = targetPos - payload.fromSize;
    const adjustedTargetTo = adjustedTargetFrom + targetNodeSize;
    tr.replaceWith(adjustedTargetFrom, adjustedTargetTo, galleryNode);
  }
  return tr;
}

/**
 * editorProps.handleDrop 에서 호출: slice+moved 로 소스를 알 수 있을 때 병합.
 * pendingMergePayload 는 slice 복원 실패 시 보조.
 */
export function handleImageMergeDrop(
  view: EditorView,
  event: DragEvent,
  slice: Slice,
  moved: boolean,
): boolean {
  const payload =
    getMergePayloadFromSlice(view.state, slice, moved) ??
    getPendingMergePayload();
  if (!payload) return false;

  const galleryResolved = resolveBlockNodeAtDrop(view, event, "imageGallery");
  if (galleryResolved) {
    const {
      pos: galleryPos,
      node: galleryPmNode,
      dom: galleryRoot,
    } = galleryResolved;

    const images: ImageGalleryItem[] = galleryPmNode.attrs.images ?? [];
    const layout: ImageLayoutType =
      galleryPmNode.attrs.layout ?? "horizontal-2";

    if (images.length >= MAX_GALLERY_COLUMNS) return false;

    const hlGallery = getGalleryDropHighlight();
    const insertIndex =
      hlGallery !== null && hlGallery.galleryPos === galleryPos
        ? hlGallery.insertIndex
        : (computeGalleryInsertIndex(
            galleryRoot,
            event.clientX,
            images.length,
          ) ?? images.length);

    const newImage: ImageGalleryItem = {
      src: payload.src,
      alt: payload.alt ?? undefined,
      title: payload.title ?? undefined,
    };

    const nextImages = [...images];
    nextImages.splice(insertIndex, 0, newImage);
    const nextLayout = getNextLayoutAfterAdd(layout, nextImages.length);

    const draggedRange = {
      from: payload.fromPos,
      to: payload.fromPos + payload.fromSize,
    };

    const tr = view.state.tr;
    if (payload.fromPos > galleryPos) {
      tr.delete(draggedRange.from, draggedRange.to);
      tr.setNodeMarkup(galleryPos, undefined, {
        ...galleryPmNode.attrs,
        images: nextImages,
        layout: nextLayout,
      });
    } else {
      tr.setNodeMarkup(galleryPos, undefined, {
        ...galleryPmNode.attrs,
        images: nextImages,
        layout: nextLayout,
      });
      tr.delete(draggedRange.from, draggedRange.to);
    }

    view.dispatch(tr);
    setPendingMergePayload(null);
    setMergeDragHighlight(null);
    setGalleryDropHighlight(null);
    return true;
  }

  const resolved = resolveBlockNodeAtDrop(view, event, "resizableImage");
  if (!resolved) return false;

  const { pos: targetPos, node: targetNode, dom } = resolved;

  if (payload.fromPos === targetPos) return false;

  const hl = getMergeDragHighlight();
  let dropToLeft: boolean;
  if (hl !== null && hl.targetPos === targetPos) {
    dropToLeft = hl.edge === "left";
  } else {
    const rect = getResizableImageDropSideRect(dom);
    dropToLeft = event.clientX < rect.left + rect.width / 2;
  }

  const tr = buildMergeTwoResizableImagesTransaction(
    view.state,
    payload,
    targetPos,
    targetNode,
    dropToLeft,
  );
  if (!tr) return false;

  view.dispatch(tr);
  setPendingMergePayload(null);
  setMergeDragHighlight(null);
  setGalleryDropHighlight(null);
  return true;
}
