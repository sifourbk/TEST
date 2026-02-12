# Naqlo (نقلو) — Phase 2

This zip contains **Phase 2** of the Naqlo MVP:

- NestJS API foundation + Auth (OTP dev stub) + JWT + RBAC
- Admin CRUD endpoints for **Cities**, **Zones (GeoJSON)**, **Pricing Profiles**, **Commission Rules**
- Next.js Admin UI wired to those endpoints (simple, functional UI)
- Docker Compose for Postgres + Redis + API + Admin

## Run locally

1) Copy env files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
```

2) Start with Docker:

```bash
cd infra
docker compose up --build
```

3) Open:
- API health: http://localhost:3001/health
- Swagger: http://localhost:3001/docs
- Admin: http://localhost:3000

## Seeded admin (dev)
- phone: `+213000000000`
- OTP: `123456`

## Notes
- Zone editor is MVP: import/export GeoJSON + basic polygon editing scaffold.
- Pricing/commission are editable per city + truck type.
