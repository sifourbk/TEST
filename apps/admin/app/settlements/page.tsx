'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../../lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Settlement = {
  id: string;
  driverId: string;
  weekStart: string;
  weekEnd: string;
  amountDue: number;
  status: string;
  overdueAt: string | null;
  verifiedAt: string | null;
  driver?: { phone: string };
};

export default function SettlementsPage() {
  const [items, setItems] = useState<Settlement[]>([]);
  const [status, setStatus] = useState('');
  const token = useMemo(() => getAccessToken(), []);

  useEffect(() => {
    const run = async () => {
      const res = await fetch(`${API_URL}/admin/settlements${status ? `?status=${status}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      setItems(Array.isArray(json) ? json : []);
    };
    run();
  }, [status, token]);

  return (
    <main style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Settlements</h1>
      <p style={{ marginTop: '.5rem', opacity: .8 }}>Weekly settlements (Sun→Sat) and verification status.</p>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label>Status:</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="OPEN">OPEN</option>
          <option value="PROOF_PENDING">PROOF_PENDING</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="OVERDUE">OVERDUE</option>
          <option value="FRAUD">FRAUD</option>
        </select>
        <a href="/settlements/proofs" style={{ marginLeft: 'auto', color: '#19C37D', fontWeight: 600 }}>
          Proof Queue →
        </a>
      </div>

      <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: '0.5rem' }}>Driver</th>
            <th style={{ padding: '0.5rem' }}>Week</th>
            <th style={{ padding: '0.5rem' }}>Amount Due</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '0.5rem' }}>{s.driver?.phone ?? s.driverId}</td>
              <td style={{ padding: '0.5rem' }}>
                {new Date(s.weekStart).toLocaleDateString()} → {new Date(s.weekEnd).toLocaleDateString()}
              </td>
              <td style={{ padding: '0.5rem' }}>{s.amountDue} DZD</td>
              <td style={{ padding: '0.5rem', fontWeight: 600 }}>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
