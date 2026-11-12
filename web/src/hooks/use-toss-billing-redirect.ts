"use client";

import { useEffect, useRef } from "react";
import { toaster } from "@/components/ui/toaster";
import { tossApi } from "@/lib/api/services";
import {
  clearTossBillingRedirectParams,
  parseTossBillingRedirect,
} from "@/lib/toss-billing";

/**
 * 토스 카드 등록(빌링 인증) 창에서 복귀했을 때 처리.
 * 결제 수단 관리 페이지(데스크톱/모바일)에서 마운트 시 1회 실행:
 *  - 성공 복귀: authKey 로 빌링키 발급 → 카드 저장 → onRegistered() 호출(목록 갱신)
 *  - 실패 복귀: 에러 토스트
 */
export function useTossBillingRedirect(onRegistered: () => void): void {
  const handledRef = useRef(false);
  const onRegisteredRef = useRef(onRegistered);
  onRegisteredRef.current = onRegistered;

  useEffect(() => {
    if (handledRef.current) return;
    const result = parseTossBillingRedirect();
    if (!result) return;
    handledRef.current = true;
    clearTossBillingRedirectParams();

    if (result.type === "fail") {
      toaster.create({
        title: "카드 등록 실패",
        description: result.message,
        type: "error",
      });
      return;
    }

    void (async () => {
      try {
        const issued = await tossApi.issueBillingKey({
          authKey: result.authKey,
          customerKey: result.customerKey,
        });
        toaster.create({
          title: "카드 등록 완료",
          description: `${issued.cardCompany} ${issued.cardNumberMasked}`,
          type: "success",
        });
        onRegisteredRef.current();
      } catch (error) {
        console.error("빌링키 발급 실패:", error);
        toaster.create({
          title: "카드 등록 실패",
          description:
            "카드 등록 처리 중 오류가 발생했습니다. 다시 시도해 주세요.",
          type: "error",
        });
      }
    })();
  }, []);
}
