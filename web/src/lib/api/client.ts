import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { buildLoginUrl, isLoginPath, isProtectedPath } from "../auth-routes";
import { tokenStorage } from "./utils";
import { getOrCreateVisitorId } from "./visitor-id";

const API_PORT = process.env.NEXT_PUBLIC_API_PORT || "8080";

/** 접속한 주소(hostname) 기준으로 API base URL 반환 - IP 접속 시 동일 hostname으로 API 호출 */
function getApiBaseUrl(): string {
  const envUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined") {
    // 브라우저: localhost/127.0.0.1이면 항상 현재 페이지 hostname 사용 (IP 접속 시 필수)
    const useCurrentHost =
      !envUrl || envUrl.includes("localhost") || envUrl.includes("127.0.0.1");
    if (!useCurrentHost) return envUrl;

    const host = window.location.hostname;
    const port = envUrl?.match(/:(\d+)/)?.[1] ?? API_PORT;
    const protocol = window.location.protocol;
    return `${protocol}//${host}:${port}/api`;
  }

  return envUrl || `http://localhost:${API_PORT}/api`;
}

// API 클라이언트 설정
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: getApiBaseUrl(),
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // 요청 인터셉터
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // 브라우저에서는 접속 호스트 기준으로 API 주소 사용 (localhost / PC IP 둘 다 대응)
        config.baseURL = getApiBaseUrl();
        // 토큰이 있다면 헤더에 추가
        const token = this.getToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        const visitorId = getOrCreateVisitorId();
        if (visitorId && config.headers) {
          config.headers["X-Visitor-Id"] = visitorId;
        }
        return config;
      },
      (error: unknown) => {
        return Promise.reject(error);
      },
    );

    // 응답 인터셉터
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error: unknown) => {
        // 401 = 토큰 없음/만료. 토큰은 정리하되, 화면 이동은 계정이 필요한 페이지에서만.
        // 공개 페이지를 둘러보는 비로그인 사용자가 로그인 화면으로 튕기지 않도록 한다.
        if (error && typeof error === "object" && "response" in error) {
          const apiError = error as { response?: { status?: number } };
          if (apiError.response?.status === 401) {
            this.removeToken();
            if (typeof window !== "undefined") {
              const { pathname, search } = window.location;
              if (!isLoginPath(pathname) && isProtectedPath(pathname)) {
                // 세션 만료 → 로그인 후 보던 화면으로 복귀
                window.location.href = buildLoginUrl(pathname, search);
              }
            }
          }
        }
        return Promise.reject(error);
      },
    );
  }

  // 토큰 관리
  private getToken(): string | null {
    return tokenStorage.get();
  }

  private removeToken(): void {
    tokenStorage.remove();
  }

  // HTTP 메서드들
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(
      url,
      data,
      config,
    );
    return response.data;
  }

  async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.patch(
      url,
      data,
      config,
    );
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }

  // 토큰 설정
  setToken(token: string): void {
    tokenStorage.set(token);
  }
}

// 싱글톤 인스턴스
export const apiClient = new ApiClient();
export default apiClient;
