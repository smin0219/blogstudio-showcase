package com.blogstudio.blogstudioapi.service;

/**
 * 글 조회수(일별 유니크) 기록
 */
public interface ArticleViewService {

    /**
     * 발행된 글에 대해, 동일 viewer(로그인 user 또는 visitor UUID)당 서울 기준 당일 1회만 합계(view_count) 증가.
     *
     * @return 합계를 올렸으면 true (응답 viewCount 보정용)
     */
    boolean tryRecordDailyView(
            Long articleId,
            Long userId,
            String visitorIdHeader,
            boolean hasAccess,
            boolean isAuthorView
    );
}
