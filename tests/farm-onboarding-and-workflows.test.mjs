import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync('app/farm/dashboard/page.tsx', 'utf8');
assert.match(dashboard, /redirect\('\/farm\/onboarding'\)/, 'Dashboard should redirect new tenants into onboarding.');
assert.match(dashboard, /farm_onboarding_progress/, 'Dashboard should consult onboarding progress table.');

const onboarding = fs.readFileSync('app/farm/onboarding/page.tsx', 'utf8');
assert.match(onboarding, /Step 1 — Farm profile basics/, 'Onboarding should expose the wizard step 1.');
assert.match(onboarding, /Step 4 — Create first task/, 'Onboarding should expose task bootstrap step.');
assert.match(onboarding, /sampleData/, 'Onboarding should support optional sample data generation.');

const farmActions = fs.readFileSync('lib/actions/farm.ts', 'utf8');
assert.match(farmActions, /TASK_TRANSITIONS/, 'Task transitions should be explicit and validated.');
assert.match(farmActions, /farm_entity_history/, 'Farm mutations should log history records.');
assert.match(farmActions, /completeFarmOnboarding/, 'Onboarding completion server action should exist.');
assert.match(farmActions, /createCropField/, 'Crop actions should be wired.');
assert.match(farmActions, /createLivestockHerd/, 'Livestock actions should be wired.');

const migration = fs.readFileSync('supabase/migrations/20260403150000_farm_onboarding_and_workflow_extensions.sql', 'utf8');
assert.match(migration, /create table if not exists public\.farm_onboarding_progress/i, 'Migration should create farm onboarding progress table.');
assert.match(migration, /owner_profile_id/, 'Migration should add incident owner profile.');

console.log('farm onboarding and workflows tests passed');
