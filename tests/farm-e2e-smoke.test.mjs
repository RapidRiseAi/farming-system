import assert from 'node:assert/strict';
import fs from 'node:fs';

const onboarding = fs.readFileSync('app/farm/onboarding/page.tsx', 'utf8');
const tasksPage = fs.readFileSync('app/farm/tasks/page.tsx', 'utf8');
const workforcePage = fs.readFileSync('app/farm/workforce/page.tsx', 'utf8');
const assetsPage = fs.readFileSync('app/farm/assets/page.tsx', 'utf8');

assert.match(onboarding, /createFarmAsset/, 'Smoke path: onboarding can create first asset.');
assert.match(onboarding, /createWorker/, 'Smoke path: onboarding can create first worker.');
assert.match(onboarding, /createFarmTask/, 'Smoke path: onboarding can create first task.');
assert.match(tasksPage, /transitionFarmTask/, 'Smoke path: task can be moved to done/verified states.');
assert.match(workforcePage, /clockWorker/, 'Smoke path: worker can be clocked in/out.');
assert.match(assetsPage, /updateFarmAsset/, 'Smoke path: created asset can be managed after onboarding.');

console.log('farm e2e smoke scaffolding tests passed');
