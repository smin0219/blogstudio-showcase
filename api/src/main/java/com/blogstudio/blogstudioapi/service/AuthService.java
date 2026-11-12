package com.blogstudio.blogstudioapi.service;

import com.blogstudio.blogstudioapi.dto.request.LoginRequestDto;
import com.blogstudio.blogstudioapi.dto.request.UserCreateRequestDto;
import com.blogstudio.blogstudioapi.dto.response.LoginResponseDto;
import com.blogstudio.blogstudioapi.dto.response.SendVerificationCodeResponseDto;
import com.blogstudio.blogstudioapi.dto.response.UserResponseDto;

public interface AuthService extends BaseService {

    LoginResponseDto login(LoginRequestDto request);

    UserResponseDto register(UserCreateRequestDto request);

    void logout(String token);

    LoginResponseDto refreshToken(String token);

    UserResponseDto getCurrentUser(String token);

    Long getUserIdFromToken(String token);

    /**
     * 이메일 인증번호 전송
     * @param email 이메일 주소
     */
    SendVerificationCodeResponseDto sendVerificationCode(String email);

    /**
     * 이메일 인증번호 확인
     * @param email 이메일 주소
     * @param code 인증번호
     * @return 인증 성공 여부
     */
    boolean verifyEmailCode(String email, String code);

    /**
     * 비밀번호 재설정용 인증번호 전송 (등록된 이메일만)
     */
    void sendPasswordResetCode(String email);

    /**
     * 이메일 인증 후 비밀번호 재설정
     */
    void resetPassword(String email, String code, String newPassword);
}


