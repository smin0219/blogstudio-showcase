package com.blogstudio.blogstudioapi.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 글 일별 조회 기록 (유저 또는 visitor 기준 하루 1회, 조회수 합계는 articles.view_count에 누적)
 */
@Entity
@Table(
        name = "article_daily_views",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_article_daily_views_article_viewer_date",
                columnNames = {"article_id", "viewer_key", "view_date"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ArticleDailyView extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "article_id", nullable = false)
    private Long articleId;

    /**
     * 로그인: "u:{userId}", 비로그인: "v:{visitorUuid}"
     */
    @Column(name = "viewer_key", nullable = false, length = 100)
    private String viewerKey;

    @Column(name = "view_date", nullable = false)
    private LocalDate viewDate;

    @Column(name = "has_access", nullable = false)
    private boolean hasAccess;

    @Column(name = "is_author_view", nullable = false)
    private boolean isAuthorView;
}
