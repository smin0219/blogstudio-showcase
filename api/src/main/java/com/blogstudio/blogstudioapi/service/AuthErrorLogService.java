package com.blogstudio.blogstudioapi.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;

/**
 * 인증 에러 로그 - 로컬 파일 + DB 저장 (추적용)
 * JdbcTemplate 사용: JPA/Auditing 의존 없이 확실히 저장
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthErrorLogService {

    private final JdbcTemplate jdbcTemplate;

    @Value("${app.log.auth-error-dir:logs}")
    private String logDir;

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 인증 에러 로깅 (파일 + DB)
     * REQUIRES_NEW: 호출부(AuthServiceImpl)가 예외로 롤백돼도 로그는 별도 트랜잭션으로 커밋
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void log(String source, String email, String errorMessage, String stackTrace, String clientInfo) {
        try {
            // 1. DB 저장 (JdbcTemplate으로 확실히 INSERT)
            String src = source != null ? source : "UNKNOWN";
            String em = truncate(email, 255);
            String msg = truncate(errorMessage, 500);
            String st = truncate(stackTrace, 4000);
            String ci = truncate(clientInfo, 500);

            jdbcTemplate.update(
                    "INSERT INTO auth_error_logs (source, email, error_message, stack_trace, client_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(6), NOW(6))",
                    src, em, msg, st, ci
            );

            // 2. 로컬 파일 저장
            writeToFile(source, email, errorMessage, stackTrace, clientInfo);
        } catch (Exception e) {
            log.warn("AuthErrorLog 저장 실패: {}", e.getMessage(), e);
        }
    }

    /**
     * Exception으로 로깅
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void log(String source, String email, Exception ex) {
        String stackTrace = ex != null && ex.getStackTrace() != null
                ? Arrays.toString(ex.getStackTrace())
                : null;
        log(source, email, ex != null ? ex.getMessage() : null, stackTrace, null);
    }

    private void writeToFile(String source, String email, String errorMessage, String stackTrace, String clientInfo) {
        try {
            Path dir = Path.of(logDir);
            if (!Files.exists(dir)) {
                Files.createDirectories(dir);
            }
            Path file = dir.resolve("auth-errors.log");

            String now = LocalDateTime.now().format(FORMATTER);
            StringBuilder sb = new StringBuilder();
            sb.append("--------- ").append(now).append(" ---------\n");
            sb.append("SOURCE: ").append(source != null ? source : "-").append("\n");
            sb.append("EMAIL: ").append(email != null ? email : "-").append("\n");
            sb.append("MESSAGE: ").append(errorMessage != null ? errorMessage : "-").append("\n");
            if (clientInfo != null && !clientInfo.isBlank()) {
                sb.append("CLIENT: ").append(clientInfo).append("\n");
            }
            if (stackTrace != null && !stackTrace.isBlank()) {
                sb.append("STACKTRACE:\n").append(stackTrace).append("\n");
            }
            sb.append("\n");

            Files.writeString(file, sb.toString(), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.warn("AuthErrorLog 파일 쓰기 실패: {}", e.getMessage());
        }
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() <= maxLen ? s : s.substring(0, maxLen);
    }
}
