package com.blogstudio.blogstudioapi.service;

import com.blogstudio.blogstudioapi.dto.request.LoginRequestDto;
import com.blogstudio.blogstudioapi.dto.response.LoginResponseDto;
import com.blogstudio.blogstudioapi.entity.User;
import com.blogstudio.blogstudioapi.exception.UnauthorizedException;
import com.blogstudio.blogstudioapi.repository.UserRepository;
import com.blogstudio.blogstudioapi.security.PasswordHasher;
import com.blogstudio.blogstudioapi.security.VerifiedEmailStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService 테스트")
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserService userService;

    @Mock
    private EmailService emailService;

    @Mock
    private AuthErrorLogService authErrorLogService;

    @Mock
    private VerifiedEmailStore verifiedEmailStore;

    // 외부 의존이 없는 순수 해시 유틸이라 실제 BCrypt 동작으로 검증한다
    @Spy
    private PasswordHasher passwordHasher = new PasswordHasher();

    @Mock
    private StringRedisTemplate stringRedisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private AuthServiceImpl authService;

    /** Redis 대역 — 로그인 토큰과 이메일 인증번호가 같은 저장소를 본다 */
    private final Map<String, String> redis = new HashMap<>();

    /** 지금 가입·변경되는 비밀번호는 BCrypt 해시로 저장된다 (해시는 느려서 한 번만 만든다) */
    private static final String HASHED_PASSWORD = new PasswordHasher().hash("password123");

    private User testUser;

    private LoginRequestDto loginRequest(String email, String password) {
        LoginRequestDto dto = new LoginRequestDto();
        dto.setEmail(email);
        dto.setPassword(password);
        return dto;
    }

    @BeforeEach
    void setUp() {
        // 토큰을 쓰지 않는 테스트도 있어 lenient 로 둔다
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(valueOperations);
        lenient().doAnswer(inv -> redis.put(inv.getArgument(0), inv.getArgument(1)))
                .when(valueOperations).set(anyString(), anyString(), any(Duration.class));
        lenient().when(valueOperations.get(anyString()))
                .thenAnswer(inv -> redis.get(inv.<String>getArgument(0)));
        lenient().when(stringRedisTemplate.delete(anyString()))
                .thenAnswer(inv -> redis.remove(inv.<String>getArgument(0)) != null);
        lenient().when(valueOperations.increment(anyString()))
                .thenAnswer(inv -> Long.parseLong(redis.merge(inv.<String>getArgument(0), "1",
                        (current, one) -> String.valueOf(Long.parseLong(current) + 1))));

        testUser = User.builder()
                .id(1L)
                .publicId("test-public-id")
                .email("test@blogstudio.co.kr")
                .password(HASHED_PASSWORD)
                .firstName("민성")
                .lastName("재")
                .nickname("minsungjae")
                .birthDate("990101")
                .genderCode("M")
                .phoneNumber("01012345678")
                .build();
    }

    // ──────────────────────────────────────────────────────────
    // 로그인 테스트
    // ──────────────────────────────────────────────────────────
    @Nested
    @DisplayName("로그인")
    class Login {

        @Test
        @DisplayName("정상 로그인 - 토큰 반환")
        void login_success() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));

            // when
            LoginResponseDto response = authService.login(request);

            // then
            assertThat(response).isNotNull();
            assertThat(response.getToken()).isNotBlank();
        }

        @Test
        @DisplayName("해시가 아닌 저장값 - 원문과 같아도 로그인 거부")
        void login_unhashedStoredPassword_rejected() {
            // given: 해시가 아닌 값이 저장돼 있는 경우
            testUser.setPassword("password123");
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));

            // when & then
            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        @Test
        @DisplayName("존재하지 않는 이메일 - 예외 발생")
        void login_emailNotFound() {
            // given
            LoginRequestDto request = loginRequest("none@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("none@blogstudio.co.kr")).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        @Test
        @DisplayName("잘못된 비밀번호 - 예외 발생")
        void login_wrongPassword() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "wrongPassword");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));

            // when & then
            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(UnauthorizedException.class)
                    .hasMessageContaining("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        @Test
        @DisplayName("255자 초과 비밀번호 - 예외 발생")
        void login_passwordTooLong() {
            // given
            String longPassword = "a".repeat(256);
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", longPassword);

            // when & then
            assertThatThrownBy(() -> authService.login(request))
                    .isInstanceOf(UnauthorizedException.class);
        }

        @Test
        @DisplayName("로그인 성공 시 에러 로그 미기록")
        void login_success_noErrorLog() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));

            // when
            authService.login(request);

            // then
            verify(authErrorLogService, never()).log(eq("LOGIN"), anyString(), anyString(), any(), any());
        }

        @Test
        @DisplayName("로그인 실패 시 에러 로그 기록")
        void login_fail_errorLogged() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "wrongPassword");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));

            // when
            assertThatThrownBy(() -> authService.login(request));

            // then
            verify(authErrorLogService, times(1)).log(eq("LOGIN"), anyString(), anyString(), any(), any());
        }
    }

    // ──────────────────────────────────────────────────────────
    // 로그아웃 테스트
    // ──────────────────────────────────────────────────────────
    @Nested
    @DisplayName("로그아웃")
    class Logout {

        @Test
        @DisplayName("정상 로그아웃 - 토큰 무효화")
        void logout_success() {
            // given: 로그인 후 토큰 획득
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));
            LoginResponseDto loginResponse = authService.login(request);
            String token = loginResponse.getToken();

            // when
            authService.logout(token);

            // then: 로그아웃 후 토큰으로 사용자 조회 시 예외
            assertThatThrownBy(() -> authService.getCurrentUser(token))
                    .isInstanceOf(UnauthorizedException.class);
        }

        @Test
        @DisplayName("null 토큰으로 로그아웃 - 예외 없이 무시")
        void logout_nullToken() {
            assertThatCode(() -> authService.logout(null))
                    .doesNotThrowAnyException();
        }

        @Test
        @DisplayName("빈 토큰으로 로그아웃 - 예외 없이 무시")
        void logout_blankToken() {
            assertThatCode(() -> authService.logout(""))
                    .doesNotThrowAnyException();
        }
    }

    // ──────────────────────────────────────────────────────────
    // 토큰 갱신 테스트
    // ──────────────────────────────────────────────────────────
    @Nested
    @DisplayName("토큰 갱신")
    class RefreshToken {

        @Test
        @DisplayName("정상 토큰 갱신 - 새 토큰 반환")
        void refreshToken_success() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            String oldToken = authService.login(request).getToken();

            // when
            LoginResponseDto response = authService.refreshToken(oldToken);

            // then
            assertThat(response.getToken()).isNotBlank();
            assertThat(response.getToken()).isNotEqualTo(oldToken);
        }

        @Test
        @DisplayName("갱신 후 기존 토큰 무효화")
        void refreshToken_oldTokenInvalidated() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            String oldToken = authService.login(request).getToken();
            authService.refreshToken(oldToken);

            // when & then
            assertThatThrownBy(() -> authService.getCurrentUser(oldToken))
                    .isInstanceOf(UnauthorizedException.class);
        }

        @Test
        @DisplayName("유효하지 않은 토큰 갱신 - 예외 발생")
        void refreshToken_invalidToken() {
            assertThatThrownBy(() -> authService.refreshToken("invalid-token"))
                    .isInstanceOf(UnauthorizedException.class);
        }

        @Test
        @DisplayName("null 토큰 갱신 - 예외 발생")
        void refreshToken_nullToken() {
            assertThatThrownBy(() -> authService.refreshToken(null))
                    .isInstanceOf(UnauthorizedException.class);
        }
    }

    // ──────────────────────────────────────────────────────────
    // 현재 사용자 조회 테스트
    // ──────────────────────────────────────────────────────────
    @Nested
    @DisplayName("현재 사용자 조회")
    class GetCurrentUser {

        @Test
        @DisplayName("유효한 토큰으로 사용자 조회 성공")
        void getCurrentUser_success() {
            // given
            LoginRequestDto request = loginRequest("test@blogstudio.co.kr", "password123");
            when(userRepository.findByEmail("test@blogstudio.co.kr")).thenReturn(Optional.of(testUser));
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            String token = authService.login(request).getToken();

            // when
            var result = authService.getCurrentUser(token);

            // then
            assertThat(result).isNotNull();
            assertThat(result.getEmail()).isEqualTo("test@blogstudio.co.kr");
        }

        @Test
        @DisplayName("유효하지 않은 토큰 - 예외 발생")
        void getCurrentUser_invalidToken() {
            assertThatThrownBy(() -> authService.getCurrentUser("invalid-token"))
                    .isInstanceOf(UnauthorizedException.class);
        }

        @Test
        @DisplayName("null 토큰 - 예외 발생")
        void getCurrentUser_nullToken() {
            assertThatThrownBy(() -> authService.getCurrentUser(null))
                    .isInstanceOf(UnauthorizedException.class);
        }
    }

    // ──────────────────────────────────────────────────────────
    // 이메일 인증번호 테스트
    // ──────────────────────────────────────────────────────────
    @Nested
    @DisplayName("이메일 인증번호")
    class EmailVerificationCode {

        private static final String EMAIL = "new@blogstudio.co.kr";

        /** 가입 인증번호를 보내고 메일로 나간 번호를 돌려준다 */
        private String sendSignupCode() {
            when(userRepository.existsByEmail(EMAIL)).thenReturn(false);
            authService.sendVerificationCode(EMAIL);
            ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
            verify(emailService).sendVerificationCode(eq(EMAIL), code.capture());
            return code.getValue();
        }

        /** 비밀번호 재설정 인증번호를 보내고 메일로 나간 번호를 돌려준다 */
        private String sendResetCode() {
            when(userRepository.existsByEmail(EMAIL)).thenReturn(true);
            authService.sendPasswordResetCode(EMAIL);
            ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
            verify(emailService).sendPasswordResetCode(eq(EMAIL), code.capture());
            return code.getValue();
        }

        private String wrong(String code) {
            return code.equals("000000") ? "000001" : "000000";
        }

        @Test
        @DisplayName("6자리 숫자 인증번호 발송")
        void send_sixDigitCode() {
            assertThat(sendSignupCode()).matches("\\d{6}");
        }

        @Test
        @DisplayName("맞는 번호 - 인증 성공, 같은 번호는 다시 쓸 수 없음")
        void verify_success_codeConsumed() {
            String code = sendSignupCode();

            assertThat(authService.verifyEmailCode(EMAIL, code)).isTrue();
            assertThat(authService.verifyEmailCode(EMAIL, code)).isFalse();
        }

        @Test
        @DisplayName("맞는 번호 - 가입 때 확인할 인증 완료 표시를 남김")
        void verify_success_marksEmailVerified() {
            String code = sendSignupCode();

            authService.verifyEmailCode(EMAIL, code);

            verify(verifiedEmailStore).markVerified(EMAIL);
        }

        @Test
        @DisplayName("틀린 번호 - 인증 실패, 인증 완료 표시 없음")
        void verify_wrongCode() {
            String code = sendSignupCode();

            assertThat(authService.verifyEmailCode(EMAIL, wrong(code))).isFalse();
            verify(verifiedEmailStore, never()).markVerified(anyString());
        }

        @Test
        @DisplayName("확인 횟수 초과 - 번호를 버리고 새로 받게 함")
        void verify_tooManyAttempts() {
            String code = sendSignupCode();
            for (int i = 0; i < 5; i++) {
                assertThat(authService.verifyEmailCode(EMAIL, wrong(code))).isFalse();
            }

            // 6번째는 맞는 번호여도 막는다
            assertThatThrownBy(() -> authService.verifyEmailCode(EMAIL, code))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("다시 받아");
            // 버린 번호는 더 이상 통과하지 않는다
            assertThat(authService.verifyEmailCode(EMAIL, code)).isFalse();
        }

        @Test
        @DisplayName("비밀번호 재설정 - 맞는 번호면 변경")
        void resetPassword_success() {
            String code = sendResetCode();

            authService.resetPassword(EMAIL, code, "newPassword1!");

            verify(userService).resetPasswordByEmail(EMAIL, "newPassword1!");
        }

        @Test
        @DisplayName("비밀번호 재설정 - 틀린 번호면 거부")
        void resetPassword_wrongCode() {
            String code = sendResetCode();

            assertThatThrownBy(() -> authService.resetPassword(EMAIL, wrong(code), "newPassword1!"))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("인증번호가 올바르지 않거나 만료되었습니다.");
            verify(userService, never()).resetPasswordByEmail(anyString(), anyString());
        }
    }
}
