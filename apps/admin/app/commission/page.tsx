'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

const TRUCK_TYPES = ['MINI', 'SMALL', 'MEDIUM', 'LARGE'] as const;

export default function CommissionPage() {
  const [cities, setCities] = useState<any[]>([]);
  const [cityId, setCityId] = useState<string>('');
  const [rules, setRules] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadCities() {
    const res = await apiFetch('/admin/cities');
    const data = await res.json();
    setCities(data);
    if (!cityId && data[0]) setCityId(data[0].id);
  }

  async function loadRules(cid: string) {
    const res = await apiFetch(`/admin/commission?cityId=${cid}`);
    setRules(await res.json());
  }

  useEffect(() => {
    loadCities().catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cityId) loadRules(cityId).catch((e) => setError(String(e)));
  }, [cityId]);

  async function save(rule: any) {
    setError(null);
    await apiFetch('/admin/commission', {
      method: 'POST',
      body: JSON.stringify({
        cityId,
        truckType: rule.truckType,
        percent: Number(rule.percent),
        minCommission: Number(rule.minCommission),
        fixedFee: Number(rule.fixedFee ?? 0),
      }),
    });
    await loadRules(cityId);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Commission Rules</h1>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 600 }}>City</label>
        <select value={cityId} onChange={(e) => setCityId(e.target.value)} style={{ marginLeft: 12, padding: 8 }}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {TRUCK_TYPES.map((tt) => {
          const r = rules.find((x) => x.truckType === tt) ?? {
            truckType: tt,
            percent: 0.1,
            minCommission: 150,
            fixedFee: 0,
          };
          return (
            <div key={tt} style={{ background: 'white', border: '1px solid #e6edf7', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>{tt}</h3>
                <button onClick={() => save(r)} style={{ background: 'var(--accent)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: 10, cursor: 'pointer' }}>
                  Save
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 10 }}>
                <Field label="percent" value={r.percent} onChange={(v) => (r.percent = v)} />
                <Field label="minCommission" value={r.minCommission} onChange={(v) => (r.minCommission = v)} />
                <Field label="fixedFee" value={r.fixedFee ?? 0} onChange={(v) => (r.fixedFee = v)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: any; onChange: (v: any) => void }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, borderRadius: 10, border: '1px solid #cfd9e8' }}
      />
    </div>
  );
}
