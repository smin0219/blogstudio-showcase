package com.blogstudio.blogstudioapi.security;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Locale;

/**
 * 이메일 인증을 마친 주소를 가입 때까지 기억해 두는 저장소 (Redis).
 *
 * <p>인증 완료를 화면만 기억하면 가입 API를 직접 불러 인증 없이 가입할 수 있다.
 * 인증번호가 맞으면 여기에 남기고, 가입할 때 서버가 이 표시를 확인한다.
 */
@Component
@RequiredArgsConstructor
public class VerifiedEmailStore {

    private static final String KEY_PREFIX = "auth:email-verified:";
    /** 인증하고 가입 버튼을 누르기까지 기다려 주는 시간 */
    private static final Duration TTL = Duration.ofMinutes(30);

    private final StringRedisTemplate stringRedisTemplate;

    public void markVerified(String email) {
        stringRedisTemplate.opsForValue().set(key(email), "1", TTL);
    }

    public boolean isVerified(String email) {
        return email != null && stringRedisTemplate.opsForValue().get(key(email)) != null;
    }

    /** 가입이 끝나면 지운다 — 인증 한 번으로 한 계정만 만든다 */
    public void clear(String email) {
        stringRedisTemplate.delete(key(email));
    }

    /** 화면이 인증할 때는 입력값 그대로, 가입할 때는 공백을 지워 보내므로 같은 키가 되게 맞춘다 */
    private String key(String email) {
        return KEY_PREFIX + email.trim().toLowerCase(Locale.ROOT);
    }
}
