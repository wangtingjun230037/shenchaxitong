import axios from 'axios';
import { ElMessage } from 'element-plus';

const instance = axios.create({ baseURL: '/api' });

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

instance.interceptors.response.use(
  (resp) => resp.data,
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message;
    if (status === 401) {
      localStorage.removeItem('token');
      if (location.hash !== '#/login') location.href = '/#/login';
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(err);
  }
);

export default instance;
