import type { MetadataRoute } from "next";

const SITE_URL = "https://blogstudio.co.kr";

/**
 * 로그인 없이 볼 수 있는 고정 경로.
 *
 * 실제로 200 을 돌려주는 주소만 넣는다. 없는 주소가 섞이면 구글이 오류로
 * 기록하고 사이트맵 전체의 신뢰도가 떨어진다 — /series 는 목록 페이지가
 * 없어(=/series/[id] 만 있음) 404 였다.
 */
const STATIC_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/home", changeFrequency: "daily", priority: 1 },
  { path: "/explore", changeFrequency: "daily", priority: 0.9 },
  { path: "/articles/popular", changeFrequency: "daily", priority: 0.8 },
  { path: "/articles/feed", changeFrequency: "daily", priority: 0.7 },
  { path: "/guide", changeFrequency: "monthly", priority: 0.5 },
  { path: "/support/faq", changeFrequency: "monthly", priority: 0.4 },
  { path: "/notices", changeFrequency: "weekly", priority: 0.5 },
  { path: "/qna", changeFrequency: "weekly", priority: 0.5 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
];

interface SitemapArticle {
  publicId?: string;
  id?: number | string;
  updatedAt?: string;
  createdAt?: string;
}

/**
 * 공개 글 목록을 사이트맵에 싣는다.
 *
 * 빌드나 요청 시점에 API 가 떠 있지 않을 수 있으므로 실패해도 고정 경로만으로
 * 사이트맵이 나가게 한다 — 여기서 예외가 나면 사이트맵 전체가 500 이 된다.
 */
async function fetchArticles(): Promise<SitemapArticle[]> {
  // 환경변수가 /api 로 끝나기도 하고 아니기도 하다. 어느 쪽이든 맞게 맞춘다 —
  // 지금 사이트맵에 글 주소가 하나도 없는 이유가 이 경로 불일치였다.
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "https://api.blogstudio.co.kr";
  const base = raw.replace(/\/+$/, "").replace(/\/api$/, "");
  try {
    const res = await fetch(`${base}/api/articles?page=0&size=200`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = await res.json();
    const data = body?.data;
    const list = Array.isArray(data) ? data : (data?.content ?? []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // 루트(SITE_URL)는 넣지 않는다. 미들웨어가 /home 으로 307 리다이렉트하므로
  // 사이트맵에 리다이렉트 주소를 싣는 꼴이 되고, 바로 아래 /home 과 같은 페이지가
  // 두 번 실린다. 구글은 둘 다 오류로 기록한다.
  const staticEntries: MetadataRoute.Sitemap = [
    ...STATIC_PATHS.map((entry) => ({
      url: `${SITE_URL}${entry.path}`,
      lastModified: now,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    })),
  ];

  const articles = await fetchArticles();
  const articleEntries: MetadataRoute.Sitemap = articles
    .map((article) => {
      const key = article.publicId ?? article.id;
      if (!key) return null;
      const modified = article.updatedAt ?? article.createdAt;
      return {
        url: `${SITE_URL}/article/${key}`,
        lastModified: modified ? new Date(modified) : now,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return [...staticEntries, ...articleEntries];
}
