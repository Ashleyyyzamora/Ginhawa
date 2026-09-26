import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const handleSession = ({ token, user }) => {
    tokenStore.set(token);
    setUser(user);
  };

  const value = {
    user,
    loading,
    logout,
    login: async (email, password) => handleSession(await api.login(email, password)),
    register: async (name, email, password) => handleSession(await api.register(name, email, password)),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
