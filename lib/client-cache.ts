"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tiny in-memory client cache shared across route navigations (module-level
 * singleton). Lets pages show previously-loaded data instantly when you switch
 * back to them, and revalidate in the background after a TTL. No external deps.
 */

interface Entry {
  data: unknown;
  ts: number;
  promise?: Promise<unknown>;
}

const store = new Map<string, Entry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export function readCache<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function writeCache(key: string, data: unknown): void {
  store.set(key, { data, ts: Date.now() });
}

export function clearCache(key: string): void {
  store.delete(key);
}

export function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttl?: number; initialData?: T },
): { data: T | undefined; loading: boolean; refresh: () => Promise<void> } {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const existing = store.get(key);
  const [data, setData] = useState<T | undefined>(
    (existing?.data as T | undefined) ?? options?.initialData,
  );
  const [loading, setLoading] = useState<boolean>(existing?.data === undefined);

  useEffect(() => {
    let active = true;
    const entry = store.get(key);

    if (entry?.data !== undefined) {
      setData(entry.data as T);
      setLoading(false);
      if (Date.now() - entry.ts < ttl) return; // fresh — no revalidation
    } else {
      setLoading(true);
    }

    // Dedupe concurrent fetches for the same key.
    const inflight = entry?.promise as Promise<T> | undefined;
    const p = inflight ?? fetcherRef.current();
    if (!inflight) {
      store.set(key, { data: entry?.data, ts: entry?.ts ?? 0, promise: p });
    }

    p.then((res) => {
      store.set(key, { data: res, ts: Date.now() });
      if (active) setData(res);
    })
      .catch(() => {
        // Keep any previous data; drop the in-flight marker.
        const cur = store.get(key);
        if (cur) store.set(key, { data: cur.data, ts: cur.ts });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ttl]);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetcherRef.current();
      store.set(key, { data: res, ts: Date.now() });
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, refresh };
}
