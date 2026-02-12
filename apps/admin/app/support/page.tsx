'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { Nav } from '../nav';

type Ticket = {
  id: string;
  status: string;
  category: string;
  priority: string;
  escalatedReason?: string | null;
  takenOverById?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { phone: string };
};

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch('/admin/support/tickets');
      const data = await res.json();
      setTickets(data);
    } catch (e: any) {
      setErr(e.message || 'Failed to load tickets');
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1, padding: 24 }}>
        <h1 style={{ margin: 0 }}>Support</h1>
        <p style={{ marginTop: 8, color: '#5b6b80' }}>Tickets and chat takeover.</p>

        {err && <div style={{ color: 'crimson' }}>{err}</div>}

        <div style={{ marginTop: 16, border: '1px solid #e6eef9', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f4f8ff', textAlign: 'left' }}>
                <th style={{ padding: 12 }}>Ticket</th>
                <th style={{ padding: 12 }}>Requester</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Category</th>
                <th style={{ padding: 12 }}>Priority</th>
                <th style={{ padding: 12 }}>Escalation</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid #e6eef9' }}>
                  <td style={{ padding: 12 }}>
                    <Link href={`/support/${t.id}`} style={{ color: 'var(--primary)', fontWeight: 700 }}>
                      {t.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td style={{ padding: 12 }}>{t.createdBy?.phone || '-'}</td>
                  <td style={{ padding: 12 }}>{t.status}</td>
                  <td style={{ padding: 12 }}>{t.category}</td>
                  <td style={{ padding: 12 }}>{t.priority}</td>
                  <td style={{ padding: 12 }}>{t.escalatedReason || (t.takenOverById ? 'Taken over' : '-')}</td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, color: '#5b6b80' }}>
                    No tickets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
