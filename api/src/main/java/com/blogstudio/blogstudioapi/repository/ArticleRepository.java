package com.blogstudio.blogstudioapi.repository;

import com.blogstudio.blogstudioapi.entity.Article;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

// ── 발췌: 조회수 집계에 쓰는 메서드만 남겼습니다. 목록·인기글 등 조회 쿼리는 비공개입니다. ──
public interface ArticleRepository extends BaseRepository<Article, Long> {

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE Article a SET a.viewCount = COALESCE(a.viewCount, 0) + 1 WHERE a.id = :id")
    int incrementViewCount(@Param("id") Long id);
}
