import { Ionicons } from '@expo/vector-icons';
import { Tabs, type Href } from 'expo-router';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { ThemeToggle } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';
import { ctaLabel, ctaUrl, usePublicCta } from '@/lib/site-config';
import { createStyles, useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Role-aware bottom navigation.
 *
 * Every screen file exists for every role (expo-router needs the routes to be
 * resolvable), but a tab is only *offered* when the role can actually use it —
 * `href: null` hides it without unmounting the rest. That keeps the bar at five
 * tabs instead of shipping a buyer buttons that all answer 403.
 *
 * Hrefs are written out literally rather than built by concatenation so the
 * generated route types stay honest: a typo becomes a compile error instead of
 * a tab that silently opens an empty screen.
 */
const HREFS: Record<string, Href> = {
  index: '/',
  explore: '/(tabs)/explore',
  leads: '/(tabs)/leads',
  deals: '/(tabs)/deals',
  saved: '/(tabs)/saved',
  tools: '/(tabs)/tools',
  manage: '/(tabs)/manage',
};

const TABS: {
  name: keyof typeof HREFS;
  titleKey: MessageKey;
  icon: IconName;
  audience: 'super' | 'staff' | 'everyone';
}[] = [
  { name: 'index', titleKey: 'tab.home', icon: 'home', audience: 'everyone' },
  { name: 'explore', titleKey: 'tab.explore', icon: 'search', audience: 'everyone' },
  { name: 'leads', titleKey: 'tab.leads', icon: 'people', audience: 'staff' },
  { name: 'deals', titleKey: 'tab.deals', icon: 'briefcase', audience: 'staff' },
  { name: 'saved', titleKey: 'tab.saved', icon: 'bookmark', audience: 'everyone' },
  { name: 'tools', titleKey: 'tab.tools', icon: 'calculator', audience: 'everyone' },
  { name: 'manage', titleKey: 'tab.manage', icon: 'shield-checkmark', audience: 'super' },
];

export default function TabsLayout() {
  const { hasRole } = useAuth();
  const { t: theme } = useTheme();
  const { t } = useI18n();
  const isSuper = hasRole('CEO', 'ADMIN');
  const isStaff = hasRole('BROKER', 'DEVELOPER', 'CEO', 'ADMIN');

  const visible = TABS.filter((tab) => {
    if (tab.audience === 'super') return isSuper;
    if (tab.audience === 'staff') return isStaff;
    return true;
  });

  // Keep the bar compact: a super user gives up the Saved tab — it is linked
  // from Home shortcuts — but keeps Tools, because language, currency, push,
  // notification preferences, password and every Company/Legal footer link
  // live behind it and Home does not link it.
  const shown = isSuper ? visible.filter((tab) => tab.name !== 'saved') : visible;

  const hrefFor = (name: string): Href | null =>
    shown.some((tab) => tab.name === name) ? HREFS[name] ?? null : null;

  return (
    <>
      <Tabs
        screenOptions={{
          // The navbar, restated: same surface, same hairline, same gold accent.
          headerStyle: { backgroundColor: theme.nav },
          headerTintColor: theme.foreground,
          headerTitleStyle: { fontWeight: '700' },
          headerRight: () => <ThemeToggle />,
          tabBarStyle: { backgroundColor: theme.nav, borderTopColor: theme.navBorder },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.mutedForeground,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          sceneStyle: { backgroundColor: theme.background },
        }}>
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(tab.titleKey),
              href: hrefFor(tab.name),
              tabBarIcon: ({ color, size }) => (
                <Ionicons name={tab.icon} size={size ?? 22} color={color} />
              ),
            }}
          />
        ))}
      </Tabs>
      <WhatsAppFab />
    </>
  );
}

/**
 * Global WhatsApp CTA — the website's `WhatsAppBubble`
 * (`src/components/layout/whatsapp-bubble.tsx`), restated natively.
 *
 * Mounted once beside the navigator (not inside a screen) so it floats above
 * every tab. It never navigates — it opens a pure `wa.me` deep link. Hidden
 * when the CTA is disabled, the number is missing/short, or the public
 * config cannot be fetched (fail-soft: no dead button, no error).
 */
function WhatsAppFab() {
  const styles = useFabStyles();
  const insets = useSafeAreaInsets();
  const { isRtl, lang, t } = useI18n();
  const cta = usePublicCta();

  if (!cta) return null;
  const href = ctaUrl(cta, lang);
  if (!href) return null;
  const label = ctaLabel(cta, lang, t('common.whatsappChat'));

  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(href);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.fab,
        // Above the tab bar: 49 (default bar height) + 16 gap, plus the
        // bottom safe-area inset so it never sits on the home indicator or
        // cover tab content. Reading edge, mirroring the website bubble.
        { bottom: insets.bottom + 49 + 16 },
        isRtl ? { left: 16 } : { right: 16 },
      ]}>
      <Ionicons name="logo-whatsapp" size={28} color="#FFFFFF" />
    </Pressable>
  );
}

const useFabStyles = createStyles((t) =>
  StyleSheet.create({
    // Same treatment as the website bubble: 56px #25D366 circle, shadow.
    fab: {
      position: 'absolute',
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#25D366',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: t.mode === 'light' ? 0.25 : 0.5,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
  }),
);
