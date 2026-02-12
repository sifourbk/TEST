'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../lib/api';

const TRUCK_TYPES = ['MINI', 'SMALL', 'MEDIUM', 'LARGE'] as const;

export default function PricingPage() {
  const [cities, setCities] = useState<any[]>([]);
  const [cityId, setCityId] = useState<string>('');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [truckType, setTruckType] = useState<typeof TRUCK_TYPES[number]>('MINI');
  const [form, setForm] = useState<any>({
    baseFee: 500,
    rateKm: 35,
    rateKg: 0,
    minFare: 600,
    maxFare: 20000,
    negotiateMinPct: 0.20,
    negotiateMaxPct: 0.30,
    offerTimeoutSec: 120,
    maxCountersPerSide: 3,
  });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const c = await (await apiFetch('/admin/cities')).json();
    setCities(c);
    const first = c?.[0]?.id;
    setCityId((prev) => prev || first || '');
  }

  async function loadProfiles(cid: string) {
    if (!cid) return;
    const p = await (await apiFetch(`/admin/pricing?cityId=${cid}`)).json();
    setProfiles(p);
  }

  useEffect(() => {
    load().catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    loadProfiles(cityId).catch((e) => setErr(String(e)));
  }, [cityId]);

  const existing = useMemo(() => profiles.find((x) => x.truckType === truckType), [profiles, truckType]);
  useEffect(() => {
    if (existing) {
      setForm({
        baseFee: existing.baseFee,
        rateKm: existing.rateKm,
        rateKg: existing.rateKg,
        minFare: existing.minFare,
        maxFare: existing.maxFare,
        negotiateMinPct: existing.negotiateMinPct,
        negotiateMaxPct: existing.negotiateMaxPct,
        offerTimeoutSec: existing.offerTimeoutSec,
        maxCountersPerSide: existing.maxCountersPerSide,
      });
    }
  }, [existing]);

  async function save() {
    setErr(null);
    if (!cityId) return;
    await apiFetch('/admin/pricing', {
      method: 'POST',
      body: JSON.stringify({ cityId, truckType, ...form }),
    });
    await loadProfiles(cityId);
  }

  function numInput(key: string) {
    return (
      <input
        value={String(form[key] ?? '')}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
        style={{ width: '100%', padding: 8 }}
      />
    );
  }

  return (
    <div>
      <h1>Pricing Profiles</h1>
      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <label>City</label>
        <select value={cityId} onChange={(e) => setCityId(e.target.value)} style={{ padding: 8 }}>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label>Truck</label>
        <select value={truckType} onChange={(e) => setTruckType(e.target.value as any)} style={{ padding: 8 }}>
          {TRUCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 16 }}>
        <div>
          <div>base_fee</div>
          {numInput('baseFee')}
        </div>
        <div>
          <div>rate_km</div>
          {numInput('rateKm')}
        </div>
        <div>
          <div>rate_kg</div>
          {numInput('rateKg')}
        </div>
        <div>
          <div>min_fare</div>
          {numInput('minFare')}
        </div>
        <div>
          <div>max_fare</div>
          {numInput('maxFare')}
        </div>
        <div>
          <div>offer_timeout_sec</div>
          {numInput('offerTimeoutSec')}
        </div>
        <div>
          <div>max_counters_per_side</div>
          {numInput('maxCountersPerSide')}
        </div>
        <div>
          <div>negotiate_min_pct</div>
          {numInput('negotiateMinPct')}
        </div>
        <div>
          <div>negotiate_max_pct</div>
          {numInput('negotiateMaxPct')}
        </div>
      </div>

      <button onClick={save} style={{ marginTop: 16, padding: '10px 14px', background: 'var(--accent)', border: 0, color: 'white' }}>
        Save
      </button>

      <h2 style={{ marginTop: 24 }}>Current</h2>
      <pre style={{ background: 'white', padding: 12, borderRadius: 8, overflow: 'auto' }}>{JSON.stringify(profiles, null, 2)}</pre>
    </div>
  );
}
