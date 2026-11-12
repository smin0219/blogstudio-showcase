import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { authApi, flushAuthErrorQueue } from "./services";
import type { User } from "./types";
import { getErrorMessage, tokenStorage } from "./utils";

// 상태 타입 정의
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// 액션 타입 정의
type AuthAction =
  | { type: "AUTH_START" }
  | { type: "AUTH_SUCCESS"; payload: { user: User; token: string } }
  | { type: "AUTH_FAILURE"; payload: string }
  | { type: "AUTH_LOGOUT" }
  | { type: "CLEAR_ERROR" }
  | { type: "UPDATE_USER"; payload: User };

// 초기 상태
const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: true, // 초기에는 true로 설정하여 인증 확인 전까지 대기
  isAuthenticated: false,
  error: null,
};

// 리듀서
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case "AUTH_START":
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case "AUTH_SUCCESS":
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      };
    case "AUTH_FAILURE":
      return {
        ...state,
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        error: action.payload,
      };
    case "AUTH_LOGOUT":
      return {
        ...state,
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      };
    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };
    case "UPDATE_USER":
      return {
        ...state,
        user: action.payload,
      };
    default:
      return state;
  }
};

// 컨텍스트 타입
interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    name: string,
    phone: string,
    topics: string[],
  ) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: User) => void;
  refreshToken: () => Promise<void>;
}

// 컨텍스트 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 프로바이더 컴포넌트
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // 토큰 저장/제거 (localStorage + 쿠키 동기화, middleware 인증 체크용)
  const saveToken = useCallback((token: string) => {
    tokenStorage.set(token);
  }, []);

  const removeToken = useCallback(() => {
    tokenStorage.remove();
  }, []);

  // 로그인
  const login = async (email: string, password: string) => {
    try {
      dispatch({ type: "AUTH_START" });
      const response = await authApi.login({ email, password });
      saveToken(response.token);
      dispatch({
        type: "AUTH_SUCCESS",
        payload: { user: response.user, token: response.token },
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      dispatch({ type: "AUTH_FAILURE", payload: errorMessage });
      throw error;
    }
  };

  // 회원가입
  const register = async (
    email: string,
    password: string,
    name: string,
    phone: string,
    topics: string[],
  ) => {
    try {
      dispatch({ type: "AUTH_START" });
      await authApi.register({ email, password, name, phone, topics });
      // 회원가입 후 자동 로그인은 하지 않음
      dispatch({ type: "AUTH_FAILURE", payload: "" });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      dispatch({ type: "AUTH_FAILURE", payload: errorMessage });
      throw error;
    }
  };

  // 로그아웃
  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // 로그아웃 실패해도 클라이언트에서는 로그아웃 처리
      console.error("Logout error");
    } finally {
      removeToken();
      dispatch({ type: "AUTH_LOGOUT" });
    }
  };

  // 에러 클리어
  const clearError = () => {
    dispatch({ type: "CLEAR_ERROR" });
  };

  // 사용자 정보 업데이트
  const updateUser = (user: User) => {
    dispatch({ type: "UPDATE_USER", payload: user });
  };

  // 토큰 갱신
  const refreshToken = async () => {
    try {
      const response = await authApi.refreshToken();
      saveToken(response.token);
      dispatch({
        type: "AUTH_SUCCESS",
        payload: { user: response.user, token: response.token },
      });
    } catch {
      removeToken();
      dispatch({ type: "AUTH_LOGOUT" });
    }
  };

  // 초기 로드 시 토큰 확인 + 이전 네트워크 에러로 쌓인 auth-error 큐 재전송
  useEffect(() => {
    const initializeAuth = async () => {
      const token = tokenStorage.get();
      if (token) {
        saveToken(token); // 쿠키 동기화 (localStorage에만 있는 구 세션 대비)
        try {
          const user = await authApi.getCurrentUser();
          dispatch({
            type: "AUTH_SUCCESS",
            payload: { user, token },
          });
        } catch {
          removeToken();
          dispatch({ type: "AUTH_LOGOUT" });
        }
      } else {
        // 토큰이 없으면 로딩 완료 처리
        dispatch({ type: "AUTH_LOGOUT" });
      }
      // 핸드폰 IP 접속 등 네트워크 에러 시 큐에 쌓인 로그 → API 복구되면 재전송
      flushAuthErrorQueue();
    };

    initializeAuth();
  }, [saveToken, removeToken]);

  const contextValue: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    clearError,
    updateUser,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

// 커스텀 훅
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// 인증이 필요한 컴포넌트를 위한 HOC
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> => {
  return (props: P) => {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return <div>로딩 중...</div>;
    }

    if (!isAuthenticated) {
      return <div>로그인이 필요합니다.</div>;
    }

    return <Component {...props} />;
  };
};
