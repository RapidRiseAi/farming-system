# FarmOS (rebuilt from AutoVault foundation)

FarmOS is a **mobile-first farm operations platform** rebuilt from the original workshop portal architecture.

## What this version focuses on
- Centralized farm operations logging (tasks, incidents, updates, proof)
- Role-based access with Supabase RLS
- Asset, workforce, crop, and livestock records
- Expense logging for accounting handoff (not full accounting management)
- Operational history for every key object via `farm_entity_history`

## Stack
- Next.js App Router + TypeScript
- TailwindCSS UI
- Supabase (Auth + Postgres + Storage)

## Farm modules introduced
- `/farm/dashboard`
- `/farm/tasks`
- `/farm/assets`
- `/farm/incidents`
- `/farm/expenses`
- `/farm/workforce`

## Database migration
Apply the new migration after existing migrations:
- `supabase/migrations/20260330090000_farm_operations_foundation.sql`

This migration introduces:
- expanded roles (`owner`, `farm_manager`, `supervisor`, `operator`, `admin_clerk`, `contractor`, `viewer`)
- farm assets, tasks, assignments, updates, proofs
- incident reporting
- expense logging
- workforce time tracking foundations
- crop and livestock logs
- farm-wide entity history table

## Local setup
1. `npm install`
2. `cp .env.example .env.local`
3. Configure Supabase env values
4. Apply migrations in order
5. Run: `npm run dev`

## Checks
- `npm run lint`
- `npm run typecheck`
- `npm run test`
