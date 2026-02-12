'use client';

import { useState } from 'react';
import { z } from 'zod';
import { setTokens } from '../../lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const PhoneSchema = z.string().min(6);

export default function LoginPage() {
  const [phone, setPhone] = useState('+213000000000');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('123456');
  const [msg, setMsg] = useState<string | null>(null);

  async function requestOtp() {
    setMsg(null);
    const p = PhoneSchema.parse(phone);
    const res = await fetch(`${API_URL}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: p }),
    });
    if (!res.ok) throw new Error(await res.text());
    setOtpSent(true);
    setMsg('OTP sent (dev stub).');
  }

  async function verifyOtp() {
    setMsg(null);
    const res = await fetch(`${API_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    window.location.href = '/';
  }

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: 24, background: '#fff', borderRadius: 12 }}>
      <h1 style={{ margin: 0 }}>Naqlo Admin</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Login with phone OTP (dev stub).</p>

      <label style={{ display: 'block', marginTop: 16 }}>Phone</label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />

      {!otpSent ? (
        <button style={btnStyle} onClick={() => requestOtp().catch((e) => setMsg(e.message))}>
          Request OTP
        </button>
      ) : (
        <>
          <label style={{ display: 'block', marginTop: 16 }}>OTP</label>
          <input value={otp} onChange={(e) => setOtp(e.target.value)} style={inputStyle} />
          <button style={btnStyle} onClick={() => verifyOtp().catch((e) => setMsg(e.message))}>
            Verify & Login
          </button>
        </>
      )}

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d0d7e2',
  marginTop: 6,
};

const btnStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 16,
  padding: '10px 12px',
  borderRadius: 10,
  border: 'none',
  background: '#19C37D',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
