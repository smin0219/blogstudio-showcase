import type { MetadataRoute } from "next";

const SITE_URL = "https://blogstudio.co.kr";

/**
 * 크롤러 규칙.
 *
 * 로그인이 필요한 화면은 크롤링해도 로그인 페이지만 보이므로 막는다.
 * 예전에 검색 결과에 로그인 화면이 잡혔던 것이 이 때문이다.
 * 모바일 미러 라우트(/m)도 막는다 — 같은 내용이 두 주소로 잡히면
 * 중복 문서로 취급돼 둘 다 순위가 내려간다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        // 끝의 슬래시가 없으면 /author 까지 함께 막힌다 — 작가 페이지가 색인에서 빠진다
        "/auth/",
        "/editor",
        "/my",
        "/my-articles",
        "/settings",
        "/notifications",
        "/subscriptions",
        "/history",
        "/payment",
        "/m/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
