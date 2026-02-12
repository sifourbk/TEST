'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function AuditLogsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(more: boolean) {
    setError(null);
    const url = more && cursor ? `/admin/audit-logs?limit=50&cursor=${encodeURIComponent(cursor)}` : '/admin/audit-logs?limit=50';
    try {
      const r = await apiFetch(url);
      const data = await r.json();
      setItems((prev) => (more ? [...prev, ...(data.items || [])] : (data.items || [])));
      setCursor(data.nextCursor);
    } catch (e: any) {
      setError(e.message || 'Failed to load audit logs');
    }
  }

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Audit Logs</h1>
      <p style={{ color: '#5b6b80', marginTop: 8 }}>SuperAdmin-only. Tracks sensitive actions.</p>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #e6eef9' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={th}>When</th>
              <th style={th}>Actor</th>
              <th style={th}>Action</th>
              <th style={th}>Entity</th>
              <th style={th}>EntityId</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={td}>{new Date(it.createdAt).toLocaleString()}</td>
                <td style={td}>{it.actorId || '—'}</td>
                <td style={td}><code>{it.action}</code></td>
                <td style={td}>{it.entity}</td>
                <td style={td}><code>{it.entityId || '—'}</code></td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td style={td} colSpan={5}>No audit logs yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <button
        disabled={!cursor}
        onClick={() => load(true)}
        style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid #e6eef9', background: '#fff', cursor: cursor ? 'pointer' : 'not-allowed' }}
      >
        Load more
      </button>
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 6px', fontSize: 12, color: '#5b6b80', borderBottom: '1px solid #e6eef9' };
const td: React.CSSProperties = { padding: '10px 6px', borderBottom: '1px solid #f2f6fd', verticalAlign: 'top' };
