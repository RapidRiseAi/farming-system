# Rapid Rise AI Farm Operations Plan vs Current Project (Gap Analysis)

## Scope and method

This assessment compares the uploaded plan (`Rapid_Rise_AI_Farm_Operations_Product_Plan (1).docx`, extracted to `docs/product-plan-extracted.txt`) against the current app routes, server actions, and database migrations in this repository.

I used three lenses:

1. **Plan intent** (what v1 must do).
2. **Current implementation** (tables, actions, pages, APIs).
3. **Alignment outcome**: **Aligned**, **Partially aligned**, or **Gap** with concrete follow-up actions.

---

## Executive alignment summary

### What is already strongly aligned

- Core operations modules are present: assets, tasks, requests/work orders, incidents, crops, livestock, stores, documents, visitors, structure, dashboard, reports, search.
- Multi-tenant + RLS model exists and is used broadly across farm tables.
- Farm structure entities (sites/areas/production units) exist.
- Maintenance/fault workflows and downtime tracking exist.
- Incident lifecycle and impact linking exist.
- Reminders engine exists (DB + trigger synchronization).
- CSV reporting and integration endpoints exist (schemas, jobs, events, geo, webhooks).
- AI guardrail types/utilities exist for safe-assist framing.

### Where biggest gaps remain

1. **Frontline UX readiness** (offline behavior, true camera/voice-first capture, multilingual UX) is not implemented end-to-end.
2. **Role-native product experience** is only partially implemented (roles exist, but role-specific navigation/home/workflows are still broad and shared).
3. **Compliance/evidence rigor** is partly implemented, but key compliance-grade structures (version retention controls, policy ack/training workflows, tighter traceability chain) need expansion.
4. **External stakeholder portals** (buyer/client and scoped partner experiences) are not implemented as dedicated portals.
5. **Finance bridge specifics** (Sage/Pastel mappings + production-ready export contracts) are not complete.
6. **AI assist features in product UX** (voice-note-to-draft, grounded Q&A, anomaly UX) are scaffolded but not deployed as user-facing workflows.

---

## Detailed gap list (what to add/change/update)

## 1) Product positioning, naming, and packaging

### 1.1 Branding consistency
- **Gap**: Internal branding/config still references AutoVault in places, while plan positions a dedicated farm operations product identity.
- **Required updates**:
  - Rename app-level product identifiers (`appName`, email branding, plan names) from workshop/AutoVault-centric labels to farm product naming.
  - Add tenant-level terminology packs (farm-specific language by archetype) as first-class config.

### 1.2 Industry packs as explicit product packaging
- **Partial**: Crop/livestock modules exist, but industry packs are not clearly packaged/configured for archetypes (export horticulture, livestock-heavy, mixed, estate/game).
- **Required updates**:
  - Introduce tenant-level “pack selection” and per-pack feature toggles.
  - Add seeded statuses/labels/forms per pack.

---

## 2) Role model and permissions (critical)

### 2.1 Role granularity vs plan roles
- **Partial**: Roles exist (`owner`, `farm_manager`, `supervisor`, `operator`, `admin_clerk`, `contractor`, `viewer`) but plan expects clearer role templates including workshop manager, stores controller, compliance/admin, buyer/external client.
- **Required updates**:
  - Add explicit role templates and permission bundles for: workshop manager, stores controller, compliance manager, buyer/client portal user, vet/agronomist partner.
  - Add migration/tooling to map legacy roles to template-based capabilities.

### 2.2 Role-native UX/home
- **Partial**: Dashboard variants exist, but nav/actions are mostly global for all farm roles.
- **Required updates**:
  - Role-specific landing routes + menu visibility.
  - Role-specific default queues (e.g., operator: assigned tasks only; compliance: expiries/actions).
  - Hide irrelevant create/edit controls for lower roles in UI (not only action-layer guards).

### 2.3 Contractor/partner scoped access
- **Partial**: Contractor role exists conceptually; no dedicated scoped external workflow surface.
- **Required updates**:
  - Invite-only partner workspace.
  - Object-scoped access (specific work orders/visits/incidents only).
  - Time-bounded access and explicit access audit logs.

---

## 3) Farm structure and master data

### 3.1 Structure completeness
- **Partial**: Sites/areas/production units exist and include hierarchy, centroids/boundaries.
- **Required updates**:
  - Add missing structured attributes from plan by area subtype (e.g., irrigation type, carrying capacity notes, water point availability, risk class, responsible person).
  - Area-type-specific validation rules/forms.

### 3.2 Map and geometry UX
- **Gap**: Geometry fields exist, but map-first creation/edit and boundary visualization are not user-ready.
- **Required updates**:
  - Interactive map drawing/editing for site/area boundaries.
  - Map overlays for tasks/incidents/visits/asset location.
  - Coordinate quality checks and snapping tools.

### 3.3 Emergency and compliance context in master data
- **Partial**: Emergency contacts exist for sites.
- **Required updates**:
  - Structured emergency contact register (role, phone, escalation order).
  - Site risk profile + response SOP links.

---

## 4) Asset register and maintenance

### 4.1 Asset data model vs plan fields
- **Partial**: Core maintenance fields exist (meter, interval, due date, status, criticality).
- **Required updates**:
  - Add/standardize required fields: assigned team/person, commissioned/purchase dates, multi-ID strategy (VIN/serial/registration), location lookup normalization.
  - Tighten enum alignment with plan statuses (`active`, `down`, `under repair`, `retired`, `standby`) across DB + UI.

### 4.2 Maintenance workflow depth
- **Partial**: Faults/service events and downtime exist.
- **Required updates**:
  - Add explicit preventive vs breakdown source on each work order path.
  - Add required structured close-out root cause and follow-up actions on closure.
  - Add waiting-parts operational SLA tracking.

### 4.3 Yard usability and QR/NFC
- **Partial**: QR entry card links exist, but scanning workflow not fully implemented.
- **Required updates**:
  - True camera QR scan flow on mobile.
  - Fast “scan → history + next action” screens for field usage.
  - Label generation pipeline (print-friendly asset tags).

---

## 5) Work requests, work orders, and tasks

### 5.1 Funnel integrity
- **Partial**: request → approval status → convert to work order exists.
- **Required updates**:
  - Add configurable approval policies by request type/severity/site.
  - Add SLA timers + breach alerts at each funnel stage.
  - Add structured rejection reasons and analytics.

### 5.2 Checklist-driven execution
- **Partial**: Task templates exist at basic level; checklists not yet first-class reusable entities.
- **Required updates**:
  - Reusable checklist template library (per module).
  - Mandatory proof-by-template rules (photo/signature/document).
  - Template governance (versioning + approval).

### 5.3 Mobile speed target (<60s logging)
- **Gap**: Workflows are functional but still form-heavy and text-centric in places.
- **Required updates**:
  - Progressive field reveal and “quick capture” modes.
  - Single-tap status updates and evidence shortcuts.
  - Instrument real median logging time and optimize flows that exceed 60 seconds.

---

## 6) Livestock operations pack

### 6.1 Group-first + individual traceability
- **Partial**: Group/herd event model exists with movement/treatment/follow-up.
- **Required updates**:
  - Stronger individual-animal support where required (ID/tag registry, lineage hooks).
  - Production-unit traceability links to match RMIS direction.
  - Movement chain validation (from/to location logic, biosecurity state transitions).

### 6.2 Biosecurity as first-class workflow
- **Partial**: Incident and visitor modules capture pieces.
- **Required updates**:
  - Dedicated biosecurity protocol templates and completion checks.
  - Quarantine status workflows and alerts.
  - Visitor/vehicle disinfection workflow evidence.

### 6.3 Treatment compliance detail
- **Partial**: Medicine/dose/follow-up captured.
- **Required updates**:
  - Withholding-period tracking and blocking logic for operations violating withholding windows.
  - Vet authorization evidence requirements where needed.

---

## 7) Crop and field operations pack

### 7.1 Seasonal planning model
- **Partial**: Templates and instantiated activities exist.
- **Required updates**:
  - Seasonal plan entities tying templates to season calendars and milestones.
  - Planned-vs-actual variance reporting at field/block level.

### 7.2 Spray/input compliance depth
- **Partial**: Input product/rate/unit fields exist.
- **Required updates**:
  - Add richer spray/input controls (batch/lot linkages, operator certification links, weather condition evidence where mandatory).
  - Add pre-harvest interval and compliance checks.

### 7.3 Irrigation/scouting/harvest depth
- **Partial**: Activity types include these categories.
- **Required updates**:
  - Domain-specific forms per activity type (irrigation checks, scouting findings taxonomy, harvest lot details).
  - Link harvest events to traceability-ready lots and dispatch docs.

---

## 8) Incident, risk, and corrective action (CAPA)

### 8.1 Incident closure rigor
- **Partial**: Closure summary and lifecycle status exist.
- **Required updates**:
  - Enforce closure completeness rules by severity/class (mandatory root cause, corrective/preventive tasks, verification evidence).
  - Add incident playbooks by class/severity.

### 8.2 Escalation and SLA governance
- **Partial**: Escalation flag exists; overdue reminder trigger exists.
- **Required updates**:
  - Escalation matrix (who gets alerted when, by severity/time).
  - Multi-channel escalation (in-app + email now, WhatsApp/SMS next).
  - Escalation acknowledgment tracking.

### 8.3 Risk register integration
- **Gap**: Incidents are captured, but formal risk register with recurring risk scoring is missing.
- **Required updates**:
  - Add risk register object linked to incidents/actions.
  - Recurrence trends and control effectiveness scoring.

---

## 9) Stores, stock requests, documents, and compliance evidence

### 9.1 Stores transaction depth (non-financial)
- **Partial**: Stock request + item workflows exist.
- **Required updates**:
  - Add issue/return chain with explicit inventory movement ledger (still non-financial).
  - Add low-stock alerting from defined min thresholds.
  - Add supplier/contact master integration with request flows.

### 9.2 Document management maturity
- **Partial**: Document object exists with type, owner, expiry, status.
- **Required updates**:
  - Add version history controls and retention policy flags.
  - Add review workflow (draft → approved → superseded) with approvals.
  - Add policy acknowledgment tracking tied to workforce profiles.

### 9.3 Audit pack assembly
- **Gap**: Reports exist, but one-click compliance/audit pack builder is missing.
- **Required updates**:
  - Build pack templates (GLOBALG.A.P., SIZA, PPECB evidence sets).
  - Export bundles with linked source records and timestamps.

---

## 10) Visitor access, security, and movement logs

### 10.1 Gate workflow depth
- **Partial**: Visit create + check-in/out + permitted areas exists.
- **Required updates**:
  - Pre-approval workflow and automatic expiry windows.
  - Escort assignment tracking and completion confirmation.
  - Route deviation / exception event logging templates.

### 10.2 Security-biosecurity linkage
- **Partial**: Biosecurity checkbox/exception notes exist.
- **Required updates**:
  - Required biosecurity checklist per site type.
  - Mandatory evidence on sensitive-site access.

---

## 11) Reminders, notifications, timelines, search, reporting

### 11.1 Reminder UX completion
- **Gap**: Reminder engine exists in DB/triggers; no dedicated reminder center workflow in farm UI.
- **Required updates**:
  - Add `/farm/reminders` queue with acknowledge/resolve/snooze/reassign actions.
  - Add role-specific reminder digest cards and subscription preferences.

### 11.2 Notification channel strategy
- **Partial**: In-app structures exist; email exists generally.
- **Required updates**:
  - Farm notification preferences by role/event/severity.
  - WhatsApp/SMS channel abstraction for future rollout.

### 11.3 Cross-entity timeline parity
- **Partial**: History exists for several entities, but timeline UX is uneven.
- **Required updates**:
  - Standardized timeline component for all core objects.
  - Explicit “edited by / approved by / source action” metadata on entries.

### 11.4 Search capability depth
- **Partial**: Global search route exists with typed filters.
- **Required updates**:
  - True natural-language search via AI-assist parser in product UX.
  - Synonym dictionaries/tenant terminology mapping.
  - Search result source highlighting and timeline jump links.

### 11.5 KPI and success-metric instrumentation
- **Partial**: Dashboard metrics exist, including some success metrics.
- **Required updates**:
  - Add all plan KPIs as explicit tracked metrics with targets and trend windows.
  - Add per-tenant health score and activation/adoption dashboards.

---

## 12) AI assist layer (safe AI)

### 12.1 From helper library to user features
- **Partial**: Guardrail-oriented AI utilities exist in `lib/ai/farm-assist.ts`.
- **Required updates**:
  - Productize voice-note-to-draft UI (task/incident/request).
  - Productize grounded weekly summaries with source record citations.
  - Productize anomaly feed UI with “dismiss + reason” and investigation action.

### 12.2 Guardrail enforcement and provenance
- **Partial**: Typed guardrails exist.
- **Required updates**:
  - Persist AI interaction logs with prompt/version/context hashes and reviewer approvals.
  - Require source-backed answers for dashboard Q&A and SOP copilot.
  - Explicitly block internet-grounded generic agronomy/veterinary advice in v1 assistant surfaces.

### 12.3 Multilingual AI assist
- **Gap**: Not present in end-user workflows.
- **Required updates**:
  - Add multilingual instruction drafts with manager-reviewed source text retained alongside translated text.

---

## 13) UX blueprint and frontline adoption

### 13.1 Offline-first behavior
- **Gap**: Plan calls this non-negotiable; current app is server-form centric.
- **Required updates**:
  - Offline drafts for tasks/incidents/requests/visits.
  - Upload queue + retry indicators.
  - Conflict handling rules when syncing edits.

### 13.2 Camera/voice-first input
- **Partial**: Upload path fields exist, but capture UX is not camera/voice native.
- **Required updates**:
  - Direct camera capture components with metadata auto-fill.
  - Voice capture/transcription path into reviewable drafts.

### 13.3 Progressive disclosure and micro-interactions
- **Partial**: Some forms are comprehensive but dense.
- **Required updates**:
  - One-primary-action screens for frontline flows.
  - Status chips and next-likely-action after save.
  - Better empty-state guidance per module.

### 13.4 Accessibility for outdoor/mobile usage
- **Partial**: Current UI readable but not explicitly optimized for gloves/sunlight contexts.
- **Required updates**:
  - Large tap target audit across field workflows.
  - High-contrast mode and sunlight-friendly color tokens.

---

## 14) Integrations and finance readiness

### 14.1 Import/export robustness
- **Partial**: Integration endpoints exist (jobs/schemas/events/webhooks/geo).
- **Required updates**:
  - Production-grade import validation reports and row-level error handling.
  - Retry-safe job orchestration and job history UI.

### 14.2 Sage/Pastel bridge details
- **Gap**: Strategic intent present; complete finance bridge contracts not yet implemented.
- **Required updates**:
  - Define canonical export schemas for work orders, stock issues, supplier refs, usage logs, doc links.
  - Add mapped export presets and versioned contract docs.

### 14.3 WhatsApp/SMS integration readiness
- **Partial**: Webhook/event scaffolding exists.
- **Required updates**:
  - Event template engine + channel adapters for WhatsApp/SMS notifications.
  - Delivery receipts and fallback logic.

### 14.4 Identity/onboarding polish
- **Partial**: Invite/login onboarding exists at base platform level.
- **Required updates**:
  - Role-aware first-run setup per farm pack.
  - Partner invitation and scoped external identity lifecycle.

---

## 15) External portals (owner/partner/buyer)

### 15.1 Owner portal depth
- **Partial**: Owner dashboard variant exists within same app shell.
- **Required updates**:
  - Owner-focused portal mode: exception-first, approvals, compliance status, export snapshots, lower data-entry burden.

### 15.2 Buyer/client portal
- **Gap**: No dedicated buyer/client read-only portal for lot docs/dispatch visibility.
- **Required updates**:
  - Add read-mostly external portal with strict object visibility and document sharing controls.

### 15.3 Vet/agronomist/contractor partner portal
- **Gap**: Not yet a dedicated portal despite role scaffolding.
- **Required updates**:
  - Scoped job observations/sign-offs/attachments.
  - Access windows and revocation controls.

---

## 16) Compliance-grade data integrity and auditability

### 16.1 Structured-first evidence discipline
- **Partial**: Structured fields are used extensively, but some free-text fallback remains broad.
- **Required updates**:
  - Harden required structured fields by event type.
  - Prevent closure/approval when key structured evidence is missing.

### 16.2 Immutable closure patterns
- **Partial**: History logs exist.
- **Required updates**:
  - Add immutable closure snapshots for key objects (incidents, work orders, critical documents).
  - Include closure hash/signature metadata for tamper evidence where required.

### 16.3 Full object timeline coverage
- **Partial**: `farm_entity_history` is strong, but not all module events are equally represented in user-visible timelines.
- **Required updates**:
  - Ensure every critical mutation from every module writes consistent timeline events and renders in UI.

---

## 17) Build-roadmap alignment adjustments

Based on current code state, the implementation is already beyond basic “Phase 1” in breadth, but some “Phase 4-6” outcomes are still scaffolds. Recommended sequence to align with plan intent:

1. **Stabilization sprint**: role-native UX, reminder center, mobile quick-capture, timeline parity.
2. **Compliance sprint**: document version/review/acknowledgment + audit pack builder + closure integrity rules.
3. **Frontline sprint**: offline drafts, camera/voice-first capture, multilingual assistance.
4. **Portal sprint**: scoped partner + buyer portals.
5. **Finance bridge sprint**: Sage/Pastel export contracts + admin mapping UI.
6. **AI productization sprint**: deploy grounded AI assist features with full provenance logs.

---

## 18) Priority implementation backlog (actionable)

## P0 (must-do to claim v1 plan alignment)

1. Build **role-native navigation/home/permissions UX** for owner, manager, supervisor, operator, workshop, stores, compliance.
2. Ship **reminder center UI** with lifecycle actions.
3. Enforce **closure completeness** for incidents/work orders with structured CAPA data.
4. Add **document version/review workflow** + policy/training acknowledgment tracking.
5. Implement **external partner/buyer scoped portals**.
6. Add **mobile quick-capture** flows meeting sub-60-second logging targets (instrument + verify).
7. Productize **voice-note-to-draft** and **grounded summary/search assist** with explicit citations.

## P1 (high value after P0)

8. Add **offline draft/sync queue** for frontline modules.
9. Add **map-first geometry UX** and geo-linked operational overlays.
10. Build **audit/compliance pack exporter templates**.
11. Add **Sage/Pastel export mapping contracts** and managed export jobs.
12. Add **channel-ready notification template system** (email now, WhatsApp/SMS-ready).
13. Expand **livestock traceability** (individual IDs, movement validation, withholding logic).
14. Expand **crop compliance detail** (spray/lot/interval constraints).

## P2 (optimization and defensibility)

15. Add anomaly triage center and recurrence-based risk scoring.
16. Add tenant terminology packs and multilingual UX defaults.
17. Add immutable closure signatures/hashes for high-risk records.
18. Add advanced adoption dashboards tied to plan success metrics.

---

## Bottom line

The repository is **substantially aligned in module breadth and data foundation**, but still **partially aligned in role-native experience, frontline usability, compliance-grade workflows, and external portal/AI productization**. Closing the P0/P1 items above is what will move it from “feature-rich foundation” to “plan-aligned farm operating system.”
