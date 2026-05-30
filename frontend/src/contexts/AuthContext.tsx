import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from "../types/api";
import * as authApi from "../api/auth";

interface AuthContextType {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (credentials: LoginRequest) => Promise<void>;
	register: (data: RegisterRequest) => Promise<void>;
	setAuthFromResponse: (response: AuthResponse) => void;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
	updateUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const initAuth = async () => {
			try {
				await authApi.refresh();
				const userData = await authApi.getMe();
				setUser(userData);
			} catch (error: any) {
				setUser(null);
			}
			setIsLoading(false);
		};

    initAuth();
  }, []);

  // PWA 백그라운드 복귀 시 토큰 사전 갱신 (재생 중 401 방지)
  useEffect(() => {
    let lastRefreshAt = Date.now();
    const REFRESH_INTERVAL = 5 * 60 * 1000; // 5분 이상 지났을 때만 갱신

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      if (!user) return;
      if (Date.now() - lastRefreshAt < REFRESH_INTERVAL) return;

      try {
        await authApi.refresh();
        lastRefreshAt = Date.now();
      } catch {
        // refresh 실패 시 자연스럽게 다음 API 요청에서 처리됨
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

	const login = async (credentials: LoginRequest) => {
		const response: AuthResponse = await authApi.login(credentials);
		setUser(response.user);
	};

	const register = async (data: RegisterRequest) => {
		const response: AuthResponse = await authApi.register(data);
		setUser(response.user);
	};

	const setAuthFromResponse = (response: AuthResponse) => {
		setUser(response.user);
	};

	const logout = async () => {
		try {
			await authApi.logout();
		} catch {
		}
		setUser(null);
	};

  const refreshUser = async () => {
		try {
			const userData = await authApi.getMe();
			setUser(userData);
		} catch (error) {
			await logout();
		}
	};

  const updateUsername = async (username: string) => {
    try {
      const updatedUser = await authApi.updateUsername(username);
      setUser(updatedUser);
    } catch (error) {
      throw error;
    }
  };

	const value: AuthContextType = {
		user,
		isAuthenticated: !!user,
		isLoading,
		login,
		register,
		setAuthFromResponse,
    logout,
    refreshUser,
    updateUsername,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
