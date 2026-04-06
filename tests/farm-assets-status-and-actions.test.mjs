import assert from 'node:assert/strict';
import fs from 'node:fs';

const farmActions = fs.readFileSync('lib/actions/farm.ts', 'utf8');
const assetsPage = fs.readFileSync('app/farm/assets/page.tsx', 'utf8');
const onboardingPage = fs.readFileSync('app/farm/onboarding/page.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260406110000_farm_assets_status_and_columns_alignment.sql', 'utf8');

assert.match(
  farmActions,
  /FARM_ASSET_STATUSES\s*=\s*\['active',\s*'maintenance_due',\s*'in_repair',\s*'retired'\]/,
  'Farm asset statuses should use the canonical status set in actions.'
);
assert.match(
  farmActions,
  /ASSET_STATUS_TRANSITIONS/,
  'Farm asset transitions should be explicit in actions.'
);
assert.match(
  farmActions,
  /created_by:\s*ctx\.profile\.id/,
  'Asset create path should persist created_by.'
);
assert.match(
  farmActions,
  /retired_at:\s*status\s*===\s*'retired'\s*\?\s*new Date\(\)\.toISOString\(\)\s*:\s*null/,
  'Asset update path should maintain retired_at when status changes.'
);

for (const status of ['active', 'maintenance_due', 'in_repair', 'retired']) {
  assert.match(
    assetsPage,
    new RegExp(`value:\\s*'${status}'`),
    `Assets page should expose ${status} option.`
  );
  assert.match(
    onboardingPage,
    new RegExp(`value:\\s*'${status}'`),
    `Onboarding page should expose ${status} option.`
  );
}

assert.match(migration, /ADD COLUMN IF NOT EXISTS created_by/i, 'Corrective migration should add created_by when missing.');
assert.match(migration, /ADD COLUMN IF NOT EXISTS retired_at/i, 'Corrective migration should add retired_at when missing.');
assert.match(migration, /CHECK \(status IN \('active', 'maintenance_due', 'in_repair', 'retired'\)\)/i, 'Corrective migration should enforce canonical status constraint.');

console.log('farm asset status/action regression tests passed');
