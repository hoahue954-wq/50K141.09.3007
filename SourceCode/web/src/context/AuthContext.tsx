import React, { createContext, useContext, useState, useEffect } from 'react';
import { Role, UserProfile } from '../types';
import { api, resetMockDataToDefault } from '../api/client';

interface AuthContextType {
  user: UserProfile | null;
  role: Role | null;
  isOwner: boolean;
  isStaff: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  switchRole: (role: Role) => void;
  resetMockData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Khởi tạo người dùng ban đầu
    const currentUser = api.auth.getCurrentUser();
    setUser(currentUser);
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const loggedUser = await api.auth.login(username, password);
      setUser(loggedUser);
      return loggedUser;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.auth.logout();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = (role: Role) => {
    const switchedUser = api.auth.switchMockRole(role);
    setUser(switchedUser);
  };

  const resetMockData = () => {
    resetMockDataToDefault();
    const currentUser = api.auth.getCurrentUser();
    setUser(currentUser);
  };

  const role = user?.role || null;
  const isOwner = role === 'owner';
  const isStaff = role === 'staff';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isOwner,
        isStaff,
        isLoading,
        login,
        logout,
        switchRole,
        resetMockData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

