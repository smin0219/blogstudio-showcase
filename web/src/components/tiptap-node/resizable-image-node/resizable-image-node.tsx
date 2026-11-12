"use client";

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import * as React from "react";
import { requestImageEdit } from "@/components/editor/image-editor-bridge";
import { getNextLayoutAfterDelete } from "@/components/tiptap-node/image-gallery-node/image-gallery-node";
import type { ImageGalleryItem } from "@/components/tiptap-node/image-gallery-node/image-gallery-node-extension";
import {
  getMergeDragHighlight,
  setMergeDragHighlight,
  setPendingMergePayload,
  subscribeMergeDragHighlight,
} from "@/components/tiptap-node/resizable-image-node/image-merge-payload";
import {
  clearImageMultiSelection,
  toggleImageMultiSelection,
  useImageMultiSelection,
} from "@/components/tiptap-node/resizable-image-node/image-multi-selection-store";
import {
  countResizableImagesInDoc,
  isSelectAllDocumentSelection,
} from "@/components/tiptap-node/resizable-image-node/image-selection-utils";
import { ImageStickerLayer } from "@/components/tiptap-node/resizable-image-node/image-sticker-layer";
import {
  createSticker,
  type ImageSticker,
} from "@/components/tiptap-node/resizable-image-node/image-sticker-types";
import {
  IMAGE_GALLERY_EXTRACT_MIME,
  type ImageGalleryExtractPayload,
} from "@/components/tiptap-node/resizable-image-node/resizable-image-extension";
import { EmojiPickerPopover } from "@/components/tiptap-ui/emoji-picker-popover";
import { ImageGalleryAlignToolbar } from "@/components/tiptap-ui/image-gallery-bubble-menu/image-gallery-bubble-menu";
import type { ImageLayoutType } from "@/components/tiptap-ui/image-layout-dialog/image-layout-dialog";
import "@/components/tiptap-node/resizable-image-node/resizable-image-node.scss";

type ResizeDirection = "nw" | "ne" | "sw" | "se";

/** 드롭 위치 인디케이터 노출 영역 */
type DropEdge = "left" | "right" | null;

export const ResizableImageComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
  deleteNode,
}) => {
  const { src, alt, title, width, height, align } = node.attrs;
  const stickers = (node.attrs.stickers ?? []) as ImageSticker[];
  const caption = (node.attrs.caption as string) || "";
  /** 캡션 입력 중 로컬 값 (blur 시 커밋 — 키 입력마다 트랜잭션/undo 오염 방지) */
  const [captionDraft, setCaptionDraft] = React.useState<string | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const [isResizing, setIsResizing] = React.useState(false);
  /** 방금 추가한 스티커를 바로 선택 상태로 만들기 위한 id */
  const [lastAddedStickerId, setLastAddedStickerId] = React.useState<
    string | null
  >(null);
  const [aspectRatio, setAspectRatio] = React.useState(1);
  const [maxWidth, setMaxWidth] = React.useState(1200);

  // 다른 resizableImage가 이 이미지 위로 드래그될 때 활성화될 드롭 인디케이터 (simple-editor 캡처 dragover 와 동기화)
  const [dropEdge, setDropEdge] = React.useState<DropEdge>(null);

  // --- 다중 선택 상태 ---
  // 현재 노드의 ProseMirror pos (Shift/Cmd 클릭 다중 선택 키)
  const currentPos = typeof getPos === "function" ? getPos() : undefined;
  const multiSelection = useImageMultiSelection();

  React.useEffect(() => {
    return subscribeMergeDragHighlight(() => {
      const h = getMergeDragHighlight();
      if (currentPos === undefined) {
        setDropEdge(null);
        return;
      }
      if (!h || h.targetPos !== currentPos) {
        setDropEdge(null);
        return;
      }
      setDropEdge(h.edge);
    });
  }, [currentPos]);
  const isMultiSelected =
    currentPos !== undefined && multiSelection.has(currentPos);

  /** 다중 선택(2+)이면 마지막 NodeSelection 이미지에도 개별 정렬/리사이즈 크롬을 숨긴다. */
  const hideChromeForMulti = multiSelection.size >= 2 && isMultiSelected;
  /** 전체 선택(Ctrl+A)이고 이미지가 2개 이상이면 각 노드뷰의 개별 버블(툴바)을 숨긴다. */
  const hideChromeForSelectAll =
    isSelectAllDocumentSelection(editor.state) &&
    countResizableImagesInDoc(editor.state.doc) >= 2;
  const showIndividualChrome =
    selected && !hideChromeForMulti && !hideChromeForSelectAll;

  const startResizeRef = React.useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    direction: ResizeDirection;
  } | null>(null);

  React.useEffect(() => {
    const updateMaxWidth = () => {
      if (wrapperRef.current) {
        const parent = wrapperRef.current.closest(
          ".simple-editor-content, .tiptap",
        );
        if (parent) {
          const parentStyle = getComputedStyle(parent);
          const parentWidth =
            parent.clientWidth -
            parseFloat(parentStyle.paddingLeft) -
            parseFloat(parentStyle.paddingRight);
          setMaxWidth(parentWidth);
        }
      }
    };
    updateMaxWidth();
    window.addEventListener("resize", updateMaxWidth);
    return () => window.removeEventListener("resize", updateMaxWidth);
  }, []);

  React.useEffect(() => {
    if (imageRef.current && imageRef.current.naturalWidth) {
      setAspectRatio(
        imageRef.current.naturalWidth / imageRef.current.naturalHeight,
      );
    }
  }, [src]);

  const handleImageLoad = () => {
    if (imageRef.current) {
      setAspectRatio(
        imageRef.current.naturalWidth / imageRef.current.naturalHeight,
      );
    }
  };

  const handleResizeStart = (
    e: React.MouseEvent,
    direction: ResizeDirection,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const currentWidth = width || imageRef.current?.offsetWidth || 300;
    const currentHeight = height || imageRef.current?.offsetHeight || 200;

    startResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      direction,
    };

    setIsResizing(true);

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = React.useCallback(
    (e: MouseEvent) => {
      if (!startResizeRef.current) return;

      const { startX, startWidth, direction } = startResizeRef.current;

      let deltaX = e.clientX - startX;

      // 방향에 따라 delta 조정
      if (direction === "nw" || direction === "sw") {
        deltaX = -deltaX;
      }

      const newWidth = Math.max(100, Math.min(startWidth + deltaX, maxWidth));
      const newHeight = Math.round(newWidth / aspectRatio);

      updateAttributes({
        width: newWidth,
        height: newHeight,
      });
    },
    [aspectRatio, updateAttributes, maxWidth],
  );

  const handleResizeEnd = React.useCallback(() => {
    setIsResizing(false);
    startResizeRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  }, [handleResizeMove]);

  React.useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  // --- 이미지 합치기 드래그 (페이로드는 파일 상단 모듈 변수) ---
  const handleNativeDragStart = (_e: React.DragEvent<HTMLDivElement>) => {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (pos === undefined) return;

    setPendingMergePayload({
      src,
      alt: alt ?? null,
      title: title ?? null,
      fromPos: pos,
      fromSize: node.nodeSize,
    });
  };

  /**
   * 드롭 처리 — 갤러리에서 추출한 이미지를 현재 단일 이미지와 묶기
   *
   * 단일 resizableImage 끼리 / 단일 → 갤러리 병합은 ProseMirror `handleDrop`(simple-editor)에서 처리.
   */
  const handleNativeDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const extractRaw = e.dataTransfer.getData(IMAGE_GALLERY_EXTRACT_MIME);
    // 단일↔단일 병합은 ProseMirror handleDrop 에서 처리 — 여기서는 갤러리 추출만 다룸.
    // extractRaw 가 없을 때 하이라이트를 지우면 PM 병합 직전에 상태가 사라지므로 지우지 않는다.
    if (!extractRaw) {
      return;
    }

    if (typeof getPos !== "function") {
      return;
    }
    const targetPos = getPos();
    if (targetPos === undefined) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const hl = getMergeDragHighlight();
    let dropToLeft: boolean;
    if (hl !== null && hl.targetPos === targetPos) {
      dropToLeft = hl.edge === "left";
    } else {
      const container = wrapperRef.current?.querySelector(
        ".resizable-image-container",
      );
      if (container) {
        const rect = container.getBoundingClientRect();
        dropToLeft = e.clientX < rect.left + rect.width / 2;
      } else {
        dropToLeft = false;
      }
    }

    const targetItem: ImageGalleryItem = {
      src,
      alt: alt ?? undefined,
      title: title ?? undefined,
    };
    const galleryLayout: ImageLayoutType = "horizontal-2";

    let payload: ImageGalleryExtractPayload;
    try {
      payload = JSON.parse(extractRaw) as ImageGalleryExtractPayload;
    } catch {
      return;
    }

    const sourceGalleryNode = editor.state.doc.nodeAt(payload.fromGalleryPos);
    if (!sourceGalleryNode || sourceGalleryNode.type.name !== "imageGallery") {
      return;
    }

    const sourceImages: ImageGalleryItem[] = sourceGalleryNode.attrs.images;
    const sourceLayout: ImageLayoutType = sourceGalleryNode.attrs.layout;
    const remainingSourceImages = sourceImages.filter(
      (_, i) => i !== payload.fromGalleryIndex,
    );

    const draggedItem: ImageGalleryItem = {
      src: payload.src,
      alt: payload.alt ?? undefined,
      title: payload.title ?? undefined,
    };
    const orderedImages = dropToLeft
      ? [draggedItem, targetItem]
      : [targetItem, draggedItem];

    const imageGalleryType = editor.schema.nodes.imageGallery;
    const newGalleryNode = imageGalleryType.create({
      images: orderedImages,
      layout: galleryLayout,
    });

    const resizableImageType = editor.schema.nodes.resizableImage;

    const sourceGalleryPos = payload.fromGalleryPos;
    const sourceGallerySize = sourceGalleryNode.nodeSize;

    const tr = editor.state.tr;

    const updateSourceGallery = () => {
      if (remainingSourceImages.length === 0) {
        tr.delete(sourceGalleryPos, sourceGalleryPos + sourceGallerySize);
      } else if (remainingSourceImages.length === 1) {
        const single = remainingSourceImages[0];
        const replacement = resizableImageType.create({
          src: single.src,
          alt: single.alt ?? null,
          title: single.title ?? null,
        });
        tr.replaceWith(
          sourceGalleryPos,
          sourceGalleryPos + sourceGallerySize,
          replacement,
        );
      } else {
        const downgradedLayout = getNextLayoutAfterDelete(
          sourceLayout,
          remainingSourceImages.length,
        );
        tr.setNodeMarkup(sourceGalleryPos, undefined, {
          ...sourceGalleryNode.attrs,
          images: remainingSourceImages,
          layout: downgradedLayout,
        });
      }
    };

    const replaceThisImage = () => {
      tr.replaceWith(targetPos, targetPos + node.nodeSize, newGalleryNode);
    };

    if (sourceGalleryPos > targetPos) {
      updateSourceGallery();
      replaceThisImage();
    } else {
      replaceThisImage();
      updateSourceGallery();
    }

    editor.view.dispatch(tr);
    setMergeDragHighlight(null);
  };

  const handleNativeDragEnd = () => {
    setMergeDragHighlight(null);
    // 드롭 없이 드래그가 끝난 경우(취소 등) 모듈 레벨 상태 정리
    setPendingMergePayload(null);
  };

  /**
   * 컨테이너 클릭 처리 — 다중 선택 토글
   *
   * - Shift / Cmd(macOS) / Ctrl(Win) + 클릭: 현재 이미지를 다중 선택에 토글
   *   → 두 개 이상 선택되면 ImageSelectionBubbleMenu 가 활성화됨
   * - 일반 클릭: 다중 선택 상태를 모두 해제 (ProseMirror 기본 NodeSelection 만 유지)
   *
   * 주의: 다중 선택 토글일 때는 ProseMirror 의 기본 노드 선택을 막아야
   * 단일 NodeSelection 으로 덮어써지지 않음
   */
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentPos === undefined) return;

    const isMultiSelectKey = e.shiftKey || e.metaKey || e.ctrlKey;
    if (isMultiSelectKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleImageMultiSelection(currentPos);
      // BubbleMenu 위치 계산을 위해 현재 클릭한 이미지를 NodeSelection 으로 설정
      // (다중 선택 표시는 별도 multi-selected outline 으로 유지됨)
      editor.commands.setNodeSelection(currentPos);
      return;
    }

    // 일반 클릭: 기존 다중 선택을 해제 (단일 NodeSelection 동작은 PM 에 위임)
    clearImageMultiSelection();
  };

  const imageStyle: React.CSSProperties = {
    width: width ? `${width}px` : "100%",
    height: height ? `${height}px` : "auto",
    maxWidth: "100%",
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`resizable-image-wrapper resizable-image-wrapper--${align}`}
      // ProseMirror 가 drag handle 을 찾을 때 closest('[data-drag-handle]') 를 사용하므로
      // JSX 에 명시해야 React 리렌더링 후에도 속성이 유지된다.
      data-drag-handle=""
      onDragStartCapture={handleNativeDragStart}
    >
      {/* 이미지 + 캡션 세로 배치 컬럼 (wrapper 가 flex-row 라 캡션이 옆으로 붙는 것 방지) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        <div
          className={`resizable-image-container ${selected ? "selected" : ""} ${isMultiSelected ? "multi-selected" : ""} ${isResizing ? "resizing" : ""} ${dropEdge ? `resizable-image-container--drop-${dropEdge}` : ""}`}
          style={{ width: width ? `${width}px` : "auto", maxWidth: "100%" }}
          onClick={handleContainerClick}
          onDrop={handleNativeDrop}
          onDragEnd={handleNativeDragEnd}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt || ""}
            title={title || ""}
            style={imageStyle}
            onLoad={handleImageLoad}
            className="resizable-image"
            draggable={false}
          />

          {/* 이모티콘 스티커 레이어 (에디터에서 드래그/크기조절/삭제) */}
          <ImageStickerLayer
            stickers={stickers}
            onChange={(next) => updateAttributes({ stickers: next })}
            autoSelectId={lastAddedStickerId}
          />

          {showIndividualChrome && (
            <>
              <ImageGalleryAlignToolbar
                currentAlign={align || "center"}
                onAlignChange={(newAlign) => {
                  updateAttributes({ align: newAlign });
                }}
                onDelete={deleteNode}
                onEditImage={() => {
                  if (currentPos !== undefined) {
                    requestImageEdit({ clickedPos: currentPos });
                  }
                }}
                stickerPicker={
                  <EmojiPickerPopover
                    onSelect={(emoji) => {
                      const sticker = createSticker(emoji);
                      updateAttributes({ stickers: [...stickers, sticker] });
                      setLastAddedStickerId(sticker.id);
                    }}
                  />
                }
              />
              <div
                className="resize-handle resize-handle--nw"
                onMouseDown={(e) => handleResizeStart(e, "nw")}
              />
              <div
                className="resize-handle resize-handle--ne"
                onMouseDown={(e) => handleResizeStart(e, "ne")}
              />
              <div
                className="resize-handle resize-handle--sw"
                onMouseDown={(e) => handleResizeStart(e, "sw")}
              />
              <div
                className="resize-handle resize-handle--se"
                onMouseDown={(e) => handleResizeStart(e, "se")}
              />
            </>
          )}
        </div>
        {/* 이미지 설명 (캡션) — 선택 시 항상, 미선택 시엔 내용이 있을 때만 표시 */}
        {(selected || caption.trim().length > 0 || captionDraft !== null) && (
          <input
            type="text"
            value={captionDraft ?? caption}
            placeholder="이미지 설명 추가..."
            maxLength={200}
            contentEditable={false}
            onChange={(e) => setCaptionDraft(e.target.value)}
            onFocus={() => setCaptionDraft(caption)}
            onBlur={() => {
              if (captionDraft !== null && captionDraft.trim() !== caption) {
                updateAttributes({ caption: captionDraft.trim() });
              }
              setCaptionDraft(null);
            }}
            onKeyDown={(e) => {
              // ProseMirror 로 키 입력이 전파되면 본문이 수정되므로 차단
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            style={{
              display: "block",
              width: width ? `${width}px` : "100%",
              maxWidth: "100%",
              margin: "6px 0 0",
              padding: "2px 4px",
              border: "none",
              outline: "none",
              background: "transparent",
              textAlign: "center",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              color: "#8a8a8a",
              fontFamily: "inherit",
            }}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
};

export default ResizableImageComponent;
