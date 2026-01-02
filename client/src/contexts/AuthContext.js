import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    toast.success('Logged out successfully');
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const response = await axios.get('/api/users/me');
      setUser(response.data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token, fetchUser]);

  const login = async (email, password) => {
    try {
      const response = await axios.post('/api/users/login', { email, password });
      const { token: newToken, user: userData } = response.data;
      
      setToken(newToken);
      setUser(userData);
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      toast.success('Welcome back!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const register = async (userData) => {
    try {
      const response = await axios.post('/api/users/register', userData);
      const { token: newToken, user: userInfo } = response.data;
      
      setToken(newToken);
      setUser(userInfo);
      localStorage.setItem('token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      toast.success('Account created successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      toast.error(message);
      return { success: false, error: message };
    }
  };


  const updateUser = (updatedUser) => {
    setUser(updatedUser);
  };

  const updatePreferences = async (preferences) => {
    try {
      const response = await axios.put('/api/users/preferences', { preferences });
      setUser(prev => ({
        ...prev,
        preferences: response.data.preferences
      }));
      toast.success('Preferences updated successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update preferences';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const updateProfile = async (profile) => {
    try {
      const response = await axios.put('/api/users/profile', { profile });
      setUser(prev => ({
        ...prev,
        profile: response.data.profile
      }));
      toast.success('Profile updated successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to update profile';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const linkTelegram = async (telegramChatId, telegramUsername) => {
    try {
      const response = await axios.post('/api/users/link-telegram', {
        telegramChatId,
        telegramUsername
      });
      setUser(prev => ({
        ...prev,
        telegramChatId: response.data.telegramChatId,
        telegramUsername: response.data.telegramUsername
      }));
      toast.success('Telegram account linked successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to link Telegram account';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const unlinkTelegram = async () => {
    try {
      await axios.delete('/api/users/unlink-telegram');
      setUser(prev => ({
        ...prev,
        telegramChatId: null,
        telegramUsername: null
      }));
      toast.success('Telegram account unlinked successfully!');
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to unlink Telegram account';
      toast.error(message);
      return { success: false, error: message };
    }
  };

  const value = {
    user,
    isAdmin: !!user?.isAdmin,
    token,
    loading,
    login,
    register,
    logout,
    updateUser,
    updatePreferences,
    updateProfile,
    linkTelegram,
    unlinkTelegram,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
