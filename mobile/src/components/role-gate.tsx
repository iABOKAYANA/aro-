import { type ReactNode } from 'react';
import { useRouter } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { Btn, Empty, Screen } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';

/**
 * Client-side authorization boundary for console screens.
 *
 * The server is the authority — every `/api/ceo/*`, `/api/developer/*` and
 * `/api/broker/*` route calls `requireActor()` and answers 403 on its own, so
 * this guard is *not* what keeps data safe. What it does is stop the app from
 * painting a CEO console, a broker's ledger or a developer's pipeline in front
 * of someone who may not open it. Without it, a wrong-role deep link (or a
 * stale tab left open from an earlier session) renders the whole layout and
 * then fills it with an error strip — which reads as "broken" rather than
 * "not yours".
 *
 * `hasRole` already returns true for CEO and ADMIN on every check — the same
 * "super roles act as everyone" rule `src/middleware.ts` enforces — so callers
 * pass the roles the screen is genuinely meant for and get the website's
 * preview behaviour for free.
 *
 * Returns `null` while the session is still resolving (role unknown) and
 * `null` when access is granted, so it reads as one more `if` in a screen that
 * already early-returns on `loading` and `error`:
 *
 * ```tsx
 * const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
 * if (denied) return denied;
 * if (loading) return <Loading label={t('ceo.loading')} />;
 * ```
 *
 * Placing it *before* the loading check matters: an unauthorized visitor gets
 * the refusal instead of a spinner that resolves into a 403.
 *
 * This is deliberately a courtesy gate. It holds no data and authorizes
 * nothing, so it never blocks on the session read — a legitimate user is never
 * bounced to home because the Keychain was slow.
 */
export function useRoleDenied(messageKey: MessageKey, allow: string[]): ReactNode | null {
  const { hasRole, status } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  if (status === 'loading') return null;
  if (hasRole(...allow)) return null;

  return (
    <Screen>
      <Empty
        title={t(messageKey)}
        action={<Btn title={t('account.goHome')} onPress={() => router.replace('/')} />}
      />
    </Screen>
  );
}
