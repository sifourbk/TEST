'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';

export default function OverviewPage() {
  const [me, setMe] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/users/me')
      .then((r) => r.json())
      .then(setMe)
      .catch((e) => setError(e.message));
    apiFetch('/admin/analytics?days=30')
      .then((r) => r.json())
      .then(setAnalytics)
      .catch((e) => setError(e.message));
  }, []);

  const ordersTable = useMemo(() => {
    const rows: Array<{ date: string; count: number }> = analytics?.ordersPerDay ?? [];
    return rows.slice(-14).reverse();
  }, [analytics]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Overview</h1>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {me ? (
        <p style={{ marginTop: 8, color: '#5b6b80' }}>
          Signed in as <b>{me.phone}</b> ({me.adminRole})
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
        <Card title="Total Commission (30d)">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{analytics ? formatDzd(analytics.totalCommission) : '…'}</div>
        </Card>
        <Card title="Cancellation Rate (30d)">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{analytics ? `${(analytics.cancellationRate * 100).toFixed(1)}%` : '…'}</div>
        </Card>
        <Card title="Avg Pickup ETA (min)">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{analytics?.avgPickupEtaMin ? analytics.avgPickupEtaMin.toFixed(1) : '—'}</div>
        </Card>
        <Card title="Orders (last 30d)">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{analytics ? sumCounts(analytics.ordersPerDay) : '…'}</div>
        </Card>
      </div>

      <h2 style={{ marginTop: 24, marginBottom: 8 }}>Orders per day (last 14 days)</h2>
      <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #e6eef9' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={th}>Date</th>
              <th style={th}>Orders</th>
            </tr>
          </thead>
          <tbody>
            {ordersTable.map((r) => (
              <tr key={r.date}>
                <td style={td}>{r.date}</td>
                <td style={td}>{r.count}</td>
              </tr>
            ))}
            {ordersTable.length === 0 ? (
              <tr>
                <td style={td} colSpan={2}>
                  No data yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e6eef9' }}>
      <div style={{ fontSize: 12, color: '#5b6b80' }}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function formatDzd(v: number) {
  return `${v.toLocaleString('en-US')} DZD`;
}

function sumCounts(rows: Array<{ date: string; count: number }>) {
  return rows.reduce((a, b) => a + b.count, 0);
}

const th: React.CSSProperties = { padding: '8px 6px', fontSize: 12, color: '#5b6b80', borderBottom: '1px solid #e6eef9' };
const td: React.CSSProperties = { padding: '10px 6px', borderBottom: '1px solid #f2f6fd' };
