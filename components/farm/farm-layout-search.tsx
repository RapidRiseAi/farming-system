'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function FarmLayoutSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const stored = window.localStorage.getItem('farm-layout-search') ?? '';
    setQuery(stored);
  }, []);

  useEffect(() => {
    if (pathname === '/farm/search') {
      const routeQuery = searchParams.get('q') ?? '';
      if (routeQuery) {
        setQuery(routeQuery);
        window.localStorage.setItem('farm-layout-search', routeQuery);
      }
    }
  }, [pathname, searchParams]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        window.localStorage.setItem('farm-layout-search', query);
        router.push(`/farm/search?q=${encodeURIComponent(query)}`);
      }}
      className="flex items-center gap-2"
    >
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Persistent farm search"
        className="w-52 rounded-full border border-emerald-300 px-3 py-1.5 text-sm"
      />
      <button className="rounded-full border border-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-900">Go</button>
    </form>
  );
}
