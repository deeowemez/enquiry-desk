import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { Job, Traffic } from '../../shared/api';

export async function getJson<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${path}${qs.size ? `?${qs}` : ''}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(res.status === 401 ? 'Open the console through the tailnet address.' : `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function useApi<T>(path: string, params: Record<string, string | number | undefined> = {}, opts: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  return useQuery({ queryKey: [path, params], queryFn: () => getJson<T>(path, params), refetchInterval: 60_000, ...opts });
}

/** A state-changing call. The x-console header is what the server requires (a cross-site form cannot send it). */
export async function send<T>(method: 'POST' | 'DELETE', path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-console': '1', accept: 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Run a write, then refresh everything the screens show. */
export function useSend<T = unknown, B = unknown>(method: 'POST' | 'DELETE', path: string) {
  const qc = useQueryClient();
  return useMutation<T, Error, B | void>({ mutationFn: (body) => send<T>(method, path, body ?? {}), onSuccess: () => { void qc.invalidateQueries(); } });
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

/** The current test/re-check job: polled every 2 s while it runs, rarely otherwise. */
export function useJob() {
  return useQuery({
    queryKey: ['/api/jobs/current'], queryFn: () => getJson<Job | null>('/api/jobs/current'),
    refetchInterval: q => (q.state.data?.status === 'running' ? 2000 : 15_000),
  });
}
