import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5001/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('timesheet-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const token = localStorage.getItem('timesheet-token');

    if (status === 401 && token) {
      localStorage.removeItem('timesheet-token');

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        const loginUrl = new URL('/login', window.location.origin);
        loginUrl.searchParams.set('sessionExpired', '1');
        window.location.assign(loginUrl.toString());
      }
    }

    return Promise.reject(error);
  }
);

export default api;
