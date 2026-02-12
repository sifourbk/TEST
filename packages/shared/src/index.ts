export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
}

export enum AdminRole {
  SUPERADMIN = 'SUPERADMIN',
  OPS = 'OPS',
  VERIFICATION = 'VERIFICATION',
  FINANCE = 'FINANCE',
  SUPPORT = 'SUPPORT',
}

export enum TruckType {
  MINI = 'MINI',
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
}

export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: number[][][];
};

export const DEFAULT_NEGOTIATION = {
  negotiate_min_pct: 0.20,
  negotiate_max_pct: 0.30,
  offer_timeout_sec: 120,
  max_counters_per_side: 3,
} as const;

export const DEFAULT_COMMISSION = {
  percent: 0.10,
  min_commission: 150,
  fixed_fee: 0,
} as const;
