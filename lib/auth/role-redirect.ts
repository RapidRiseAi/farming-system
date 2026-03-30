import { customerDashboard, farmDashboard } from '@/lib/routes';

export type UserRole =
  | 'admin'
  | 'technician'
  | 'customer'
  | 'owner'
  | 'farm_manager'
  | 'supervisor'
  | 'operator'
  | 'admin_clerk'
  | 'contractor'
  | 'viewer';

const FARM_ROLES = new Set<UserRole>([
  'admin',
  'technician',
  'owner',
  'farm_manager',
  'supervisor',
  'operator',
  'admin_clerk',
  'contractor',
  'viewer'
]);

export function isFarmRole(role?: UserRole | null): boolean {
  return !!role && FARM_ROLES.has(role);
}

export function getDashboardPathForRole(role?: UserRole | null) {
  if (isFarmRole(role)) {
    return farmDashboard();
  }

  return customerDashboard();
}
