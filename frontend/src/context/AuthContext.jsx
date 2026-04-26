import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { AuthContext } from './authContextInstance';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('timesheet-token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/auth/me');
        setUser(response.data);
      } catch {
        localStorage.removeItem('timesheet-token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'timesheet-token') {
        return;
      }

      if (!event.newValue) {
        setUser(null);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let active = true;

    const validateSession = async () => {
      const token = localStorage.getItem('timesheet-token');
      if (!token) {
        if (active) {
          setUser(null);
        }
        return;
      }

      try {
        await api.get('/auth/me');
      } catch {
        if (active) {
          localStorage.removeItem('timesheet-token');
          setUser(null);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        validateSession();
      }
    };

    const intervalId = window.setInterval(validateSession, 15000);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    localStorage.setItem('timesheet-token', response.data.token);
    setUser(response.data.user);
    return response.data.user;
  };

  const register = async (name, email, password, role) => {
    const response = await api.post('/auth/register', { name, email, password, role });
    localStorage.setItem('timesheet-token', response.data.token);
    setUser(response.data.user);
    return response.data.user;
  };

  const logout = () => {
    localStorage.removeItem('timesheet-token');
    setUser(null);
  };

  const refreshUser = async () => {
    const response = await api.get('/auth/me');
    setUser(response.data);
    return response.data;
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      setUser,
      refreshUser,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
