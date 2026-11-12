"use client";

import * as React from "react";

/**
 * 에디터 내 resizableImage 노드 다중 선택 상태를 관리하는 단순 pub/sub 스토어.
 *
 * 배경:
 *  - Tiptap/ProseMirror 의 기본 selection 은 인라인 텍스트 또는 단일 NodeSelection 만
 *    지원하므로, atom block 인 resizableImage 를 두 개 이상 선택하는 동작을 표현할 수 없다.
 *  - 사용자는 Shift+클릭 또는 Cmd/Ctrl+클릭으로 여러 이미지를 동시에 선택해
 *    "갤러리 레이아웃" 액션을 수행하길 원한다.
 *  - NodeView 컴포넌트(ResizableImageComponent)와 BubbleMenu(ImageSelectionBubbleMenu)는
 *    React Context 를 공유하기 어려우므로, 가벼운 모듈 레벨 스토어 + 구독 훅을 둔다.
 *
 * 저장 단위는 ProseMirror pos(노드 시작 위치) 이며, 동일 에디터 인스턴스 안에서
 * 노드를 식별하는 안정적인 키로 사용한다.
 */

type Listener = (positions: ReadonlySet<number>) => void;

let selectedPositions = new Set<number>();
const listeners = new Set<Listener>();

const emit = () => {
  // 외부에서 변형하지 못하도록 새 Set 으로 복제하여 전달
  const snapshot: ReadonlySet<number> = new Set(selectedPositions);
  listeners.forEach((listener) => listener(snapshot));
};

/**
 * 모든 선택을 해제한다.
 * - 이미 비어있다면 알림을 보내지 않아 불필요한 리렌더를 방지
 */
export const clearImageMultiSelection = (): void => {
  if (selectedPositions.size === 0) return;
  selectedPositions = new Set<number>();
  emit();
};

/**
 * 단일 이미지를 선택 상태로 설정 (다른 선택은 모두 해제).
 * - 일반 클릭 동작에서 호출
 */
export const setSingleImageSelection = (pos: number): void => {
  if (selectedPositions.size === 1 && selectedPositions.has(pos)) return;
  selectedPositions = new Set<number>([pos]);
  emit();
};

/**
 * 다중 선택 토글 (Shift/Cmd/Ctrl + 클릭).
 * - 이미 선택된 pos 면 제거, 아니면 추가
 */
export const toggleImageMultiSelection = (pos: number): void => {
  const next = new Set(selectedPositions);
  if (next.has(pos)) {
    next.delete(pos);
  } else {
    next.add(pos);
  }
  selectedPositions = next;
  emit();
};

/**
 * 현재 선택된 pos 목록을 반환 (스냅샷).
 */
export const getImageMultiSelection = (): ReadonlySet<number> =>
  new Set(selectedPositions);

/**
 * React 컴포넌트에서 선택 상태를 구독하기 위한 훅.
 * - 마운트 시 현재 스냅샷 반환
 * - 변경 시 리렌더 트리거
 */
export const useImageMultiSelection = (): ReadonlySet<number> => {
  const [snapshot, setSnapshot] = React.useState<ReadonlySet<number>>(
    () => new Set(selectedPositions),
  );

  React.useEffect(() => {
    const listener: Listener = (positions) => setSnapshot(positions);
    listeners.add(listener);
    // 마운트 직후 최신 상태 반영
    listener(new Set(selectedPositions));
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
};
