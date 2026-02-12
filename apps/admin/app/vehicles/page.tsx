'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Vehicle = {
  id: string;
  truckType: string;
  capacityKg: number;
  brand: string;
  model: string;
  status: string;
  owner?: { phone: string };
  photos: { id: string; fileUrl: string }[];
};

export default function VehiclesPage() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [status, setStatus] = useState<string>('PENDING');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/admin/vehicles?status=${encodeURIComponent(status)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    setItems(await res.json());
  }

  async function decide(id: string, decision: 'ACTIVATE' | 'REJECT') {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/admin/vehicles/${id}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) throw new Error(await res.text());
    await load();
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ margin: 0 }}>Vehicles Queue</h1>
      <p style={{ opacity: 0.8 }}>Enforce: capacityKg + brand/model + >=3 photos before ACTIVE.</p>

      <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
          {['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button style={btnOutline} onClick={() => load().catch((e) => setError(e.message))}>
          Refresh
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <div style={{ marginTop: 16, background: '#fff', borderRadius: 12, padding: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #eef2f7' }}>
              <th style={th}>Owner</th>
              <th style={th}>Truck</th>
              <th style={th}>Capacity</th>
              <th style={th}>Brand/Model</th>
              <th style={th}>Photos</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} style={{ borderBottom: '1px solid #eef2f7' }}>
                <td style={td}>{v.owner?.phone ?? '-'}</td>
                <td style={td}>{v.truckType}</td>
                <td style={td}>{v.capacityKg} kg</td>
                <td style={td}>
                  {v.brand} {v.model}
                </td>
                <td style={td}>{v.photos?.length ?? 0}</td>
                <td style={td}>{v.status}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn} onClick={() => decide(v.id, 'ACTIVATE').catch((e) => setError(e.message))}>
                      Activate
                    </button>
                    <button
                      style={btnOutline}
                      onClick={() => decide(v.id, 'REJECT').catch((e) => setError(e.message))}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td style={td} colSpan={7}>
                  No vehicles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th: React.CSSProperties = { padding: '10px 8px', fontSize: 12, opacity: 0.75 };
const td: React.CSSProperties = { padding: '10px 8px', fontSize: 14 };
const selStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #d0d7e2',
  background: '#fff',
};
const btn: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 10,
  border: 'none',
  background: '#19C37D',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
const btnOutline: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #d0d7e2',
  background: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  color: '#0B1F3A',
};
