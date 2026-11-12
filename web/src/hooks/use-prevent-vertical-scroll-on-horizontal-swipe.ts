"use client";

import { useEffect } from "react";

const THRESHOLD_PX = 12;
/**
 * 가로로 "확실히" 움직였다고 볼 배수.
 * deltaX >= deltaY 로 판정하면 살짝 비스듬한 세로 스크롤까지 가로로 잠겨
 * 페이지가 아예 스크롤되지 않는다. 명확한 가로 스와이프만 막는다.
 */
const HORIZONTAL_RATIO = 1.5;

function isInsideHorizontalScrollArea(el: EventTarget | null): boolean {
  let node = el instanceof Node ? el : null;
  while (node && node !== document.body) {
    if (node instanceof Element) {
      const className = node.getAttribute?.("class") ?? "";
      if (className.includes("touch-pan-x")) return true;
      const style = window.getComputedStyle(node);
      const overflowX = style.overflowX;
      const overflow = style.overflow;
      if (
        overflowX === "auto" ||
        overflowX === "scroll" ||
        overflow === "auto" ||
        overflow === "scroll"
      ) {
        const scrollWidth = node.scrollWidth;
        const clientWidth = node.clientWidth;
        if (scrollWidth > clientWidth) return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * 모바일에서 가로로 슬라이드할 때 본문이 위아래로 스크롤되지 않도록 막습니다.
 * 가로 스크롤 영역(.touch-pan-x, overflow-x: auto 등) 안에서는 막지 않아
 * 해당 영역의 가로 스크롤은 그대로 동작합니다.
 *
 * @param enabled - false 면 listener 자체를 등록하지 않음. 풀스크린 페이지처럼
 *   스크롤 자체가 없는 화면에서 click 이벤트 처리에 부작용을 주지 않도록 차단.
 */
export function usePreventVerticalScrollOnHorizontalSwipe(
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return;
    let startX = 0;
    let startY = 0;
    let direction: "horizontal" | "vertical" | null = null;

    function handleTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      direction = null;
    }

    function handleTouchMove(e: TouchEvent) {
      if (e.touches.length !== 1) return;

      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const deltaX = Math.abs(x - startX);
      const deltaY = Math.abs(y - startY);

      if (direction === null) {
        if (deltaX > THRESHOLD_PX || deltaY > THRESHOLD_PX) {
          direction =
            deltaX > deltaY * HORIZONTAL_RATIO ? "horizontal" : "vertical";
        }
      }

      if (direction === "horizontal") {
        const insideHorizontal = isInsideHorizontalScrollArea(e.target);
        if (!insideHorizontal) {
          e.preventDefault();
        }
      }
    }

    function handleTouchEnd() {
      direction = null;
    }

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled]);
}
