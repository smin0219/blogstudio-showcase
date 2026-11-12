package com.blogstudio.blogstudioapi.service;

import com.blogstudio.blogstudioapi.entity.Article;
import com.blogstudio.blogstudioapi.entity.ArticleDailyView;
import com.blogstudio.blogstudioapi.repository.ArticleDailyViewRepository;
import com.blogstudio.blogstudioapi.repository.ArticleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ArticleViewServiceImpl implements ArticleViewService {

    private static final ZoneId VIEW_ZONE = ZoneId.of("Asia/Seoul");

    private final ArticleDailyViewRepository articleDailyViewRepository;
    private final ArticleRepository articleRepository;

    @Override
    @Transactional
    public boolean tryRecordDailyView(
            Long articleId,
            Long userId,
            String visitorIdHeader,
            boolean hasAccess,
            boolean isAuthorView
    ) {
        Optional<Article> articleOpt = articleRepository.findById(articleId);
        if (articleOpt.isEmpty() || !Boolean.TRUE.equals(articleOpt.get().getIsPublished())) {
            return false;
        }

        LocalDate today = LocalDate.now(VIEW_ZONE);
        String viewerKey = resolveViewerKey(userId, visitorIdHeader);
        if (viewerKey == null) {
            return false;
        }

        if (articleDailyViewRepository.existsByArticleIdAndViewerKeyAndViewDate(articleId, viewerKey, today)) {
            return false;
        }

        ArticleDailyView row = ArticleDailyView.builder()
                .articleId(articleId)
                .viewerKey(viewerKey)
                .viewDate(today)
                .hasAccess(hasAccess)
                .isAuthorView(isAuthorView)
                .build();

        try {
            articleDailyViewRepository.save(row);
            int updated = articleRepository.incrementViewCount(articleId);
            return updated > 0;
        } catch (DataIntegrityViolationException e) {
            return false;
        }
    }

    private String resolveViewerKey(Long userId, String visitorIdHeader) {
        if (userId != null) {
            return "u:" + userId;
        }
        String uuid = sanitizeVisitorUuid(visitorIdHeader);
        if (uuid == null) {
            return null;
        }
        return "v:" + uuid;
    }

    private String sanitizeVisitorUuid(String raw) {
        if (raw == null) {
            return null;
        }
        String t = raw.trim();
        if (t.isEmpty()) {
            return null;
        }
        try {
            return UUID.fromString(t).toString();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
