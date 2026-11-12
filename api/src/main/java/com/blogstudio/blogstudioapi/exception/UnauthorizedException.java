package com.blogstudio.blogstudioapi.exception;

/**
 * 인증/인가 실패 시 사용하는 커스텀 예외
 * - 로그인 실패, 유효하지 않은 토큰 등에서 사용
 */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}


