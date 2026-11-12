import type { Node } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { AllSelection, TextSelection } from "@tiptap/pm/state";

/**
 * Mod-A / Ctrl+A 등으로 문서 전체가 선택된 상태인지 판별.
 * - 표준 `selectAll` 명령은 `AllSelection` 을 사용한다.
 */
export function isSelectAllDocumentSelection(state: EditorState): boolean {
  const sel = state.selection;
  const { doc } = state;
  if (sel instanceof AllSelection) return true;
  if (
    sel instanceof TextSelection &&
    sel.from === 0 &&
    sel.to === doc.content.size
  ) {
    return true;
  }
  return false;
}

/** 문서 내 `resizableImage` 블록 개수 (Ctrl+A 시 개별 크롬 숨김 분기용). */
export function countResizableImagesInDoc(doc: Node): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === "resizableImage") {
      count += 1;
    }
    return true;
  });
  return count;
}
