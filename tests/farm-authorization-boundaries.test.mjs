import assert from 'node:assert/strict';
import fs from 'node:fs';

const farmActions = fs.readFileSync('lib/actions/farm.ts', 'utf8');
assert.match(farmActions, /isManager\(/, 'Role gate helper should exist.');
assert.match(farmActions, /if \(!ctx \|\| !isManager\(ctx\.profile\.role\)\) return;/, 'Manager-only mutations should block unauthorized users.');
assert.match(farmActions, /eq\('workshop_account_id', ctx\.profile\.workshop_account_id\)/, 'Mutations should scope writes to workshop account.');

const expensesExport = fs.readFileSync('app/farm/expenses/export/route.ts', 'utf8');
assert.match(expensesExport, /Unauthorized/, 'Expense export route should hard-fail unauthorized access.');
assert.match(expensesExport, /eq\('workshop_account_id', profile\.workshop_account_id\)/, 'Expense export should enforce workshop scoping.');

console.log('farm authorization boundary tests passed');
