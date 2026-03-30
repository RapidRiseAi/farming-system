'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Circle, Loader2, Mail, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { markAllNotificationsRead, markNotificationReadState, softDeleteNotification } from '@/lib/actions/customer-notifications';
import { MessageThreadPanel } from '@/components/messages/message-thread-panel';

type Notification = {
  id: string;
  title: string;
  href: string;
  is_read: boolean;
  created_at: string;
  body?: string | null;
  deleted_at?: string | null;
  kind?: string;
  data?: {
    customer_name?: string | null;
    vehicle_registration?: string | null;
    status?: string | null;
    source_table?: string | null;
    message_thread_id?: string | null;
  } | null;
};

export function NotificationsLive({ fullPage = false }: { fullPage?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Notification[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkshopUser, setIsWorkshopUser] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'messages'>('all');

  const messageThreadFromRoute = searchParams.get('messageThread');
  const [openThreadId, setOpenThreadId] = useState<string | null>(messageThreadFromRoute);

  useEffect(() => {
    setOpenThreadId(messageThreadFromRoute);
  }, [messageThreadFromRoute]);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        setIsLoading(false);
        return;
      }
      setUid(user.id);

      const [{ data: profile }, { data: customerAccount }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
        supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle()
      ]);

      const isWorkshop = profile?.role !== 'customer';
      setIsWorkshopUser(isWorkshop);

      const load = async () => {
        let query = supabase
          .from('notifications')
          .select('id,title,href,is_read,created_at,body,kind,data,deleted_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(fullPage ? 100 : 10);

        if (isWorkshop) query = query.eq('to_profile_id', user.id);
        else if (customerAccount?.id) query = query.eq('to_customer_account_id', customerAccount.id);
        else query = query.eq('to_profile_id', user.id);

        const { data, error } = await query;
        if (error) {
          setLoadError('Unable to load notifications right now.');
          setItems([]);
        } else {
          setLoadError(null);
          setItems(Array.isArray(data) ? (data as Notification[]) : []);
        }
        setIsLoading(false);
      };

      await load();
      const channel = supabase
        .channel(`notifications-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => void load())
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED' && !poll) poll = setInterval(() => void load(), 10000);
        });

      return () => {
        channel.unsubscribe();
        if (poll) clearInterval(poll);
      };
    };

    void init();
  }, [fullPage, supabase]);

  if (!uid) return fullPage ? <p className="text-sm text-gray-500">No notifications yet.</p> : null;

  const unread = items.filter((item) => !item.is_read).length;
  const filteredItems = filter === 'messages' ? items.filter((item) => item.kind === 'message') : items;
  const listHref = isWorkshopUser ? '/workshop/notifications' : '/customer/notifications';
  const itemHref = (item: Notification) => item.href || listHref;

  if (!fullPage) {
    return (
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full border border-black/15 px-2 py-1 text-sm">🔔 {unread}</summary>
        <div className="absolute right-0 z-10 mt-2 w-96 rounded-2xl border bg-white p-3 text-black shadow">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Notifications</p>
            <Link href={listHref} className="text-xs text-brand-red underline">View all</Link>
          </div>
          <div className="space-y-1">
            {items.map((item) => (
              <Link key={item.id} href={itemHref(item)} className="block rounded-lg px-2 py-2 text-sm hover:bg-gray-100">
                <p className={item.is_read ? 'text-gray-500' : 'font-semibold'}>{item.title}</p>
              </Link>
            ))}
            {!items.length ? <p className="px-2 py-3 text-xs text-gray-500">No notifications yet.</p> : null}
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          <Button size="sm" variant={filter === 'all' ? 'primary' : 'ghost'} onClick={() => setFilter('all')}>All</Button>
          <Button size="sm" variant={filter === 'messages' ? 'primary' : 'ghost'} onClick={() => setFilter('messages')}>Messages</Button>
        </div>
        <Button
          size="sm"
          disabled={unread === 0 || isPending}
          onClick={() => startTransition(async () => {
            await markAllNotificationsRead();
            setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
          })}
        >
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Mark all as read
        </Button>
      </div>
      {isLoading ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />) : null}
      {loadError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p> : null}
      {filteredItems.map((item) => {
        const isMessage = item.kind === 'message';
        return (
          <div key={item.id} className={`rounded-2xl border bg-white p-4 transition hover:border-black/25 ${item.is_read ? 'border-black/10 opacity-80' : 'border-black/20 shadow-sm'} ${isMessage ? 'border-blue-200 bg-blue-50/40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <Link href={itemHref(item)} className="group flex flex-1 items-start gap-3">
                <span className={`mt-1 h-10 w-1 rounded-full ${item.is_read ? 'bg-gray-200' : isMessage ? 'bg-blue-500' : 'bg-brand-red'}`} />
                <div className="min-w-0">
                  <p className={item.is_read ? 'text-gray-600' : 'font-semibold text-brand-black'}>{item.title}</p>
                  {isMessage ? <p className="inline-flex items-center gap-1 text-xs font-medium text-blue-700"><Mail className="h-3 w-3" /> Message</p> : null}
                  {item.body ? <p className="text-sm text-gray-600">{item.body}</p> : null}
                  <p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              </Link>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex items-center gap-1 text-xs ${item.is_read ? 'text-gray-400' : 'text-brand-red'}`}>
                  <Circle className={`h-3 w-3 ${item.is_read ? 'fill-gray-300 text-gray-300' : 'fill-brand-red text-brand-red'}`} />
                  {item.is_read ? 'Read' : 'Unread'}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {isMessage && item.data?.message_thread_id ? (
                    <Button size="sm" variant="outline" onClick={() => setOpenThreadId(item.data?.message_thread_id ?? null)}>Open thread</Button>
                  ) : null}
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => startTransition(async () => {
                    await markNotificationReadState({ notificationId: item.id, isRead: !item.is_read });
                    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: !n.is_read } : n)));
                  })}>
                    {item.is_read ? 'Mark unread' : 'Mark read'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => startTransition(async () => {
                    await softDeleteNotification({ notificationId: item.id });
                    setItems((prev) => prev.filter((n) => n.id !== item.id));
                  })}>
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={itemHref(item)}>Open <ChevronRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {!isLoading && !filteredItems.length ? <p className="text-sm text-gray-500">No notifications yet.</p> : null}
      <MessageThreadPanel conversationId={openThreadId} open={Boolean(openThreadId)} onClose={() => setOpenThreadId(null)} />
    </div>
  );
}
