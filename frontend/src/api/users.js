import http from './http';

export const getUsers = async () => {
  const { data } = await http.get('/users');
  return data;
};

export const createUser = async (payload) => {
  const { data } = await http.post('/users', payload);
  return data;
};

export const updateUser = async (id, payload) => {
  const { data } = await http.put(`/users/${id}`, payload);
  return data;
};

export const changeUserPassword = async (id, password) => {
  const { data } = await http.patch(`/users/${id}/password`, { password });
  return data;
};

export const updateUserStatus = async (id, isActive) => {
  const { data } = await http.patch(`/users/${id}/status`, { isActive });
  return data;
};

export const getAsesores = async () => {
  const { data } = await http.get('/users/asesores');
  return data;
};

export const verifyAdminPassword = async (password) => {
  const { data } = await http.post('/users/verify-admin-password', { password });
  return data; // { token }
};

export const revealUserPassword = async (id, revealToken) => {
  const { data } = await http.get(`/users/${id}/password-reveal`, {
    params: { revealToken }
  });
  return data; // { password }
};
