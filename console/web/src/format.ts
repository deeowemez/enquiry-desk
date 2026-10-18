const HK = 'Asia/Hong_Kong';
export const money = (v: number) => (v === 0 ? '$0' : v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);

export function when(iso: string): string {
  const d = new Date(iso), now = new Date();
  const day = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: HK }).format(x);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: HK, hour: '2-digit', minute: '2-digit' }).format(d);
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() - 864e5))) return `Yesterday ${time}`;
  return `${new Intl.DateTimeFormat('en-GB', { timeZone: HK, day: 'numeric', month: 'short' }).format(d)} ${time}`;
}

export function ago(iso: string | null): string {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export const hours = (h: number | null) => (h == null ? '—' : h < 1 ? 'under 1 h' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);
export const shortDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso + 'T00:00:00'));
