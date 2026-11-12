/**
 * 로그인 없이도 서비스를 둘러볼 수 있게 하는 라우트 접근 정책.
 *
 * 기본은 "공개"이고, 개인 데이터·글쓰기·결제처럼 계정이 반드시 필요한 화면만 보호한다.
 * 글 목록(무료/유료 모두)과 글 상세는 공개 — 유료 본문은 API가 페이월로 잘라 주므로
 * 결제(=로그인)가 필요한 시점에 로그인으로 유도한다.
 *
 * middleware(서버) / AuthGuard(클라이언트) / apiClient 401 처리가 모두 이 파일을 참조한다.
 */

/** 로그인이 필요한 경로 (데스크톱 기준, /m 프리픽스는 제거 후 비교) */
const PROTECTED_PATHS = [
  "/editor", // 글쓰기
  "/my-articles", // 내 글 관리
  "/my", // 구매 내역 · 수익 · 결제 수단
  "/settings", // 설정
  "/notifications", // 알림
  "/subscriptions", // 구독 작가
  "/history", // 읽기 기록
  "/admin", // 관리자
  "/payment", // 결제 결과
  "/qna/new", // 1:1 문의 작성 (목록·상세는 공개)
  "/series/new", // 시리즈 만들기 ([id] 라우트의 new 케이스)
  "/support/report", // 신고 접수
];

/** 로그인 화면 자체 (이미 로그인한 사용자 복귀 판정용) */
const LOGIN_PATHS = ["/auth/login", "/m/auth/login"];

/**
 * 비로그인 열람을 끄면(GUEST_BROWSING=false) 돌아갈 예전 정책 —
 * 여기 적힌 경로만 공개이고 나머지는 전부 로그인 필요.
 *
 * 문제가 생겼을 때 이미지 롤백 없이 환경 변수만 바꿔 되돌리기 위해 남겨 둔다.
 */
const LEGACY_PUBLIC_PATHS = [
  "/",
  "/auth/login",
  "/m/auth/login",
  "/signup",
  "/m/signup",
  "/signup/topics",
  "/m/signup/topics",
];

/**
 * 비로그인 열람이 켜져 있는지.
 * 미들웨어는 서버에서 실행되므로 런타임 환경 변수로 즉시 토글된다
 * (컨테이너 재시작만 필요, 재빌드 불필요).
 */
export function isGuestBrowsingEnabled(): boolean {
  return process.env.GUEST_BROWSING !== "false";
}

/** 예전 정책 기준 공개 경로인지 */
export function isLegacyPublicPath(pathname: string): boolean {
  return LEGACY_PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
}

/** /m 프리픽스 제거 — 모바일/데스크톱 경로를 같은 규칙으로 판정하기 위함 */
export function stripMobilePrefix(pathname: string): string {
  if (pathname === "/m") return "/";
  return pathname.startsWith("/m/") ? pathname.slice(2) : pathname;
}

/**
 * 경로가 prefix와 같거나 그 하위인지 판정.
 * "/my"가 "/my-articles"를 삼키지 않도록 세그먼트 경계로만 비교한다.
 */
function matchesPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** 로그인이 필요한 경로인지 */
export function isProtectedPath(pathname: string): boolean {
  const path = stripMobilePrefix(pathname);
  return PROTECTED_PATHS.some((protectedPath) =>
    matchesPath(path, protectedPath),
  );
}

/** 로그인 화면인지 */
export function isLoginPath(pathname: string): boolean {
  return LOGIN_PATHS.includes(pathname);
}

/** 현재 경로에 맞는 로그인 화면 (모바일 셸이면 /m) */
export function loginPathFor(pathname: string): string {
  return pathname.startsWith("/m/") || pathname === "/m"
    ? "/m/auth/login"
    : "/auth/login";
}

/** 현재 경로에 맞는 홈 (모바일 셸이면 /m) */
export function homePathFor(pathname: string): string {
  return pathname.startsWith("/m/") || pathname === "/m" ? "/m/home" : "/home";
}

/**
 * 로그인 후 원래 보던 화면으로 돌아오도록 redirect 파라미터를 붙인 로그인 URL.
 *
 * @param pathname 현재 경로
 * @param search   현재 쿼리스트링 (`?a=b` 형태, 없으면 생략)
 */
export function buildLoginUrl(pathname: string, search = ""): string {
  const target = `${pathname}${search}`;
  return `${loginPathFor(pathname)}?redirect=${encodeURIComponent(target)}`;
}

/**
 * 로그인 후 이동할 안전한 목적지.
 * 오픈 리다이렉트 방지를 위해 같은 사이트의 절대 경로(`/...`)만 허용하고,
 * 로그인 화면으로 되돌아가는 무한 루프도 막는다.
 */
export function resolveRedirectTarget(
  redirect: string | null | undefined,
  fallback = "/home",
): string {
  if (!redirect) return fallback;
  // "//evil.com" 같은 프로토콜 상대 URL 차단
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return fallback;
  const [path] = redirect.split("?");
  if (isLoginPath(path)) return fallback;
  return redirect;
}
