package com.blogstudio.blogstudioapi.service;

import com.blogstudio.blogstudioapi.dto.request.UserCreateRequestDto;
import com.blogstudio.blogstudioapi.dto.response.UserDto;
import com.blogstudio.blogstudioapi.entity.User;
import com.blogstudio.blogstudioapi.repository.UserRepository;
import com.blogstudio.blogstudioapi.repository.UserTopicRepository;
import com.blogstudio.blogstudioapi.security.PasswordHasher;
import com.blogstudio.blogstudioapi.security.VerifiedEmailStore;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("회원가입 이메일 인증 확인 테스트")
class SignupEmailVerificationTest {

    private static final String EMAIL = "new@blogstudio.co.kr";

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserTopicRepository userTopicRepository;

    @Mock
    private VerifiedEmailStore verifiedEmailStore;

    @Spy
    private PasswordHasher passwordHasher = new PasswordHasher();

    @InjectMocks
    private UserServiceImpl userService;

    private UserCreateRequestDto signupRequest() {
        UserCreateRequestDto request = new UserCreateRequestDto();
        request.setFirstName("성재");
        request.setLastName("민");
        request.setEmail(EMAIL);
        request.setPassword("password123");
        request.setConfirmPassword("password123");
        request.setPhone("01012345678");
        request.setBirthDate("990101");
        request.setGenderCode("1");
        return request;
    }

    @Test
    @DisplayName("이메일 인증을 안 했으면 가입 거부 - API를 직접 불러도 막힌다")
    void notVerified_rejected() {
        // given
        when(verifiedEmailStore.isVerified(EMAIL)).thenReturn(false);

        // when & then
        assertThatThrownBy(() -> userService.createUser(signupRequest()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("이메일 인증을 먼저 완료해 주세요.");
        verify(userRepository, never()).save(any());
    }

    @Test
    @DisplayName("이메일 인증을 마쳤으면 가입되고, 인증 표시는 지워 한 번만 쓴다")
    void verified_createdAndMarkCleared() {
        // given
        when(verifiedEmailStore.isVerified(EMAIL)).thenReturn(true);
        AtomicReference<User> saved = new AtomicReference<>();
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User user = inv.getArgument(0);
            user.setId(1L);
            saved.set(user);
            return user;
        });
        when(userRepository.findById(1L)).thenAnswer(inv -> Optional.ofNullable(saved.get()));

        // when
        UserDto created = userService.createUser(signupRequest());

        // then
        assertThat(created.getId()).isEqualTo(1L);
        verify(verifiedEmailStore).clear(EMAIL);
    }
}
