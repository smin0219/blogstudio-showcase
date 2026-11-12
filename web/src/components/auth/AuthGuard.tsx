"use client";

import { Box, Spinner, Text } from "@chakra-ui/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/api/auth-context";
import { buildLoginUrl, isProtectedPath } from "@/lib/auth-routes";

/**
 * 클라이언트 이중 보호: 계정이 필요한 경로에서 미인증이면 로그인으로 보낸다.
 *
 * middleware는 auth_token 쿠키의 "존재"만 보므로 만료·위조 토큰은 통과한다.
 * 여기서는 실제 사용자 조회(getCurrentUser) 결과로 판정하므로 그 구멍까지 막힌다.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated || !isProtectedPath(pathname)) {
      setShouldRedirect(false);
      return;
    }

    setShouldRedirect(true);
    // useSearchParams는 Suspense 경계를 요구하므로(전역 Provider에서 빌드 에러) 직접 읽는다
    const search = typeof window !== "undefined" ? window.location.search : "";
    router.replace(buildLoginUrl(pathname, search));
  }, [pathname, isAuthenticated, isLoading, router]);

  // 리다이렉트 중에는 로딩 표시 (보호된 콘텐츠 플래시 방지)
  if (shouldRedirect) {
    return (
      <Box
        display="flex"
        flexDir="column"
        alignItems="center"
        justifyContent="center"
        minH="50vh"
        gap={3}
      >
        <Spinner size="lg" />
        <Text fontSize="sm" color="gray.500">
          로그인 페이지로 이동 중...
        </Text>
      </Box>
    );
  }

  return <>{children}</>;
}
