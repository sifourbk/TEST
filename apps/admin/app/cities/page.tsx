'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function CitiesPage() {
  const [cities, setCities] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch('/admin/cities');
    setCities(await res.json());
  }
  useEffect(() => { load().catch(e => setErr(String(e))); }, []);

  async function createCity() {
    setErr(null);
    await apiFetch('/admin/cities', { method: 'POST', body: JSON.stringify({ name }) });
    setName('');
    await load();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Cities</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="City name" style={{ padding: 10, borderRadius: 8, border: '1px solid #d0d7e2', width: 240 }} />
        <button onClick={createCity} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>Add</button>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5eaf3' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 12 }}>Name</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Active</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Zones</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid #eef2f7' }}>
                <td style={{ padding: 12 }}>{c.name}</td>
                <td style={{ padding: 12 }}>{String(c.isActive)}</td>
                <td style={{ padding: 12 }}>
                  <Link href={`/cities/${c.id}`} style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Manage</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
