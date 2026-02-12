'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';

export type GeoJSONPolygon = { type: 'Polygon'; coordinates: number[][][] };

function toLatLngs(poly: GeoJSONPolygon): LatLngExpression[] {
  // GeoJSON [lng,lat] -> Leaflet [lat,lng]
  return poly.coordinates[0].map(([lng, lat]) => [lat, lng] as LatLngExpression);
}

export default function ZoneMap({ polygon }: { polygon: GeoJSONPolygon | null }) {
  const center: LatLngExpression = polygon ? toLatLngs(polygon)[0] : [36.75, 3.05];
  return (
    <MapContainer center={center} zoom={11} style={{ height: 360, width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {polygon ? <Polygon positions={toLatLngs(polygon)} /> : null}
    </MapContainer>
  );
}
