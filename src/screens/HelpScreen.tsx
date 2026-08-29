import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Search, Mail, Send, ShieldCheck, ChevronDown, ChevronUp, Lock, LifeBuoy, HelpCircle,
} from 'lucide-react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { APPS } from '../data/mockData';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { useAuth } from '../context/AuthContext';
import { logEvent } from '../lib/authApi';
import { colors, fonts, radii, appColor } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

/** Swap these for the team's real channels — kept as one block so they're easy to find and change. */
const SUPPORT_EMAIL = 'support@emamigroup.com';
const CONTACT_CARDS = [
  {
    icon: Mail,
    title: 'Email Support',
    subtitle: 'General questions about the hub or any application in it',
    action: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EmamiApps Hub — Support request')}`),
  },
  {
    icon: Send,
    title: 'Report an Issue',
    subtitle: 'Something broken, slow, or not behaving as expected',
    action: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EmamiApps Hub — Bug report')}`),
  },
  {
    icon: ShieldCheck,
    title: 'Request App Access',
    subtitle: 'Need a locked application unlocked, or a role changed',
    action: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EmamiApps Hub — Access request')}`),
  },
];

interface FaqItem {
  q: string;
  a: string;
}
interface FaqGroup {
  title: string;
  items: FaqItem[];
}

/** Written from how sign-in, Manage Access, and app locking actually behave in this app (see
 * LoginScreen.tsx, UserAccessScreen.tsx, useAppAccess.ts) — not generic placeholder copy. */
const FAQ_GROUPS: FaqGroup[] = [
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How do I sign in?',
        a: 'Enter your work email on the sign-in page. @emamigroup.com addresses are routed to "Sign in with Microsoft" automatically; any other registered email signs in directly, no separate password screen.',
      },
      {
        q: 'I typed my email and got "This email-id is not registered" — what do I do?',
        a: "Your email hasn't been added to Manage Access yet. Ask your Admin or Super Admin to add you — see the Request App Access card above.",
      },
      {
        q: 'Do I need a password for this hub?',
        a: "Not directly. @emamigroup.com accounts authenticate through your organization's Microsoft sign-in. Other registered emails don't use a password at all — access is controlled entirely through Manage Access.",
      },
    ],
  },
  {
    title: 'Applications & Access',
    items: [
      {
        q: 'Why is an application tile locked?',
        a: "Locked tiles stay visible so you know what's available, but only applications an Admin has explicitly granted you open when tapped. A locked tile is dimmed and shows a lock icon.",
      },
      {
        q: 'How do I get access to a locked application?',
        a: 'Ask your Admin or Super Admin to grant it to you from Manage Access — see the Request App Access card above.',
      },
      {
        q: "What's the difference between Super Admin, Admin, and Viewer?",
        a: "Super Admin can grant Admin or Viewer access to anyone and can't be changed or removed. Admin can grant Viewer access to others, but not Admin. Viewer can use the hub but can't manage anyone else's access.",
      },
      {
        q: 'Why don\'t I see "Manage Access" in the sidebar?',
        a: "It's only shown to Super Admin and Admin users — if you need something changed there, use Request App Access above.",
      },
    ],
  },
  {
    title: 'Account & Activity',
    items: [
      {
        q: 'Where can I see my login history and activity?',
        a: 'Open Settings from the sidebar — your last login, total sessions, and activity stats (apps opened, downloads, favorites) are all shown on your profile there.',
      },
      {
        q: 'How do I sign out?',
        a: 'Use "Sign out" from the menu in the top header, or from your Settings page.',
      },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      {
        q: 'An application opens but shows a blank page.',
        a: "Try refreshing first. If it persists, the application itself may be temporarily down — Report an Issue above with the application's name and roughly when it happened.",
      },
      {
        q: '"Sign in with Microsoft" failed or came back with an error.',
        a: "This usually means single sign-on isn't fully configured yet, or your Microsoft account isn't authorized for this hub. Report an Issue above and mention the error message you saw.",
      },
      {
        q: 'An application I used to have access to is now locked.',
        a: 'Your access may have been changed by an Admin. Use Request App Access above to confirm or ask for it back.',
      },
    ],
  },
];

function normalize(s: string) {
  return s.toLowerCase();
}

export default function HelpScreen() {
  const [headerQuery, setHeaderQuery] = useState('');
  const [faqQuery, setFaqQuery] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unlockedAppIds = useUnlockedAppIds();
  const { userEmail } = useAuth();

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredGroups = useMemo(() => {
    const q = normalize(faqQuery.trim());
    if (!q) return FAQ_GROUPS;
    return FAQ_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => normalize(item.q).includes(q) || normalize(item.a).includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  }, [faqQuery]);

  const openApp = (appId: string) => {
    if (!unlockedAppIds.has(appId)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', appId);
    // Web: open the app in its own tab instead of navigating this one away. Native has no tab
    // concept, so it keeps going through AppDetail's in-app WebView.
    const url = APPS.find((a) => a.id === appId)?.url;
    if (Platform.OS === 'web' && url) {
      Linking.openURL(url);
      return;
    }
    navigation.navigate('AppDetail', { appId });
  };

  return (
    <ScreenScaffold searchValue={headerQuery} onSearchChange={setHeaderQuery}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIconBox}>
            <LifeBuoy size={20} color={colors.rust} />
          </View>
          <Text style={styles.pageTitle}>Help & Support</Text>
          <Text style={styles.pageSubtitle}>Guides, answers, and how to reach us if something's not working.</Text>

          <View style={styles.searchWrap}>
            <Search size={15} color={colors.inkSoft} />
            <TextInput
              value={faqQuery}
              onChangeText={setFaqQuery}
              placeholder="Search help articles and FAQs…"
              placeholderTextColor={colors.inkSoft}
              style={styles.searchInput}
              accessibilityLabel="Search help articles and FAQs"
            />
          </View>
        </View>

        <View style={styles.contactRow}>
          {CONTACT_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Pressable
                key={card.title}
                onPress={card.action}
                style={styles.contactCard}
                accessibilityRole="button"
                accessibilityLabel={card.title}
              >
                <View style={styles.contactIconBox}>
                  <Icon size={16} color={colors.rust} />
                </View>
                <Text style={styles.contactTitle}>{card.title}</Text>
                <Text style={styles.contactSubtitle}>{card.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>

        {APPS.length > 0 && (
          <View style={[styles.baseCard, styles.appsCard]}>
            <Text style={styles.sectionTitle}>Need help with a specific application?</Text>
            <View style={styles.appChipsRow}>
              {APPS.map((app) => {
                const Icon = app.icon;
                const accent = appColor(app.id);
                const locked = !unlockedAppIds.has(app.id);
                return (
                  <Pressable
                    key={app.id}
                    onPress={() => openApp(app.id)}
                    style={[styles.appChip, { borderColor: locked ? colors.border : accent }, !locked && { backgroundColor: `${accent}14` }]}
                    accessibilityRole="button"
                    accessibilityLabel={locked ? `${app.name} — locked` : `Open ${app.name}`}
                  >
                    {locked ? <Lock size={12} color={colors.inkSoft} /> : <Icon size={13} color={accent} />}
                    <Text style={[styles.appChipText, { color: locked ? colors.inkSoft : accent }]}>{app.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, styles.faqSectionTitle]}>Frequently Asked Questions</Text>

        {filteredGroups.length === 0 ? (
          <View style={[styles.baseCard, styles.emptyCard]}>
            <HelpCircle size={22} color={colors.inkSoft} />
            <Text style={styles.emptyText}>No FAQs match "{faqQuery}". Try Email Support above.</Text>
          </View>
        ) : (
          filteredGroups.map((group) => (
            <View key={group.title} style={[styles.baseCard, styles.faqGroupCard]}>
              <Text style={styles.faqGroupTitle}>{group.title}</Text>
              {group.items.map((item, i) => {
                const id = `${group.title}__${item.q}`;
                const open = openItems.has(id);
                return (
                  <View key={id} style={[styles.faqRow, i < group.items.length - 1 && styles.faqRowBorder]}>
                    <Pressable
                      onPress={() => toggleItem(id)}
                      style={styles.faqQuestionRow}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={item.q}
                    >
                      <Text style={styles.faqQuestion}>{item.q}</Text>
                      {open ? <ChevronUp size={16} color={colors.inkSoft} /> : <ChevronDown size={16} color={colors.inkSoft} />}
                    </Pressable>
                    {open && <Text style={styles.faqAnswer}>{item.a}</Text>}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.xl,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 4,
    textAlign: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    height: 42,
    backgroundColor: colors.white,
    marginTop: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: colors.ink,
    fontFamily: fonts.sansRegular,
    padding: 0,
    height: '100%',
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  contactCard: {
    flex: 1,
    minWidth: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 16,
  },
  contactIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  contactTitle: {
    fontSize: 13.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  contactSubtitle: {
    fontSize: 11.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 4,
    lineHeight: 16,
  },
  baseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
  },
  appsCard: {
    padding: 18,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontFamily: fonts.sansBold,
    color: colors.ink,
    marginBottom: 12,
  },
  faqSectionTitle: {
    fontSize: 15,
    marginBottom: 12,
  },
  appChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  appChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.appBg,
  },
  appChipText: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 12.5,
    fontFamily: fonts.sansMedium,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  faqGroupCard: {
    padding: 18,
    marginBottom: 14,
  },
  faqGroupTitle: {
    fontSize: 10.5,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.rust,
    marginBottom: 6,
  },
  faqRow: {
    paddingVertical: 12,
  },
  faqRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  faqAnswer: {
    fontSize: 12.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    lineHeight: 19,
    marginTop: 8,
    paddingRight: 24,
  },
});
