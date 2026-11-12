package com.blogstudio.blogstudioapi.security;

import java.nio.charset.StandardCharsets;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 비밀번호 단방향 해싱(BCrypt) 유틸. 저장값은 BCrypt 해시만 인정한다.
 */
@Component
public class PasswordHasher {

    /** BCrypt 입력 상한 (바이트) — 초과분은 알고리즘상 무시되므로 명시적으로 거부 */
    private static final int BCRYPT_MAX_BYTES = 72;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** 원문 비밀번호를 BCrypt 해시로 변환 */
    public String hash(String rawPassword) {
        if (rawPassword == null || rawPassword.isEmpty()) {
            throw new IllegalArgumentException("비밀번호가 비어 있습니다.");
        }
        if (rawPassword.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new IllegalArgumentException("비밀번호는 최대 72바이트(한글 약 24자)까지 사용할 수 있습니다.");
        }
        return encoder.encode(rawPassword);
    }

    /** 원문-저장값 일치 여부. 저장값이 BCrypt 해시가 아니면 항상 false */
    public boolean matches(String rawPassword, String storedPassword) {
        if (rawPassword == null || !isHash(storedPassword)) {
            return false;
        }
        if (rawPassword.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            return false;
        }
        return encoder.matches(rawPassword, storedPassword);
    }

    /** 저장값이 BCrypt 해시 형식인지 */
    public boolean isHash(String value) {
        return value != null
                && value.length() == 60
                && (value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$"));
    }
}
