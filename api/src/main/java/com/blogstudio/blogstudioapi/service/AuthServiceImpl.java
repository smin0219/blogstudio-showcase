package com.blogstudio.blogstudioapi.service;

import com.blogstudio.blogstudioapi.dto.request.LoginRequestDto;
import com.blogstudio.blogstudioapi.dto.request.UserCreateRequestDto;
import com.blogstudio.blogstudioapi.dto.response.LoginResponseDto;
import com.blogstudio.blogstudioapi.dto.response.SendVerificationCodeResponseDto;
import com.blogstudio.blogstudioapi.dto.response.UserDto;
import com.blogstudio.blogstudioapi.dto.response.UserResponseDto;
import com.blogstudio.blogstudioapi.entity.User;
import com.blogstudio.blogstudioapi.exception.UnauthorizedException;
import com.blogstudio.blogstudioapi.security.PasswordHasher;
import com.blogstudio.blogstudioapi.security.VerifiedEmailStore;
import org.springframework.data.redis.core.StringRedisTemplate;
import com.blogstudio.blogstudioapi.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Optional;
import java.time.Duration;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AuthServiceImpl extends BaseServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final UserService userService;
    private final EmailService emailService;
    private final AuthErrorLogService authErrorLogService;
    private final VerifiedEmailStore verifiedEmailStore;

    private final StringRedisTemplate stringRedisTemplate;

    /** 로그인 토큰 Redis 키 접두사 */
    private static final String TOKEN_KEY_PREFIX = "auth:token:";
    /** 토큰 유효 기간 — 만료 시 재로그인 필요 (refresh 시 갱신) */
    private static final Duration TOKEN_TTL = Duration.ofDays(14);

    private void storeToken(String token, Long userId) {
        stringRedisTemplate.opsForValue()
                .set(TOKEN_KEY_PREFIX + token, String.valueOf(userId), TOKEN_TTL);
    }

    private Long readToken(String token) {
        String value = stringRedisTemplate.opsForValue().get(TOKEN_KEY_PREFIX + token);
        return value != null ? Long.parseLong(value) : null;
    }

    private void deleteToken(String token) {
        stringRedisTemplate.delete(TOKEN_KEY_PREFIX + token);
    }

    /** 이메일 인증번호 Redis 키 접두사 — 가입용과 비밀번호 재설정용을 따로 둔다 */
    private static final String SIGNUP_CODE_KEY_PREFIX = "auth:email-code:signup:";
    private static final String RESET_CODE_KEY_PREFIX = "auth:email-code:reset:";
    /** 인증번호별 확인 횟수 키 접미사 */
    private static final String ATTEMPTS_KEY_SUFFIX = ":attempts";
    /** 인증번호 유효 기간 */
    private static final Duration CODE_TTL = Duration.ofMinutes(3);
    /** 인증번호 하나로 확인할 수 있는 횟수 — 6자리는 100만 가지뿐이라 제한이 없으면 대입으로 뚫린다 */
    private static final int MAX_CODE_ATTEMPTS = 5;

    /** 인증번호 생성기 — 다음 번호를 예측할 수 없어야 하므로 SecureRandom */
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 새 인증번호 저장. 확인 횟수도 같은 유효 기간으로 0부터 다시 센다 */
    private void storeCode(String keyPrefix, String email, String code) {
        stringRedisTemplate.opsForValue().set(keyPrefix + email, code, CODE_TTL);
        stringRedisTemplate.opsForValue().set(keyPrefix + email + ATTEMPTS_KEY_SUFFIX, "0", CODE_TTL);
    }

    private void discardCode(String keyPrefix, String email) {
        stringRedisTemplate.delete(keyPrefix + email);
        stringRedisTemplate.delete(keyPrefix + email + ATTEMPTS_KEY_SUFFIX);
    }

    /**
     * 인증번호 확인. 맞으면 번호를 지워 한 번만 쓰게 하고,
     * 확인 횟수가 한도를 넘으면 번호를 버려 새로 받게 한다.
     */
    private boolean consumeCode(String keyPrefix, String email, String code) {
        String stored = stringRedisTemplate.opsForValue().get(keyPrefix + email);
        if (stored == null) {
            return false;
        }

        Long attempts = stringRedisTemplate.opsForValue().increment(keyPrefix + email + ATTEMPTS_KEY_SUFFIX);
        if (attempts != null && attempts > MAX_CODE_ATTEMPTS) {
            discardCode(keyPrefix, email);
            throw new IllegalArgumentException("인증번호 확인 횟수를 넘었습니다. 인증번호를 다시 받아 주세요.");
        }

        if (!stored.equals(code)) {
            return false;
        }
        discardCode(keyPrefix, email);
        return true;
    }

    private static final int PASSWORD_MAX_LENGTH = 255;

    @Override
    public LoginResponseDto login(LoginRequestDto request) {
        String email = request.getEmail();
        try {
            String loginPassword = request.getPassword();
            if (loginPassword != null && loginPassword.length() > PASSWORD_MAX_LENGTH) {
                String msg = "이메일 또는 비밀번호가 올바르지 않습니다.";
                authErrorLogService.log("LOGIN", email, msg, null, null);
                throw new UnauthorizedException(msg);
            }

            Optional<User> optionalUser = userRepository.findByEmail(email);
            if (optionalUser.isEmpty()) {
                String msg = "이메일 또는 비밀번호가 올바르지 않습니다.";
                authErrorLogService.log("LOGIN", email, msg, null, null);
                throw new UnauthorizedException(msg);
            }

            User user = optionalUser.get();

            // BCrypt 해시 비교
            if (!passwordHasher.matches(loginPassword, user.getPassword())) {
                String msg = "이메일 또는 비밀번호가 올바르지 않습니다.";
                authErrorLogService.log("LOGIN", email, msg, null, null);
                throw new UnauthorizedException(msg);
            }

            String token = generateToken();
            storeToken(token, user.getId());

            UserResponseDto userResponseDto = UserResponseDto.fromEntity(user);
            return new LoginResponseDto(token, userResponseDto);
        } catch (UnauthorizedException e) {
            throw e;
        } catch (Exception e) {
            authErrorLogService.log("LOGIN", email, e);
            throw e;
        }
    }

    @Override
    public UserResponseDto register(UserCreateRequestDto request) {
        UserDto created = userService.createUser(request);
        User user = userRepository.findById(created.getId())
                .orElseThrow(() -> new IllegalStateException("사용자 생성 후 조회에 실패했습니다."));
        return UserResponseDto.fromEntity(user);
    }

    @Override
    public void logout(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        deleteToken(token);
    }

    @Override
    public LoginResponseDto refreshToken(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException("토큰이 필요합니다.");
        }

        Long userId = readToken(token);
        if (userId == null) {
            throw new UnauthorizedException("유효하지 않은 토큰입니다.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("해당 토큰에 해당하는 사용자를 찾을 수 없습니다."));

        // 기존 토큰 제거 후 새 토큰 발급
        deleteToken(token);
        String newToken = generateToken();
        storeToken(newToken, user.getId());

        UserResponseDto userResponseDto = UserResponseDto.fromEntity(user);
        return new LoginResponseDto(newToken, userResponseDto);
    }

    @Override
    @Transactional(readOnly = true)
    public UserResponseDto getCurrentUser(String token) {
        Long userId = getUserIdFromToken(token);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("해당 토큰에 해당하는 사용자를 찾을 수 없습니다."));
        return UserResponseDto.fromEntity(user);
    }

    @Override
    public Long getUserIdFromToken(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException("토큰이 필요합니다.");
        }
        Long userId = readToken(token);
        if (userId == null) {
            throw new UnauthorizedException("유효하지 않은 토큰입니다.");
        }
        return userId;
    }

    @Override
    public SendVerificationCodeResponseDto sendVerificationCode(String email) {
        // 이메일 중복 확인
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다.");
        }

        // 6자리 인증번호 생성 (3분 후 만료)
        String code = generateVerificationCode();
        storeCode(SIGNUP_CODE_KEY_PREFIX, email, code);

        // 이메일 전송
        try {
            emailService.sendVerificationCode(email, code);
        } catch (IllegalArgumentException | IllegalStateException e) {
            // 이미 사용 중인 이메일(400)·발송 한도 초과(409)는 상태 코드를 살려 그대로 전달
            discardCode(SIGNUP_CODE_KEY_PREFIX, email);
            throw e;
        } catch (Exception e) {
            discardCode(SIGNUP_CODE_KEY_PREFIX, email);
            String errorMessage = "인증번호 전송에 실패했습니다.";
            if (e.getMessage() != null && !e.getMessage().isEmpty()) {
                errorMessage = e.getMessage();
            }
            throw new RuntimeException(errorMessage, e);
        }

        String devCode = emailService.exposesDevVerificationCode() ? code : null;
        return SendVerificationCodeResponseDto.builder()
                .devVerificationCode(devCode)
                .build();
    }

    @Override
    public boolean verifyEmailCode(String email, String code) {
        boolean verified = consumeCode(SIGNUP_CODE_KEY_PREFIX, email, code);
        if (verified) {
            // 가입할 때 서버가 확인할 수 있도록 인증 완료를 남긴다
            verifiedEmailStore.markVerified(email);
        }
        return verified;
    }

    @Override
    public void sendPasswordResetCode(String email) {
        if (!userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("등록된 이메일이 아닙니다.");
        }
        String code = generateVerificationCode();
        storeCode(RESET_CODE_KEY_PREFIX, email, code);
        try {
            emailService.sendPasswordResetCode(email, code);
        } catch (IllegalArgumentException | IllegalStateException e) {
            // 발송 한도 초과(409) 등은 상태 코드를 살려 그대로 전달
            discardCode(RESET_CODE_KEY_PREFIX, email);
            throw e;
        } catch (Exception e) {
            discardCode(RESET_CODE_KEY_PREFIX, email);
            String errorMessage = "인증번호 전송에 실패했습니다.";
            if (e.getMessage() != null && !e.getMessage().isEmpty()) {
                errorMessage = e.getMessage();
            }
            throw new RuntimeException(errorMessage, e);
        }
    }

    @Override
    public void resetPassword(String email, String code, String newPassword) {
        if (!consumeCode(RESET_CODE_KEY_PREFIX, email, code)) {
            throw new IllegalArgumentException("인증번호가 올바르지 않거나 만료되었습니다.");
        }
        userService.resetPasswordByEmail(email, newPassword);
    }

    private String generateToken() {
        return UUID.randomUUID().toString();
    }

    private String generateVerificationCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }
}


