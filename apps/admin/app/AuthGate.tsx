'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export type Me = { id: string; role: string; adminRole?: string; phone: string };

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) {
      setReady(true);
      return;
    }
    apiFetch('/users/me')
      .then((r) => r.json())
      .then((me: Me) => {
        if (me.role !== 'ADMIN') {
          window.location.href = '/login';
          return;
        }
        setReady(true);
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  if (!ready) {
    return <p style={{ padding: 24 }}>Checking session…</p>;
  }
  return <>{children}</>;
}
