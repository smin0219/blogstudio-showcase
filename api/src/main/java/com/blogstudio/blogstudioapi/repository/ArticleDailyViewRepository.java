package com.blogstudio.blogstudioapi.repository;

import com.blogstudio.blogstudioapi.entity.ArticleDailyView;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ArticleDailyViewRepository extends BaseRepository<ArticleDailyView, Long> {

    boolean existsByArticleIdAndViewerKeyAndViewDate(Long articleId, String viewerKey, LocalDate viewDate);

    /**
     * 기간 내 조회수 기준 인기 작가 집계 (홈 인기 작가 — 주간/월간/연간)
     * - 작가 본인 조회는 제외(dv.isAuthorView = false)
     * - row: [authorId, viewCount]
     */
    @Query("SELECT a.authorId, COUNT(dv) " +
            "FROM ArticleDailyView dv, Article a " +
            "WHERE dv.articleId = a.id " +
            "AND dv.viewDate >= :sinceDate " +
            "AND a.authorId IS NOT NULL " +
            "AND dv.isAuthorView = false " +
            "GROUP BY a.authorId " +
            "ORDER BY COUNT(dv) DESC")
    List<Object[]> findTopAuthorsByViewsSince(@Param("sinceDate") LocalDate sinceDate, Pageable pageable);
}
