'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Doc = {
  id: string;
  type: string;
  status: string;
  fileUrl: string;
  aiDecision?: string | null;
  aiConfidence?: number | null;
  owner?: { phone: string };
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [status, setStatus] = useState<string>('PENDING');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/admin/documents?status=${encodeURIComponent(status)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    setDocs(await res.json());
  }

  async function review(id: string, decision: 'APPROVED' | 'REJECTED' | 'FRAUD') {
    const token = getAccessToken();
    const res = await fetch(`${API_URL}/admin/documents/${id}/review`, {
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
      <h1 style={{ margin: 0 }}>Documents Queue</h1>
      <p style={{ opacity: 0.8 }}>AI first, then human. Phase 3: AI mock endpoint exists.</p>

      <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selStyle}>
          {['PENDING', 'AI_REVIEWED', 'APPROVED', 'REJECTED', 'FRAUD'].map((s) => (
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
              <th style={th}>Type</th>
              <th style={th}>Status</th>
              <th style={th}>AI</th>
              <th style={th}>File</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eef2f7' }}>
                <td style={td}>{d.owner?.phone ?? '-'}</td>
                <td style={td}>{d.type}</td>
                <td style={td}>{d.status}</td>
                <td style={td}>
                  {d.aiDecision ? `${d.aiDecision} (${Math.round((d.aiConfidence ?? 0) * 100)}%)` : '-'}
                </td>
                <td style={td}>
                  <a href={`${API_URL}${d.fileUrl}`} target="_blank" rel="noreferrer">
                    view
                  </a>
                </td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn} onClick={() => review(d.id, 'APPROVED').catch((e) => setError(e.message))}>
                      Approve
                    </button>
                    <button
                      style={btnOutline}
                      onClick={() => review(d.id, 'REJECTED').catch((e) => setError(e.message))}
                    >
                      Reject
                    </button>
                    <button
                      style={{ ...btnOutline, borderColor: '#ffb4b4', color: '#b30000' }}
                      onClick={() => review(d.id, 'FRAUD').catch((e) => setError(e.message))}
                    >
                      Fraud
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  No documents.
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