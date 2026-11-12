package com.blogstudio.blogstudioapi.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
@DisplayName("VerifiedEmailStore 테스트")
class VerifiedEmailStoreTest {

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private VerifiedEmailStore store;

    /** Redis 대역 */
    private final Map<String, String> redis = new HashMap<>();

    @BeforeEach
    void setUp() {
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().doAnswer(inv -> redis.put(inv.getArgument(0), inv.getArgument(1)))
                .when(valueOperations).set(anyString(), anyString(), any(Duration.class));
        lenient().when(valueOperations.get(anyString()))
                .thenAnswer(inv -> redis.get(inv.<String>getArgument(0)));
        lenient().when(stringRedisTemplate.delete(anyString()))
                .thenAnswer(inv -> redis.remove(inv.<String>getArgument(0)) != null);
    }

    @Test
    @DisplayName("인증한 주소만 인증된 것으로 본다")
    void markedEmailOnly() {
        store.markVerified("new@blogstudio.co.kr");

        assertThat(store.isVerified("new@blogstudio.co.kr")).isTrue();
        assertThat(store.isVerified("other@blogstudio.co.kr")).isFalse();
    }

    @Test
    @DisplayName("앞뒤 공백·대소문자가 달라도 같은 주소로 본다")
    void normalizesEmail() {
        // 화면은 인증할 때 입력값 그대로, 가입할 때는 공백을 지워 보낸다
        store.markVerified(" New@Blogstudio.co.kr ");

        assertThat(store.isVerified("new@blogstudio.co.kr")).isTrue();
    }

    @Test
    @DisplayName("지우면 다시 인증해야 한다")
    void clearRemovesMark() {
        store.markVerified("new@blogstudio.co.kr");

        store.clear("new@blogstudio.co.kr");

        assertThat(store.isVerified("new@blogstudio.co.kr")).isFalse();
    }

    @Test
    @DisplayName("주소가 없으면 인증되지 않은 것으로 본다")
    void nullEmail() {
        assertThat(store.isVerified(null)).isFalse();
    }
}
