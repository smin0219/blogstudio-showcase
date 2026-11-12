import type { Metadata } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://blogstudio.co.kr";
const SITE_NAME = "블로그스튜디오";

/** 설명으로 쓸 최대 길이 — 검색 결과 스니펫이 대략 이 언저리에서 잘린다 */
const DESCRIPTION_MAX = 160;

interface ArticleMeta {
  publicId?: string;
  title?: string;
  excerpt?: string;
  content?: string;
  backgroundImageUrl?: string;
  requiresPayment?: boolean;
  tags?: string[];
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  author?: {
    nickname?: string;
    firstName?: string;
    lastName?: string;
  };
}

/**
 * 글 하나를 서버에서 읽는다.
 *
 * 조회수는 올리지 않는다 — 크롤러가 훑을 때마다 조회수가 뛰면 인기글 순위가 망가진다.
 * 실패해도 예외를 던지지 않는다. 메타데이터가 없는 건 아쉬운 정도지만
 * 여기서 터지면 글 페이지 자체가 열리지 않는다.
 */
async function fetchArticle(id: string): Promise<ArticleMeta | null> {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "https://api.blogstudio.co.kr";
  const base = raw.replace(/\/+$/, "").replace(/\/api$/, "");
  try {
    const res = await fetch(`${base}/api/articles/${encodeURIComponent(id)}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.data ?? null) as ArticleMeta | null;
  } catch {
    return null;
  }
}

/** HTML 을 걷어내고 한 줄 설명으로 줄인다 */
function toPlainSummary(article: ArticleMeta): string {
  const source = article.excerpt?.trim() || article.content || "";
  const text = source
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length <= DESCRIPTION_MAX
    ? text
    : `${text.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

function authorName(article: ArticleMeta): string | null {
  const a = article.author;
  if (!a) return null;
  const full = `${a.lastName ?? ""}${a.firstName ?? ""}`.trim();
  return a.nickname?.trim() || full || null;
}

/**
 * 글마다 제목·설명·대표 이미지를 따로 붙인다.
 *
 * 페이지는 클라이언트 컴포넌트라 자기 메타데이터를 만들 수 없었고,
 * 그래서 모든 글이 홈과 똑같은 제목·설명을 달고 있었다.
 * 검색 결과에서 글이 서로 구분되지 않으니 개별 글로 유입될 길이 없었다.
 * 레이아웃은 서버 컴포넌트라 이 일을 대신할 수 있다 — 페이지 코드는 그대로 둔다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = await fetchArticle(id);

  if (!article?.title) {
    return { title: "글", alternates: { canonical: `/article/${id}` } };
  }

  const title = article.title.trim();
  const description = toPlainSummary(article);
  const writer = authorName(article);
  const canonical = `/article/${article.publicId ?? id}`;
  const published = article.publishedAt ?? article.createdAt;

  return {
    title,
    description: description || undefined,
    alternates: { canonical },
    keywords: article.tags?.length ? article.tags : undefined,
    authors: writer ? [{ name: writer }] : undefined,
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      url: `${SITE_URL}${canonical}`,
      title,
      description: description || undefined,
      publishedTime: published,
      modifiedTime: article.updatedAt ?? published,
      authors: writer ? [writer] : undefined,
      tags: article.tags,
      images: article.backgroundImageUrl
        ? [{ url: article.backgroundImageUrl, alt: title }]
        : undefined,
    },
    twitter: {
      card: article.backgroundImageUrl ? "summary_large_image" : "summary",
      title,
      description: description || undefined,
      images: article.backgroundImageUrl
        ? [article.backgroundImageUrl]
        : undefined,
    },
  };
}

export default async function ArticleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await fetchArticle(id);

  if (!article?.title) return <>{children}</>;

  const writer = authorName(article);
  const published = article.publishedAt ?? article.createdAt;

  /*
   * 글 구조화 데이터. 검색 결과에 제목·작성자·날짜가 함께 표시될 근거가 된다.
   * 본문은 싣지 않는다 — 유료 글이 그대로 노출될 수 있다.
   */
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title.trim(),
    description: toPlainSummary(article) || undefined,
    image: article.backgroundImageUrl
      ? [article.backgroundImageUrl]
      : undefined,
    datePublished: published,
    dateModified: article.updatedAt ?? published,
    author: writer ? { "@type": "Person", name: writer } : undefined,
    publisher: { "@id": `${SITE_URL}/#organization` },
    keywords: article.tags?.length ? article.tags.join(", ") : undefined,
    inLanguage: "ko-KR",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/article/${article.publicId ?? id}`,
    },
  };

  /*
   * 검색엔진이 읽을 본문을 서버에서 그린다.
   *
   * 페이지는 클라이언트 컴포넌트라 본문이 자바스크립트 실행 뒤에야 나타난다.
   * 크롤러는 렌더링에 시간 예산이 있어 그 전에 잘리는 일이 잦고, 그러면
   * 제목만 색인되고 본문 문장으로는 검색되지 않는다.
   *
   * 그래서 같은 내용을 서버에서 한 번 그려 둔다. 사용자에게는 페이지가
   * 준비되는 순간 사라지므로(아래 style) 실제로 보이는 화면은 달라지지 않는다.
   *
   * 유료 글은 본문 대신 요약만 쓴다 — 서버 응답에 전체 본문이 실려 오더라도
   * 여기서 그리면 결제 없이 읽히게 된다.
   */
  const isPaid = article.requiresPayment === true;
  const freeHtml = isPaid ? null : article.content;

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 구조화 데이터는 이 방식만 가능
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {/* 페이지가 본문을 다 그리면 이 블록은 사라진다 */}
      <style>{`html[data-article-ready] .ssr-article{display:none}`}</style>
      <article className="ssr-article">
        <h1>{article.title.trim()}</h1>
        {writer ? <p>{writer}</p> : null}
        {freeHtml ? (
          <div
            className="article-content tiptap ProseMirror"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: 서버에서 이미 새니타이징된 본문
            dangerouslySetInnerHTML={{ __html: freeHtml }}
          />
        ) : (
          <p>{toPlainSummary(article)}</p>
        )}
      </article>
      {children}
    </>
  );
}
