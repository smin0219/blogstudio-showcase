package com.blogstudio.blogstudioapi.controller;

import com.blogstudio.blogstudioapi.common.ApiResponse;
import com.blogstudio.blogstudioapi.dto.request.EmailVerificationRequestDto;
import com.blogstudio.blogstudioapi.dto.request.LoginRequestDto;
import com.blogstudio.blogstudioapi.dto.request.PasswordResetRequestDto;
import com.blogstudio.blogstudioapi.dto.request.UserCreateRequestDto;
import com.blogstudio.blogstudioapi.dto.response.EmailVerificationResponseDto;
import com.blogstudio.blogstudioapi.dto.response.LoginResponseDto;
import com.blogstudio.blogstudioapi.dto.response.SendVerificationCodeResponseDto;
import com.blogstudio.blogstudioapi.dto.response.UserResponseDto;
import com.blogstudio.blogstudioapi.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController extends BaseController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponseDto>> login(@RequestBody LoginRequestDto request) {
        LoginResponseDto response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<UserResponseDto>> register(@RequestBody UserCreateRequestDto request) {
        UserResponseDto response = authService.register(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        String token = extractToken(authHeader);
        if (token != null) {
            authService.logout(token);
        }
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<LoginResponseDto>> refreshToken(
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        String token = extractToken(authHeader);
        LoginResponseDto response = authService.refreshToken(token);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponseDto>> me(
            @RequestHeader(value = "Authorization", required = false) String authHeader
    ) {
        String token = extractToken(authHeader);
        UserResponseDto response = authService.getCurrentUser(token);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * 이메일 인증번호 전송
     */
    @PostMapping("/send-verification-code")
    public ResponseEntity<ApiResponse<SendVerificationCodeResponseDto>> sendVerificationCode(
            @RequestBody EmailVerificationRequestDto request
    ) {
        SendVerificationCodeResponseDto response = authService.sendVerificationCode(request.getEmail());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * 이메일 인증번호 확인
     */
    @PostMapping("/verify-email-code")
    public ResponseEntity<ApiResponse<EmailVerificationResponseDto>> verifyEmailCode(
            @RequestBody EmailVerificationRequestDto request
    ) {
        boolean verified = authService.verifyEmailCode(request.getEmail(), request.getCode());
        EmailVerificationResponseDto response = EmailVerificationResponseDto.builder()
                .verified(verified)
                .build();
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * 비밀번호 재설정용 인증번호 전송
     */
    @PostMapping("/send-password-reset-code")
    public ResponseEntity<ApiResponse<Void>> sendPasswordResetCode(
            @RequestBody EmailVerificationRequestDto request
    ) {
        authService.sendPasswordResetCode(request.getEmail());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /**
     * 이메일 인증 후 비밀번호 재설정
     */
    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @RequestBody PasswordResetRequestDto request
    ) {
        authService.resetPassword(request.getEmail(), request.getCode(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        return authHeader.substring(7);
    }
}


