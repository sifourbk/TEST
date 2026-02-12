'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '../lib/auth';
import { apiFetch } from '../lib/api';

type Me = { role: string; adminRole?: string; phone: string };

const ALL_ITEMS = [
  { href: '/', label: 'Overview', roles: ['SUPERADMIN', 'OPS', 'VERIFICATION', 'FINANCE', 'SUPPORT'] },
  { href: '/cities', label: 'Cities & Zones', roles: ['SUPERADMIN', 'OPS'] },
  { href: '/pricing', label: 'Pricing Profiles', roles: ['SUPERADMIN', 'OPS'] },
  { href: '/commission', label: 'Commission Rules', roles: ['SUPERADMIN', 'FINANCE'] },
  { href: '/documents', label: 'Documents Queue', roles: ['SUPERADMIN', 'VERIFICATION'] },
  { href: '/vehicles', label: 'Vehicles Queue', roles: ['SUPERADMIN', 'VERIFICATION'] },
  { href: '/settlements', label: 'Settlements', roles: ['SUPERADMIN', 'FINANCE', 'VERIFICATION'] },
  { href: '/support', label: 'Support', roles: ['SUPERADMIN', 'SUPPORT'] },
  { href: '/audit', label: 'Audit Logs', roles: ['SUPERADMIN'] },
];

export function Nav() {
  const p = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    // Avoid calling API on login page
    if (p.startsWith('/login')) return;
    apiFetch('/users/me')
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, [p]);

  const items = useMemo(() => {
    const role = me?.adminRole;
    if (!role) {
      // if not logged in, only show login link
      return [] as typeof ALL_ITEMS;
    }
    return ALL_ITEMS.filter((it) => it.roles.includes(role));
  }, [me]);

  const headerSub = me?.adminRole ? `${me.adminRole} • Phase 9` : 'Phase 9';

  return (
    <aside style={{ width: 240, background: '#fff', borderRight: '1px solid #e6eef9', padding: 16 }}>
      <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: 18 }}>Naqlo Admin</div>
      <div style={{ marginTop: 4, color: '#5b6b80', fontSize: 12 }}>{headerSub}</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {p.startsWith('/login') ? (
          <Link
            href="/login"
            style={{ padding: '10px 12px', borderRadius: 10, color: 'var(--primary)' }}
          >
            Login
          </Link>
        ) : null}
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: p === it.href ? 'rgba(25,195,125,0.15)' : 'transparent',
              color: 'var(--primary)',
            }}
          >
            {it.label}
          </Link>
        ))}
      </nav>

      {!p.startsWith('/login') && (
        <button
          onClick={() => logout()}
          style={{
            marginTop: 24,
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #e6eef9',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      )}
    </aside>
  );
}
