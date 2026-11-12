import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Provider } from "@/ui/provider";
import "./globals.css";

const SITE_URL = "https://blogstudio.co.kr";
// 한글 이름을 앞에 둔다. 구글은 제목 앞부분을 사이트 이름으로 읽으므로
// "blogstudio" 가 먼저 오면 한글 이름이 사이트명으로 인식되지 않는다.
const SITE_NAME = "블로그스튜디오";
const DESCRIPTION =
  "블로그스튜디오는 글을 쓰고 읽고 연결되는 콘텐츠 플랫폼입니다. " +
  "작가를 구독하고, 시리즈로 이어 읽고, 유료 글로 수익을 만드세요.";

/**
 * 검색 결과에 로그인 화면이 노출되던 문제를 바로잡는다.
 *
 * 예전에는 로그인해야 아무것도 볼 수 없어 크롤러가 로그인 페이지만 수집했고,
 * 설명도 한 줄뿐이라 스니펫이 "이메일 또는 휴대폰 번호. 비밀번호. 로그인"으로 잡혔다.
 * 지금은 비로그인도 둘러볼 수 있으므로 제목·설명·이미지를 제대로 채운다.
 *
 * 제목에 "블로그스튜디오"를 함께 넣는 이유는 한글 이름으로 검색했을 때
 * 걸리게 하기 위해서다. JSON-LD 의 alternateName 과 함께 쓴다.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} (blogstudio)`,
    template: "%s · 블로그스튜디오",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "블로그스튜디오",
    "블로그 스튜디오",
    "blogstudio",
    "블로그",
    "글쓰기",
    "콘텐츠 플랫폼",
    "구독",
    "유료 글",
    "뉴스레터",
  ],
  /*
   * canonical 은 여기서 정하지 않는다.
   *
   * 루트에 두면 하위 페이지가 그대로 물려받아 /explore, /series 까지
   * 홈을 가리킨다 — 구글에 "전부 홈의 중복본"이라고 말하는 셈이라
   * 그 페이지들이 색인에서 빠진다.
   * 값을 비워 두면 각 페이지가 자기 주소를 canonical 로 쓴다(기본 동작).
   * 글 페이지처럼 주소가 두 갈래인 곳만 따로 지정한다.
   */
  icons: {
    // 구글은 /favicon.ico 를 먼저 찾는다. 이게 404 라 검색 결과에 아이콘이 없었다.
    // ico 에는 16~256 을 함께 담았고, 더 큰 화면용으로 PNG 를 따로 알린다.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/app-icon/bs-icon-classic-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/app-icon/bs-icon-classic-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/app-icon/bs-icon-classic-1024.png",
        sizes: "1024x1024",
        type: "image/png",
      },
      {
        url: "/app-icon/bs-icon-classic-2048.png",
        sizes: "2048x2048",
        type: "image/png",
      },
    ],
    shortcut: "/favicon.ico",
    apple: "/app-icon/bs-icon-classic-1024.png",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: SITE_URL,
    title: `${SITE_NAME} (blogstudio)`,
    description: DESCRIPTION,
    images: [
      {
        url: "/app-icon/bs-icon-classic-2048.png",
        width: 2048,
        height: 2048,
        alt: "블로그스튜디오",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} (blogstudio)`,
    description: DESCRIPTION,
    images: ["/app-icon/bs-icon-classic-2048.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

/**
 * 검색엔진에 사이트 정체와 "블로그스튜디오"라는 다른 이름을 알려준다.
 * alternateName 이 한글 이름으로 검색했을 때 걸리게 하는 핵심이다.
 */
const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "블로그스튜디오",
      alternateName: ["blogstudio", "Blog Studio", "블로그 스튜디오"],
      description: DESCRIPTION,
      inLanguage: "ko-KR",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "블로그스튜디오",
      alternateName: "blogstudio",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/app-icon/bs-icon-classic-1024.png`,
        width: 1024,
        height: 1024,
      },
    },
  ],
};

// 키보드가 올라와도 레이아웃(viewport)을 건드리지 않고 콘텐츠 위에 겹치게 함 →
// 화면이 출렁이거나 밀리지 않고 그대로 고정.
export const viewport: Viewport = {
  interactiveWidget: "overlays-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: 구조화 데이터는 이 방식만 가능
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
