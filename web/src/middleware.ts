import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  isGuestBrowsingEnabled,
  isLegacyPublicPath,
  isProtectedPath,
  loginPathFor,
} from "@/lib/auth-routes";

// 모바일 기기 User-Agent 패턴
const MOBILE_UA_PATTERNS = [
  /Android/i,
  /webOS/i,
  /iPhone/i,
  /iPad/i,
  /iPod/i,
  /BlackBerry/i,
  /Windows Phone/i,
  /Mobile/i,
];

// 모바일 UA 확인
function isMobileUserAgent(userAgent: string): boolean {
  return MOBILE_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * 검색엔진·SNS 크롤러 판별.
 *
 * Googlebot 스마트폰 UA 에는 Android 와 Mobile 이 들어 있어 모바일로 잡힌다.
 * 그러면 /m 으로 리다이렉트되는데 robots.txt 가 /m 을 막고 있어
 * "robots.txt 에 의해 차단됨"으로 크롤링이 통째로 실패했다.
 * 구글은 기본이 모바일 우선 크롤링이라 사실상 전 페이지가 색인되지 못했다.
 *
 * 크롤러에게는 한 페이지에 주소가 하나여야 한다. 리다이렉트에서 제외해
 * 항상 정식 주소(/series, /article/... )를 보게 한다.
 */
const CRAWLER_UA_PATTERN =
  /bot|crawler|spider|crawling|googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|applebot|yeti|daumoa|facebookexternalhit|twitterbot|linkedinbot|embedly|quora link preview|pinterest|slackbot|telegrambot|whatsapp|inspectiontool/i;

function isCrawlerUserAgent(userAgent: string): boolean {
  return CRAWLER_UA_PATTERN.test(userAgent);
}

// 리다이렉트 제외 경로 (API, 정적 파일 등)
const EXCLUDED_PATHS = [
  "/_next",
  "/api",
  "/favicon.ico",
  "/images",
  "/fonts",
  "/static",
  "/app-icon",
];

// 확장자가 있는 요청(정적 파일)은 페이지가 아님 — 인증/모바일 리다이렉트 대상에서 제외
const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

const AUTH_COOKIE = "auth_token";

// 모바일 경로로 변환
function toMobilePath(pathname: string): string {
  if (pathname === "/") return "/m/home";
  return `/m${pathname}`;
}

// 데스크톱 경로로 변환
function toDesktopPath(pathname: string): string {
  if (pathname === "/m" || pathname === "/m/home") return "/home";
  return pathname.replace(/^\/m/, "");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent") || "";

  // 제외 경로 확인 (+ 확장자 있는 정적 파일)
  if (
    EXCLUDED_PATHS.some((path) => pathname.startsWith(path)) ||
    PUBLIC_FILE_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 크롤러는 모바일이어도 /m 으로 보내지 않는다 — 위 주석 참고
  const isMobile =
    isMobileUserAgent(userAgent) && !isCrawlerUserAgent(userAgent);
  const isMobilePath = pathname.startsWith("/m/") || pathname === "/m";

  // 쿠키로 사용자 선호도 확인
  const preferDesktop = request.cookies.get("prefer_desktop")?.value === "true";
  const preferMobile = request.cookies.get("prefer_mobile")?.value === "true";

  const hasAuthCookie = !!request.cookies.get(AUTH_COOKIE)?.value;
  const guestBrowsing = isGuestBrowsingEnabled();

  // 루트 도메인(blogstudio.co.kr) 접속
  if (pathname === "/") {
    // 비로그인 열람을 끈 상태에서는 예전처럼 로그인 화면으로 보낸다
    if (!guestBrowsing && !hasAuthCookie) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname =
        isMobile && !preferDesktop ? "/m/auth/login" : "/auth/login";
      return NextResponse.redirect(loginUrl);
    }
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = isMobile && !preferDesktop ? "/m/home" : "/home";
    return NextResponse.redirect(homeUrl);
  }

  // 인증 체크: 계정이 필요한 경로만 로그인으로 보내고, 나머지는 비로그인도 열람 허용.
  // 쿼리스트링까지 redirect에 담아 로그인 후 보던 화면 그대로 복귀시킨다.
  //
  // GUEST_BROWSING=false 면 예전 정책(공개 목록 외 전부 로그인 필요)으로 돌아간다.
  const needsLogin = guestBrowsing
    ? isProtectedPath(pathname)
    : !isLegacyPublicPath(pathname);

  if (needsLogin && !hasAuthCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPathFor(pathname);
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  // 모바일 기기에서 데스크톱 경로 접속 시
  if (isMobile && !isMobilePath && !preferDesktop) {
    const mobileUrl = request.nextUrl.clone();
    mobileUrl.pathname = toMobilePath(pathname);
    return NextResponse.redirect(mobileUrl);
  }

  // 데스크톱에서 모바일 경로 접속 시
  if (!isMobile && isMobilePath && !preferMobile) {
    const desktopUrl = request.nextUrl.clone();
    desktopUrl.pathname = toDesktopPath(pathname);
    return NextResponse.redirect(desktopUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 다음 경로 제외:
     * - api (API 라우트)
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화 파일)
     * - favicon.ico (파비콘)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
