import { getAccessToken, setAccessToken, getRefreshToken, logout } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return false;
  const data = await res.json();
  if (data?.accessToken) {
    setAccessToken(data.accessToken);
    return true;
  }
  return false;
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as any),
  };
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      logout();
      throw new Error('Unauthorized');
    }
    const token2 = getAccessToken();
    const headers2 = { ...headers, Authorization: `Bearer ${token2}` };
    const res2 = await fetch(url, { ...options, headers: headers2 });
    if (!res2.ok) throw new Error(await res2.text());
    return res2;
  }
  if (!res.ok) throw new Error(await res.text());
  return res;
}
