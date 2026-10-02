import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

// There are no user accounts: anyone can view. The Ginhawa team signs in with the admin
// passcode (Settings → Team admin) to rename stations, set thresholds and remove stations.
const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setIsAdmin(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!tokenStore.get()) return;
    api.adminMe().then(() => setIsAdmin(true)).catch(signOut);
  }, [signOut]);

  const signIn = async (passcode) => {
    const { token } = await api.adminLogin(passcode);
    tokenStore.set(token);
    setIsAdmin(true);
  };

  return <AdminContext.Provider value={{ isAdmin, signIn, signOut }}>{children}</AdminContext.Provider>;
}

export const useAdmin = () => useContext(AdminContext);
