import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export async function NotificationsMenu() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const [{ data: profile }, { data: customerAccount }] = await Promise.all([
    supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).maybeSingle(),
    supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle()
  ]);

  const isWorkshop = profile?.role !== 'customer';

  let scopedNotificationsQuery = supabase.from('notifications').select('id,title,href,is_read,created_at,kind,data').is('deleted_at', null).order('created_at', { ascending: false }).limit(10);
  let scopedUnreadQuery = supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false).is('deleted_at', null);

  if (isWorkshop) {
    scopedNotificationsQuery = scopedNotificationsQuery.eq('to_profile_id', user.id);
    scopedUnreadQuery = scopedUnreadQuery.eq('to_profile_id', user.id);
  } else if (customerAccount?.id) {
    scopedNotificationsQuery = scopedNotificationsQuery.eq('to_customer_account_id', customerAccount.id);
    scopedUnreadQuery = scopedUnreadQuery.eq('to_customer_account_id', customerAccount.id);
  } else {
    scopedNotificationsQuery = scopedNotificationsQuery.eq('to_profile_id', user.id);
    scopedUnreadQuery = scopedUnreadQuery.eq('to_profile_id', user.id);
  }

  const [{ data: notifications }, { count }] = await Promise.all([scopedNotificationsQuery, scopedUnreadQuery]);

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none">🔔 {count ?? 0}</summary>
      <div className="absolute right-0 z-10 mt-2 w-96 rounded border bg-white p-2 text-black shadow">
        <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Notifications</p><Link href="/notifications" className="text-xs text-brand-red underline">View all</Link></div>
        <div className="space-y-1">
          {(notifications ?? []).map((notification) => (
            <Link key={notification.id} href={`/notifications?open=${notification.id}&next=${encodeURIComponent(notification.href)}`} className="block rounded px-2 py-1 text-sm hover:bg-gray-100">
              <p className={notification.is_read ? 'text-gray-500' : 'font-semibold'}>{notification.title}</p>
              {(notification.data as { vehicle_registration?: string | null; customer_name?: string | null } | null)?.vehicle_registration ? <p className="text-xs text-gray-500">Vehicle: {(notification.data as { vehicle_registration?: string | null }).vehicle_registration}</p> : null}
              {(notification.data as { customer_name?: string | null } | null)?.customer_name ? <p className="text-xs text-gray-500">Customer: {(notification.data as { customer_name?: string | null }).customer_name}</p> : null}
            </Link>
          ))}
          {!notifications?.length ? <p className="px-2 py-3 text-xs text-gray-500">No notifications yet.</p> : null}
        </div>
      </div>
    </details>
  );
}
