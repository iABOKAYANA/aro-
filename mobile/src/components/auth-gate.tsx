import { type ReactNode } from 'react';
import { useRouter } from 'expo-router';

import { useAuth } from '@/auth/auth-context';
import { Btn, Empty, Screen } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';

/**
 * Client-side session boundary for screens the website also puts behind
 * `/auth/login` — saved searches, the staff tabs, notifications, viewings.
 *
 * This exists because the app no longer force-bounces a signed-out visitor to
 * the sign-in screen. That was the right trade for browsing: the website
 * answers home, projects, compare, AI tools and every content page to an
 * anonymous request with no redirect, so neither does the app. But it leaves a
 * corner case — someone who wanders into a page that genuinely needs an
 * account. Without a guard they get a red 401 strip, which reads as "broken";
 * with one they get an invitation, and the rest of the app stays one tap away.
 *
 * The server remains the authority: every protected route rejects a sessionless
 * call on its own. This is the same courtesy gate `useRoleDenied` is — it holds
 * no data and authorizes nothing, so it never blocks on the session read and a
 * legitimate user is never shown a sign-in prompt because the Keychain was slow.
 *
 * Returns `null` while the session is still resolving and `null` when the user
 * is signed in, so it reads as one more `if` before the loading check:
 *
 * ```tsx
 * const gate = useRequireAuth();
 * if (gate) return gate;
 * if (loading) return <Loading label={t('saved.loading')} />;
 * ```
 *
 * Placing it before the loading check matters: a signed-out visitor gets the
 * invitation immediately rather than a spinner that resolves into a 401.
 */
export function useRequireAuth(messageKey?: MessageKey): ReactNode | null {
  const { status } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  if (status !== 'signedOut') return null;

  return (
    <Screen>
      <Empty
        title={t(messageKey ?? 'account.signInRequired')}
        message={t('account.signInRequiredHint')}
        action={
          <Btn title={t('account.signIn')} onPress={() => router.push('/login')} />
        }
      />
    </Screen>
  );
}
