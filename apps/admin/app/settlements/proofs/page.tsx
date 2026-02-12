'use client';

import { useEffect, useState } from 'react';
import { getAccessToken } from '../../../lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Proof = {
  id: string;
  fileUrl: string;
  status: string;
  aiDecision?: string | null;
  aiConfidence?: number | null;
  createdAt: string;
  settlement: {
    id: string;
    amountDue: number;
    status: string;
    driver: { phone: string };
  };
};

export default function ProofsPage() {
  const [items, setItems] = useState<Proof[]>([]);
  const [status, setStatus] = useState<string>('PENDING');
  const [error, setError] = useState<string | null>(null);
  const token = getAccessToken();

  useEffect(() => {
    const run = async () => {
      setError(null);
      const res = await fetch(`${API_URL}/admin/settlements/proofs?status=${encodeURIComponent(status)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(`Failed to load proofs (${res.status})`);
        return;
      }
      setItems(await res.json());
    };
    if (token) run();
  }, [status, token]);

  const review = async (proofId: string, decision: 'approve' | 'reject' | 'fraud') => {
    const res = await fetch(`${API_URL}/admin/settlements/proofs/${proofId}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      alert(`Failed (${res.status})`);
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== proofId));
  };

  return (
    <main style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Settlement Proofs</h1>

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">PENDING</option>
          <option value="AI_REVIEWED">AI_REVIEWED</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="FRAUD">FRAUD</option>
        </select>
      </div>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
        {items.map((p) => (
          <div key={p.id} style={{ background: 'white', borderRadius: 12, padding: '1rem', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Driver: {p.settlement.driver.phone}</div>
                <div>Settlement: {p.settlement.id}</div>
                <div>Amount due: {p.settlement.amountDue} DZD</div>
                <div>Status: {p.status}</div>
                <div>AI: {p.aiDecision ?? '-'} ({p.aiConfidence ?? '-'})</div>
                <div style={{ marginTop: '0.5rem' }}>
                  <a href={`${API_URL}${p.fileUrl}`} target="_blank" rel="noreferrer">View proof</a>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button onClick={() => review(p.id, 'approve')}>Approve</button>
                <button onClick={() => review(p.id, 'reject')}>Reject</button>
                <button onClick={() => review(p.id, 'fraud')}>Fraud</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
