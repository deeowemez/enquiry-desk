import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { Traffic } from '../../shared/api';

export async function getJson<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${path}${qs.size ? `?${qs}` : ''}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(res.status === 401 ? 'Open the console through the tailnet address.' : `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function useApi<T>(path: string, params: Record<string, string | number | undefined> = {}, opts: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: [path, params], queryFn: () => getJson<T>(path, params), refetchInterval: 60_000, ...opts });
}

/** The date range and traffic filter live in the URL, so a view can be shared and survives a refresh. */
export function useRange() {
  const [sp, setSp] = useSearchParams();
  const days = Number(sp.get('days') ?? 14);
  const traffic = (sp.get('traffic') ?? 'both') as Traffic;
  const set = (next: Partial<{ days: number; traffic: Traffic }>) => {
    const n = new URLSearchParams(sp);
    if (next.days) n.set('days', String(next.days));
    if (next.traffic) n.set('traffic', next.traffic);
    setSp(n, { replace: true });
  };
  return { days, traffic, set, params: { days, traffic } };
}
