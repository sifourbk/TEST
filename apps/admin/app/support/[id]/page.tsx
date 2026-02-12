'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import { Nav } from '../../nav';

type Message = {
  id: string;
  senderType: string;
  content: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  status: string;
  category: string;
  priority: string;
  escalatedReason?: string | null;
  takenOverById?: string | null;
  messages: Message[];
  createdBy?: { phone: string };
};

export default function SupportTicketDetailPage() {
  const params = useParams();
  const id = useMemo(() => (params?.id as string) || '', [params]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const res = await apiFetch(`/admin/support/tickets/${id}`);
      const data = await res.json();
      setTicket(data);
      setErr(null);
    } catch (e: any) {
      setErr(e.message || 'Failed to load ticket');
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id]);

  async function takeOver() {
    await apiFetch(`/admin/support/tickets/${id}/takeover`, { method: 'POST' });
    await load();
  }

  async function send() {
    if (!msg.trim()) return;
    await apiFetch(`/admin/support/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ message: msg }) });
    setMsg('');
    await load();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Nav />
      <main style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Ticket {id.slice(0, 8)}…</h1>
          {ticket && (
            <p style={{ marginTop: 8, color: '#5b6b80' }}>
              {ticket.createdBy?.phone || '-'} • {ticket.status} • {ticket.category} • {ticket.priority}
              {ticket.escalatedReason ? ` • Escalated: ${ticket.escalatedReason}` : ''}
            </p>
          )}
          {err && <div style={{ color: 'crimson' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={takeOver}
            disabled={!ticket || !!ticket.takenOverById}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e6eef9',
              background: ticket?.takenOverById ? '#f4f8ff' : 'rgba(25,195,125,0.15)',
              cursor: ticket?.takenOverById ? 'not-allowed' : 'pointer',
              color: 'var(--primary)',
              fontWeight: 700,
            }}
          >
            {ticket?.takenOverById ? 'Taken over' : 'Take over from AI'}
          </button>
        </div>

        <div
          style={{
            flex: 1,
            background: '#fff',
            border: '1px solid #e6eef9',
            borderRadius: 12,
            padding: 12,
            overflow: 'auto',
          }}
        >
          {ticket?.messages?.map((m) => (
            <div key={m.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#5b6b80' }}>
                {new Date(m.createdAt).toLocaleString()} • {m.senderType}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
          ))}
          {!ticket && <div style={{ color: '#5b6b80' }}>Loading…</div>}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder={ticket?.takenOverById ? 'Reply as human…' : 'Take over to reply…'}
            disabled={!ticket?.takenOverById}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #e6eef9' }}
          />
          <button
            onClick={send}
            disabled={!ticket?.takenOverById || !msg.trim()}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e6eef9', background: '#19C37D', color: '#0B1F3A', fontWeight: 800 }}
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
