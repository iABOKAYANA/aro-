import { DarkTheme, Stack, ThemeProvider as NavigationThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { AppLockGate } from '@/components/app-lock-gate';
import { ContactFabs } from '@/components/contact-fabs';
import { ThemeToggle } from '@/components/ui';
import { type ThemeTokens } from '@/constants/brand';
import { useI18n, I18nProvider } from '@/i18n';
import { GUIDE_SEEN_KEY } from '@/i18n/messages/guide';
import { AppLockProvider } from '@/lib/app-lock';
import { CompareProvider } from '@/lib/compare';
import { CurrencyProvider } from '@/lib/currency';
import { FontsProvider, useFontsStatus } from '@/lib/fonts';
import { registerForPush, useNotificationNavigation } from '@/lib/push';
import { SavedProjectsProvider } from '@/lib/saved-projects';
import { getItemAsync } from '@/lib/storage';
import { ThemeProvider, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Navigation theme so pushed screens follow whichever palette is live instead
 * of React Navigation's built-in defaults.
 */
function navigationTheme(t: ThemeTokens) {
  return {
    ...DarkTheme,
    dark: t.mode === 'dark',
    colors: {
      ...DarkTheme.colors,
      primary: t.primary,
      background: t.background,
      card: t.nav,
      text: t.foreground,
      border: t.navBorder,
      notification: t.primary,
    },
  };
}

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* Theme sits above i18n: the language menu and the theme menu both live
          in the header, and every screen paints through the palette. */}
      <ThemeProvider>
        {/* Language first among the content providers: every other provider
            renders labels through it. */}
        <I18nProvider>
          {/* Currency wraps everything: screens format prices during render. */}
          <CurrencyProvider>
            {/* Compare tray survives navigation and sign-out, same as on the web. */}
            <CompareProvider>
              {/* Bookmarked projects — device-local, like the website's list. */}
              <SavedProjectsProvider>
                {/* Luxury fonts (Amiri + Plex Arabic). Loads once, gates the
                    splash in AuthGate; every consumer falls back to system
                    fonts until loaded, so a failed load never blanks text. */}
                <FontsProvider>
                  {/* Device-auth gate over the signed-in session (no-op unless
                      the user opts in under Settings → Security). */}
                  <AppLockProvider>
                    <AuthGate />
                  </AppLockProvider>
                </FontsProvider>
              </SavedProjectsProvider>
            </CompareProvider>
          </CurrencyProvider>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

/**
 * Routes the user between the public sign-in screen and the app, and holds the
 * splash until the stored session has been read from the Keychain.
 */
function AuthGate() {
  const { status, session } = useAuth();
  const { t } = useTheme();
  const { t: translate } = useI18n();
  const { loaded: fontsLoaded, done: fontsDone } = useFontsStatus();
  const segments = useSegments();
  const router = useRouter();
  // `/register` and `/request-access` are reachable while signed out — the
  // invitation-only sign-up flow — so they have to sit alongside `/login` in
  // the auth-screen set, or the gate bounces a brand-new user straight back
  // to sign-in before they can paste their token. Once signed in, they bounce
  // back to the app so a session never lingers on an auth form.
  const onAuthScreen =
    segments[0] === 'login' ||
    segments[0] === 'register' ||
    segments[0] === 'request-access' ||
    (segments[0] === 'auth' && segments[1] === 'error');
  // `/onboarding` is public like the auth screens above: a signed-in session
  // that already saw the intro bounces off it to `/` (handled below, gated
  // on the seen flag so "watch the intro again" still renders).
  const onOnboarding = segments[0] === 'onboarding';

  useNotificationNavigation();

  const theme = useMemo(() => navigationTheme(t), [t]);

  const screenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: t.nav },
      headerTintColor: t.foreground,
      // Amiri once loaded (stack headers across the journey inherit the
      // display face); system bold before that — never blank.
      headerTitleStyle: { fontWeight: '700' as const, ...(fontsLoaded ? { fontFamily: 'Amiri-Bold' } : null) },
      headerRight: () => <ThemeToggle />,
      contentStyle: { backgroundColor: t.background },
    }),
    [t, fontsLoaded],
  );

  // Browsing is never gated on a session: the website answers every public
  // page — home, projects, compare, AI tools, content — to an anonymous
  // visitor with no redirect to `/auth/login`, so neither does this app. A
  // signed-out visitor lands on the home tab and wanders freely; screens that
  // genuinely need an account ask for one themselves via `useRequireAuth()`,
  // and `/login` is reached from settings or those prompts, never by ambush.
  useEffect(() => {
    if (status === 'loading') return;
    // The one redirect still worth keeping: once signed in, an auth form has
    // no business on screen — carry the user into the app instead.
    if (status === 'signedIn' && onAuthScreen) {
      router.replace('/');
      return;
    }
    // First run: anyone who has not seen the intro goes to `/onboarding`,
    // signed in or not. One fresh storage read per navigation rather than
    // cached state, so "watch the intro again" from `/help` — which clears
    // the flag, then pushes — is honoured instead of racing stale state.
    // Never blocks: the app keeps rendering normally while the read resolves.
    //
    // No loops: the replace fires only when *not* already on `/onboarding`,
    // and the signed-in bounce fires only when the flag *is* set — each
    // landing settles with no further redirect. An unreadable store reads as
    // "seen" so a broken store can neither trap nor yank the user.
    let live = true;
    getItemAsync(GUIDE_SEEN_KEY).then(
      (raw) => {
        if (!live) return;
        const seen = raw === '1';
        if (status === 'signedIn' && onOnboarding && seen) router.replace('/');
        else if (!seen && !onOnboarding) router.replace('/onboarding');
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [status, onAuthScreen, onOnboarding, router]);

  // Register once per signed-in session. If permission was already granted
  // this is a silent round trip; if not, it is the one prompt the OS allows.
  // Every failure path inside is non-fatal, so a device without push still
  // reaches the app. The session rides along because the endpoint is gated.
  useEffect(() => {
    if (status !== 'signedIn' || !session) return;
    void registerForPush({ token: session.token, cookieName: session.cookieName });
  }, [status, session]);

  // The splash holds until BOTH the session and the fonts resolve — fonts
  // release on load *or* error, so a missing asset can delay but never trap.
  useEffect(() => {
    if (status !== 'loading' && fontsDone) SplashScreen.hideAsync();
  }, [status, fontsDone]);

  if (status === 'loading') {
    return (
      <View style={[styles.boot, { backgroundColor: t.background }]}>
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }

  return (
    <NavigationThemeProvider value={theme}>
      <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
      {/* Fail-closed cover: renders nothing unless the app lock is engaged
          with a session behind it. */}
      <AppLockGate />
      {/* Stack + floating CTAs share one relative parent so the FAB column
          overlays every screen without owning any of them. */}
      <View style={styles.root}>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="help" options={{ title: translate('guide.helpTitle') }} />
        <Stack.Screen name="project/[slug]" options={{ title: translate('project.title') }} />
        <Stack.Screen name="unit/[slug]" options={{ title: translate('unit.title') }} />
        <Stack.Screen name="compare" options={{ title: translate('saved.compare') }} />
        <Stack.Screen name="mortgage" options={{ title: translate('calculators.mortgage') }} />
        <Stack.Screen name="investment" options={{ title: translate('calculators.investment') }} />
        <Stack.Screen name="price-estimator" options={{ title: translate('calculators.estimator') }} />
        <Stack.Screen name="notifications" options={{ title: translate('notifications.title') }} />
        <Stack.Screen name="assistant" options={{ title: translate('assistant.title') }} />
        <Stack.Screen name="viewings" options={{ title: translate('viewings.mine') }} />
        <Stack.Screen name="viewing/book" options={{ title: translate('viewings.book') }} />
        <Stack.Screen name="lead/[id]" options={{ title: translate('leads.title') }} />
        <Stack.Screen
          name="lead/new"
          options={{ title: translate('leads.new'), presentation: 'modal' }}
        />
        <Stack.Screen name="deal/new" options={{ title: translate('deals.new'), presentation: 'modal' }} />
        <Stack.Screen name="developer" options={{ title: translate('developer.title') }} />
        <Stack.Screen name="broker" options={{ title: translate('broker.title') }} />
        <Stack.Screen name="ai-search" options={{ title: translate('aiSearch.title') }} />
        <Stack.Screen name="inquiries" options={{ title: translate('inquiries.title') }} />
        <Stack.Screen name="settings" options={{ title: translate('settings.title') }} />
        <Stack.Screen name="register" options={{ title: translate('register.title') }} />
        <Stack.Screen name="auth/error" options={{ title: translate('account.authErrorTitle') }} />
        <Stack.Screen name="ceo/overview" options={{ title: translate('ceo.title') }} />
        <Stack.Screen name="ceo/viewings" options={{ title: translate('ceo.viewings') }} />
        <Stack.Screen name="ceo/inquiries" options={{ title: translate('ceo.inquiries') }} />
        <Stack.Screen name="ceo/approvals" options={{ title: translate('ceo.approvals') }} />
        <Stack.Screen name="ceo/content" options={{ title: translate('ceo.content') }} />
        <Stack.Screen name="ceo/pricing" options={{ title: translate('ceo.pricing') }} />
        <Stack.Screen name="ceo/analytics" options={{ title: translate('ceo.analytics') }} />
        <Stack.Screen name="ceo/users" options={{ title: translate('ceo.usersScreen') }} />
        <Stack.Screen name="ceo/projects" options={{ title: translate('ceo.projectsScreen') }} />
        <Stack.Screen name="ceo/units" options={{ title: translate('ceo.unitsScreen') }} />
        <Stack.Screen name="ceo/deals" options={{ title: translate('ceo.dealsScreen') }} />
        <Stack.Screen name="ceo/brokers" options={{ title: translate('ceo.brokersScreen') }} />
        <Stack.Screen name="ceo/settings" options={{ title: translate('ceo.settings') }} />
        <Stack.Screen name="ceo/ai" options={{ title: translate('ceo.ai') }} />
        <Stack.Screen name="ceo/all-projects" options={{ title: translate('ceoPr.allTitle') }} />
        <Stack.Screen name="ceo/projects/[id]" options={{ title: translate('ceoPr.detailTitle') }} />
        <Stack.Screen name="ceo/developers" options={{ title: translate('ceoCat.developersTitle') }} />
        <Stack.Screen name="ceo/staging" options={{ title: translate('ceoSt.stagingTitle') }} />
        <Stack.Screen name="ceo/new-launches" options={{ title: translate('ceoCat.newLaunchesTitle') }} />
        <Stack.Screen name="ceo/payment-plans" options={{ title: translate('ceoCat.paymentPlansTitle') }} />
        <Stack.Screen name="ceo/leads" options={{ title: translate('ceoPpl.leadsTitle') }} />
        <Stack.Screen name="ceo/contacts" options={{ title: translate('ceoPpl.contactsTitle') }} />
        <Stack.Screen name="ceo/create-user" options={{ title: translate('ceoPpl.createUserTitle') }} />
        <Stack.Screen name="ceo/invitations" options={{ title: translate('ceoPpl.invitationsTitle') }} />
        <Stack.Screen name="ceo/access-requests" options={{ title: translate('ceoPpl.accessTitle') }} />
        <Stack.Screen name="ceo/blog" options={{ title: translate('ceoOps.blogTitle') }} />
        <Stack.Screen name="ceo/press" options={{ title: translate('ceoOps.pressTitle') }} />
        <Stack.Screen name="ceo/jobs" options={{ title: translate('ceoOps.jobsTitle') }} />
        <Stack.Screen name="ceo/import/nawy" options={{ title: translate('ceoOps.importTitle') }} />
        <Stack.Screen name="about" options={{ title: translate('content.aboutTitle') }} />
        <Stack.Screen name="contact" options={{ title: translate('contact.title') }} />
        <Stack.Screen name="blog" options={{ title: translate('blog.title') }} />
        <Stack.Screen name="blog/[slug]" options={{ title: translate('blog.title') }} />
        <Stack.Screen name="careers" options={{ title: translate('careers.title') }} />
        <Stack.Screen name="careers/[slug]" options={{ title: translate('careers.title') }} />
        <Stack.Screen name="press" options={{ title: translate('press.title') }} />
        <Stack.Screen name="press/[slug]" options={{ title: translate('press.title') }} />
        <Stack.Screen name="dashboard/projects" options={{ title: translate('dash.projectsTitle') }} />
        <Stack.Screen name="dashboard/analytics" options={{ title: translate('dash.analyticsTitle') }} />
        <Stack.Screen name="dashboard/units" options={{ title: translate('dash.unitsTitle') }} />
        <Stack.Screen name="privacy" options={{ title: translate('content.privacyTitle') }} />
        <Stack.Screen name="terms" options={{ title: translate('content.termsTitle') }} />
        <Stack.Screen name="cookies" options={{ title: translate('content.cookiesTitle') }} />
        <Stack.Screen name="affordability" options={{ title: translate('afford.title') }} />
        <Stack.Screen name="tour" options={{ title: translate('pano.title') }} />
        <Stack.Screen name="ceo/reviews" options={{ title: translate('rev.ceoTitle') }} />
        <Stack.Screen name="rentbuy" options={{ title: translate('rentbuy.title') }} />
        <Stack.Screen name="offers" options={{ title: translate('offers.title') }} />
        <Stack.Screen name="areas" options={{ title: translate('areas.title') }} />
        <Stack.Screen name="locations" options={{ title: translate('locations.title') }} />
        <Stack.Screen name="+not-found" options={{ title: translate('account.notFound') }} />
      </Stack>
        <ContactFabs />
      </View>
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
