# FarmOS (rebuilt from AutoVault foundation)

FarmOS is a **mobile-first farm operations platform** rebuilt from the original workshop portal architecture.

## What this version focuses on
- First-run onboarding wizard that creates operational baseline data
- Role-based farm workflows (assets, workforce, tasks, incidents, expenses)
- Activated crop and livestock modules backed by existing schema
- Operational history (`farm_entity_history`) for auditable mutations
- Dashboard rollups with overdue and lifecycle visibility

## Stack
- Next.js App Router + TypeScript
- TailwindCSS UI
- Supabase (Auth + Postgres + Storage)

## Setup
1. `npm install`
2. `cp .env.example .env.local`
3. Configure Supabase environment values
4. Apply migrations in order: `npm run db:migrate`
5. Run dev server: `npm run dev`

## Onboarding flow
Route: `/farm/onboarding`
1. Farm profile basics (+ optional sample data toggle)
2. Create first 1-3 assets
3. Add initial workforce members
4. Create first task with assignments

`/farm/dashboard` auto-redirects new farm accounts to onboarding when no core farm data exists and onboarding is not marked complete.

## Module map
- `/farm/dashboard` – KPI cards, spend rollup, overdue/open queues
- `/farm/onboarding` – first-run setup wizard
- `/farm/tasks` + `/farm/tasks/[id]` – task creation, assignment, status transitions, updates, proofs
- `/farm/assets` + `/farm/assets/[id]` – create/edit/archive assets + history timeline
- `/farm/workforce` + `/farm/workforce/[id]` – worker CRUD, clock in/out, corrections, time summaries
- `/farm/crops` – fields + crop logs
- `/farm/livestock` – herds + livestock logs
- `/farm/incidents` – incident reporting + workflow updates + corrective action
- `/farm/expenses` + `/farm/expenses/export` – expense lifecycle, receipt path capture, CSV export

## Database migrations
Apply both farm migrations after prior base migrations:
- `supabase/migrations/20260330090000_farm_operations_foundation.sql`
- `supabase/migrations/20260403150000_farm_onboarding_and_workflow_extensions.sql`

The extension migration adds:
- `farm_onboarding_progress` tracking table
- incident workflow owner (`farm_incidents.owner_profile_id`)
- RLS policy for onboarding progress

## Test commands
- `npm run lint`
- `npm run typecheck`
- `npm run test`

`npm run test` now includes:
- base RLS/immutability sanity tests
- timeline/upload feature checks
- farm onboarding + workflow checks
- farm authorization boundary checks
- farm smoke path checks (signup/login bootstrap assumption + onboarding/create/manage task flow scaffolding)
