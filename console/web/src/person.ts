import type { Me } from '../../shared/api';
import { useApi } from './api';

/**
 * Who did something, for display. The server records sign-in emails (Tailscale logins); the screen never shows
 * one: the signed-in person is "you", the seed is "System", anyone else is the part before the @.
 */
export function usePerson() {
  const me = useApi<Me>('/api/me');
  return (login: string | null | undefined): string => {
    if (!login) return '—';
    if (login === me.data?.login) return 'you';
    if (login === 'seed') return 'System';
    const local = login.split('@')[0] ?? login;
    return local.charAt(0).toUpperCase() + local.slice(1);
  };
}
