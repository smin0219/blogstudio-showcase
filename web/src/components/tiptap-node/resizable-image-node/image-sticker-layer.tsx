"use client";

import * as React from "react";
import { LuMinus, LuPlus, LuTrash2 } from "react-icons/lu";
import {
  type ImageSticker,
  STICKER_MAX_SIZE,
  STICKER_MIN_SIZE,
} from "./image-sticker-types";

interface ImageStickerLayerProps {
  stickers: ImageSticker[];
  /** 스티커 변경(이동/크기/삭제) 커밋 */
  onChange: (stickers: ImageSticker[]) => void;
  /** 방금 추가된 스티커를 바로 선택 상태로 */
  autoSelectId?: string | null;
}

/**
 * 에디터 안에서 이미지 위 스티커를 드래그로 옮기고 크기 조절/삭제하는 레이어.
 * 이미지 컨테이너(position: relative) 안에서 inset 0 으로 겹쳐 렌더된다.
 */
export function ImageStickerLayer({
  stickers,
  onChange,
  autoSelectId,
}: ImageStickerLayerProps) {
  const layerRef = React.useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** 드래그 중 실시간 위치 (커밋 전) */
  const [dragPos, setDragPos] = React.useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  /** 모서리 핸들 드래그 중 실시간 크기 (커밋 전) */
  const [dragSize, setDragSize] = React.useState<{
    id: string;
    size: number;
  } | null>(null);
  const dragRef = React.useRef<{
    id: string;
    moved: boolean;
    lastX: number;
    lastY: number;
  } | null>(null);
  const resizeRef = React.useRef<{ id: string } | null>(null);

  React.useEffect(() => {
    if (autoSelectId) setSelectedId(autoSelectId);
  }, [autoSelectId]);

  // 레이어 밖 클릭 시 선택 해제
  React.useEffect(() => {
    if (!selectedId) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const layer = layerRef.current;
      if (layer && e.target instanceof Node && !layer.contains(e.target)) {
        setSelectedId(null);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [selectedId]);

  const toPercent = (clientX: number, clientY: number) => {
    const layer = layerRef.current;
    if (!layer) return null;
    const rect = layer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handleStickerPointerDown = (
    e: React.PointerEvent,
    sticker: ImageSticker,
  ) => {
    // ProseMirror 노드 드래그/선택으로 전파 방지
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id: sticker.id,
      moved: false,
      lastX: e.clientX,
      lastY: e.clientY,
    };
  };

  const handleStickerPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (
      !drag.moved &&
      Math.abs(e.clientX - drag.lastX) < 3 &&
      Math.abs(e.clientY - drag.lastY) < 3
    ) {
      return;
    }
    drag.moved = true;
    const p = toPercent(e.clientX, e.clientY);
    if (p) setDragPos({ id: drag.id, x: p.x, y: p.y });
  };

  const handleStickerPointerUp = (
    e: React.PointerEvent,
    sticker: ImageSticker,
  ) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    e.stopPropagation();
    if (drag.moved) {
      const p = toPercent(e.clientX, e.clientY);
      setDragPos(null);
      if (p) {
        onChange(
          stickers.map((s) =>
            s.id === sticker.id
              ? {
                  ...s,
                  x: Math.round(p.x * 10) / 10,
                  y: Math.round(p.y * 10) / 10,
                }
              : s,
          ),
        );
      }
    }
    setSelectedId(sticker.id);
  };

  const resizeSelected = (delta: number) => {
    if (!selectedId) return;
    onChange(
      stickers.map((s) =>
        s.id === selectedId
          ? {
              ...s,
              size: Math.min(
                STICKER_MAX_SIZE,
                Math.max(STICKER_MIN_SIZE, s.size + delta),
              ),
            }
          : s,
      ),
    );
  };

  // ── 모서리 핸들 드래그로 크기 조절 ──
  const computeDragSize = (
    e: React.PointerEvent,
    sticker: ImageSticker,
  ): number | null => {
    const layer = layerRef.current;
    if (!layer) return null;
    const rect = layer.getBoundingClientRect();
    if (rect.width === 0) return null;
    // 스티커 중심에서 커서까지의 거리(대각) → 스티커 반너비로 환산
    const cx = rect.left + (sticker.x / 100) * rect.width;
    const cy = rect.top + (sticker.y / 100) * rect.height;
    const half = Math.max(Math.abs(e.clientX - cx), Math.abs(e.clientY - cy));
    const size = ((half * 2) / rect.width) * 100;
    return Math.min(STICKER_MAX_SIZE, Math.max(STICKER_MIN_SIZE, size));
  };

  const handleResizePointerDown = (
    e: React.PointerEvent,
    sticker: ImageSticker,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { id: sticker.id };
  };

  const handleResizePointerMove = (
    e: React.PointerEvent,
    sticker: ImageSticker,
  ) => {
    if (!resizeRef.current || resizeRef.current.id !== sticker.id) return;
    const size = computeDragSize(e, sticker);
    if (size != null) setDragSize({ id: sticker.id, size });
  };

  const handleResizePointerUp = (
    e: React.PointerEvent,
    sticker: ImageSticker,
  ) => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    e.stopPropagation();
    const size = computeDragSize(e, sticker);
    setDragSize(null);
    if (size != null) {
      onChange(
        stickers.map((s) =>
          s.id === sticker.id ? { ...s, size: Math.round(size * 10) / 10 } : s,
        ),
      );
    }
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    onChange(stickers.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  };

  if (stickers.length === 0) return null;

  const selected = stickers.find((s) => s.id === selectedId) ?? null;

  return (
    <div
      ref={layerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {stickers.map((s) => {
        const pos =
          dragPos && dragPos.id === s.id ? dragPos : { x: s.x, y: s.y };
        const size = dragSize && dragSize.id === s.id ? dragSize.size : s.size;
        const isSelected = s.id === selectedId;
        return (
          <React.Fragment key={s.id}>
            <svg
              viewBox="0 0 100 100"
              role="img"
              aria-label={`스티커 ${s.emoji}`}
              style={{
                position: "absolute",
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                width: `${size}%`,
                transform: "translate(-50%, -50%)",
                overflow: "visible",
                pointerEvents: "auto",
                cursor: "grab",
                userSelect: "none",
                outline: isSelected
                  ? "2px dashed var(--tt-brand-color-500, #FE6700)"
                  : "none",
                outlineOffset: 2,
                borderRadius: 8,
              }}
              onDragStart={(e) => e.preventDefault()}
              onPointerDown={(e) => handleStickerPointerDown(e, s)}
              onPointerMove={handleStickerPointerMove}
              onPointerUp={(e) => handleStickerPointerUp(e, s)}
              onPointerCancel={() => {
                dragRef.current = null;
                setDragPos(null);
              }}
            >
              <text
                x="50"
                y="50"
                fontSize="84"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {s.emoji}
              </text>
            </svg>
            {/* 모서리 리사이즈 핸들 (선택 시) — 우하단 코너를 드래그해 크기 조절 */}
            {isSelected && !dragPos && (
              <div
                role="presentation"
                aria-label="스티커 크기 조절"
                style={{
                  position: "absolute",
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  // margin % 는 컨테이너 너비 기준 → 스티커 반너비만큼 우하단으로
                  marginLeft: `${size / 2}%`,
                  marginTop: `${size / 2}%`,
                  transform: "translate(-50%, -50%)",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "var(--tt-brand-color-500, #FE6700)",
                  border: "2px solid white",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                  cursor: "nwse-resize",
                  pointerEvents: "auto",
                  touchAction: "none",
                  zIndex: 7,
                }}
                onPointerDown={(e) => handleResizePointerDown(e, s)}
                onPointerMove={(e) => handleResizePointerMove(e, s)}
                onPointerUp={(e) => handleResizePointerUp(e, s)}
                onPointerCancel={() => {
                  resizeRef.current = null;
                  setDragSize(null);
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* 선택된 스티커 컨트롤 (크기 -/+, 삭제) */}
      {selected && !dragPos && !dragSize && (
        <div
          style={{
            position: "absolute",
            left: `${selected.x}%`,
            top: `${selected.y}%`,
            // margin % 는 컨테이너 너비 기준 → 스티커(너비 size%)의 절반만큼 위로
            marginTop: `-${selected.size / 2}%`,
            transform: "translate(-50%, calc(-100% - 8px))",
            display: "flex",
            gap: 2,
            background: "white",
            border: "1px solid #e2e2e2",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: 2,
            pointerEvents: "auto",
            lineHeight: 0,
            zIndex: 6,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <StickerControlButton
            label="스티커 축소"
            onClick={() => resizeSelected(-2)}
          >
            <LuMinus size={14} />
          </StickerControlButton>
          <StickerControlButton
            label="스티커 확대"
            onClick={() => resizeSelected(2)}
          >
            <LuPlus size={14} />
          </StickerControlButton>
          <StickerControlButton
            label="스티커 삭제"
            danger
            onClick={deleteSelected}
          >
            <LuTrash2 size={14} />
          </StickerControlButton>
        </div>
      )}
    </div>
  );
}

function StickerControlButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 26,
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 6,
        background: "transparent",
        color: danger ? "#dc2626" : "#374151",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "#fef2f2" : "#f3f4f6";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

export default ImageStickerLayer;
