'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '../../../lib/api';

const Map = dynamic(() => import('../../components/ZoneMap'), { ssr: false });

export default function CityZonesPage() {
  const params = useParams();
  const cityId = params?.id as string;

  const [zones, setZones] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [geojson, setGeojson] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch(`/admin/zones?cityId=${cityId}`);
    const data = await res.json();
    setZones(data);
  }

  useEffect(() => {
    if (cityId) load().catch((e) => setErr(String(e)));
  }, [cityId]);

  const selected = useMemo(() => zones[0], [zones]);

  async function createZone() {
    setErr(null);
    const polygon = JSON.parse(geojson);
    await apiFetch('/admin/zones', { method: 'POST', body: JSON.stringify({ cityId, name, polygon }) });
    setName('');
    setGeojson('');
    await load();
  }

  async function updateZone(id: string, polygon: any) {
    await apiFetch(`/admin/zones/${id}`, { method: 'PATCH', body: JSON.stringify({ polygon }) });
    await load();
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Zones</h1>
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Create zone (GeoJSON)</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zone name" style={{ width: '100%', padding: 10, marginTop: 8 }} />
          <textarea value={geojson} onChange={(e) => setGeojson(e.target.value)} placeholder='{"type":"Polygon","coordinates":[...]}' style={{ width: '100%', height: 180, padding: 10, marginTop: 8, fontFamily: 'monospace' }} />
          <button onClick={createZone} style={{ marginTop: 8, padding: '10px 12px', background: '#19C37D', border: 0, color: 'white', borderRadius: 8 }}>Create</button>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 16 }}>Existing zones</h2>
          <ul>
            {zones.map((z) => (
              <li key={z.id} style={{ marginTop: 6 }}>
                <b>{z.name}</b>
                <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.8, wordBreak: 'break-all' }}>{JSON.stringify(z.polygon)}</div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Map (MVP)</h2>
          <p style={{ opacity: 0.8, marginTop: 0 }}>
            This map shows the first zone polygon. Drawing support is scaffolded; you can update the polygon programmatically.
          </p>
          <div style={{ height: 420, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(11,31,58,0.12)' }}>
            <Map zone={selected} onSave={(poly: any) => selected && updateZone(selected.id, poly)} />
          </div>
        </div>
      </div>
    </div>
  );
}
