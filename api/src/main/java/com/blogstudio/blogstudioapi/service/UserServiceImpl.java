package com.blogstudio.blogstudioapi.service;

import com.blogstudio.blogstudioapi.dto.request.UserCreateRequestDto;
import com.blogstudio.blogstudioapi.dto.request.UserProfileUpdateRequestDto;
import com.blogstudio.blogstudioapi.dto.response.UserDto;
import com.blogstudio.blogstudioapi.dto.response.UserResponseDto;
import com.blogstudio.blogstudioapi.entity.User;
import com.blogstudio.blogstudioapi.entity.UserTopic;
import com.blogstudio.blogstudioapi.security.PasswordHasher;
import com.blogstudio.blogstudioapi.security.VerifiedEmailStore;
import com.blogstudio.blogstudioapi.repository.ArticleDailyViewRepository;
import com.blogstudio.blogstudioapi.repository.SubscriptionRepository;
import com.blogstudio.blogstudioapi.repository.UserRepository;
import com.blogstudio.blogstudioapi.repository.UserTopicRepository;
import com.blogstudio.blogstudioapi.util.BloggerCategoryTags;
import com.blogstudio.blogstudioapi.util.NicknameRules;
import com.blogstudio.blogstudioapi.util.PersonNameFormatter;
import com.blogstudio.blogstudioapi.service.email.MarketingEmailService;
import com.blogstudio.blogstudioapi.service.email.UnsubscribeTokens;
import com.blogstudio.blogstudioapi.util.PhoneDigits;
import com.blogstudio.blogstudioapi.util.DisplayNameContentPolicy;
import com.blogstudio.blogstudioapi.util.PlatformReservedNames;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class UserServiceImpl extends BaseServiceImpl implements UserService {

    private static final int PASSWORD_MAX_LENGTH = 255;

    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final UserTopicRepository userTopicRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final ArticleDailyViewRepository articleDailyViewRepository;
    private final MarketingEmailService marketingEmailService;
    private final UnsubscribeTokens unsubscribeTokens;
    private final VerifiedEmailStore verifiedEmailStore;

    // ── 발췌: 회원가입(createUser)과 보조 메서드만 남겼습니다. 나머지 사용자 기능은 비공개입니다. ──

    @Override
    public UserDto createUser(UserCreateRequestDto request) {
        request.validate();

        // 이메일 인증은 서버가 확인한다 — 화면을 거치지 않고 API를 직접 불러도 인증 없이는 가입되지 않게
        if (!verifiedEmailStore.isVerified(request.getEmail())) {
            throw new IllegalArgumentException("이메일 인증을 먼저 완료해 주세요.");
        }

        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다.");
        }

        String phoneNorm = PhoneDigits.normalize(request.getPhone());
        if (phoneNorm.isBlank()) {
            throw new IllegalArgumentException("전화번호가 올바르지 않습니다.");
        }
        if (userRepository.countByPhoneDigitsNormalized(phoneNorm) > 0) {
            throw new IllegalArgumentException("이미 사용 중인 전화번호입니다.");
        }

        String nick = NicknameRules.normalizeOrNull(request.getNickname());
        if (nick != null) {
            NicknameRules.validate(nick);
            if (userRepository.countUsersWithNicknameIgnoreCase(nick) > 0) {
                throw new IllegalArgumentException("이미 사용 중인 닉네임입니다.");
            }
        }

        if (PlatformReservedNames.isReservedToken(request.getFirstName())
                || PlatformReservedNames.isReservedToken(request.getLastName())
                || PlatformReservedNames.isReservedToken(nick)) {
            throw new IllegalArgumentException(DisplayNameContentPolicy.NOT_ALLOWED_MESSAGE);
        }

        DisplayNameContentPolicy.validateFields(request.getFirstName(), request.getLastName(), nick);

        boolean marketingConsent = Boolean.TRUE.equals(request.getMarketingEmailConsent());
        LocalDateTime now = LocalDateTime.now();

        User user = User.builder()
                .publicId(generatePublicId())
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .nickname(nick)
                .email(request.getEmail())
                .password(passwordHasher.hash(request.getPassword()))
                .birthDate(request.getBirthDate())
                .genderCode(request.getGenderCode())
                .phoneNumber(phoneNorm)
                .avatarUrl(request.getAvatarUrl())
                .marketingEmailConsent(marketingConsent)
                .marketingConsentAt(marketingConsent ? now : null)
                .build();

        User saved = userRepository.save(user);

        // 블로거 카테고리(선택): 없으면 생략, 있으면 정규화·검증 후 저장
        updateUserTags(saved.getId(), request.getTags());

        // 가입하면서 수신 동의했으면 처리 결과를 알린다 (법정 안내)
        if (marketingConsent) {
            marketingEmailService.sendConsentResult(saved.getEmail(), true, now);
        }

        verifiedEmailStore.clear(request.getEmail());

        return UserDto.fromEntity(saved);
    }

    @Override
    public void updateUserTags(Long userId, List<String> tags) {
        List<String> normalized = BloggerCategoryTags.normalizeOrThrow(tags);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("해당 ID의 사용자가 존재하지 않습니다. id=" + userId));

        userTopicRepository.deleteByUser(user);

        if (normalized.isEmpty()) {
            return;
        }

        List<UserTopic> entities = normalized.stream()
                .map(t -> UserTopic.builder()
                        .user(user)
                        .topic(t)
                        .build())
                .collect(Collectors.toList());

        userTopicRepository.saveAll(entities);
    }

    private String generatePublicId() {
        String candidate;
        // 이론적으로 중복 가능성은 거의 없지만, DB 기준으로 한 번 더 안전하게 보장
        do {
            candidate = UUID.randomUUID().toString();
        } while (userRepository.existsByPublicId(candidate));
        return candidate;
    }
}
