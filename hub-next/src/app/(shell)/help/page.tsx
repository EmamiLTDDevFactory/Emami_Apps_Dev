'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Send, ShieldCheck, ChevronDown, ChevronUp, LifeBuoy, HelpCircle } from 'lucide-react';
import { APPS } from '../../../data/mockData';
import { useUnlockedAppIds } from '../../../hooks/useAppAccess';
import { useAuth } from '../../../context/AuthContext';
import { logEvent } from '../../../lib/authApi';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';

/** Swap these for the team's real channels — kept as one block so they're easy to find and change. */
const SUPPORT_EMAIL = 'indranil.banerjee@emamigroup.com';
const SUPPORT_CC = 'sayontan.das@emamigroup.com';
const CONTACT_CARDS = [
  {
    icon: Send,
    title: 'Report an Issue',
    subtitle: 'Something broken, slow, or not behaving as expected',
    href: `mailto:${SUPPORT_EMAIL}?cc=${SUPPORT_CC}&subject=${encodeURIComponent('Emami Apps — Bug report')}`,
  },
  {
    icon: ShieldCheck,
    title: 'Request App Access',
    subtitle: 'Need a locked application unlocked, or a role changed',
    href: `mailto:${SUPPORT_EMAIL}?cc=${SUPPORT_CC}&subject=${encodeURIComponent('Emami Apps — Access request')}`,
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

/** Written from how sign-in, Manage Access, and app locking actually behave in this app — not
 * generic placeholder copy. */
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
        q: "Why can't I find an application I'm looking for?",
        a: "Every application shows as a tile, but one you haven't been granted appears locked — ask your Admin to grant it from Manage Access.",
      },
      {
        q: 'How do I get access to an application?',
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
        a: 'Open My Profile from the sidebar — your last login, total sessions, and activity stats (apps opened, downloads, favorites) are all shown on your profile there.',
      },
      {
        q: 'How do I sign out?',
        a: 'Use "Sign out" from the menu in the top header, or from your Profile page.',
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
        q: 'An application I used to have access to has disappeared.',
        a: 'Your access may have been changed by an Admin. Use Request App Access above to confirm or ask for it back.',
      },
    ],
  },
];

function normalize(s: string) {
  return s.toLowerCase();
}

export default function HelpPage() {
  const router = useRouter();
  const [faqQuery, setFaqQuery] = useState('');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
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
    return FAQ_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => normalize(item.q).includes(q) || normalize(item.a).includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [faqQuery]);

  const openApp = (appId: string) => {
    if (!unlockedAppIds.has(appId)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', appId);
    const url = APPS.find((a) => a.id === appId)?.url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(`/apps/${appId}`);
  };

  const unlockedApps = APPS.filter((a) => unlockedAppIds.has(a.id));

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: radii.xl, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <LifeBuoy size={20} color={colors.rust} />
        </div>
        <p style={{ fontSize: 22, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>Help & Support</p>
        <p style={{ fontSize: 13, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 4, marginBottom: 0, textAlign: 'center' }}>
          Guides, answers, and how to reach us if something&apos;s not working.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 460, borderRadius: radii.pill, padding: '0 16px', height: 42, backgroundColor: colors.white, marginTop: 18 }}>
          <Search size={15} color={colors.inkSoft} />
          <input
            value={faqQuery}
            onChange={(e) => setFaqQuery(e.target.value)}
            placeholder="Search help articles and FAQs…"
            style={{ flex: 1, fontSize: 13.5, color: colors.ink, fontFamily: fonts.sansRegular, border: 'none', outline: 'none', background: 'transparent', height: '100%' }}
            aria-label="Search help articles and FAQs"
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {CONTACT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.title}
              href={card.href}
              style={{ flex: 1, minWidth: 200, border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, padding: 16, textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: radii.md, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <Icon size={16} color={colors.rust} />
              </div>
              <p style={{ fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0 }}>{card.title}</p>
              <p style={{ fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 4, marginBottom: 0, lineHeight: '16px' }}>{card.subtitle}</p>
            </a>
          );
        })}
      </div>

      {unlockedApps.length > 0 && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, padding: 18, marginBottom: 20 }}>
          <p style={{ fontSize: 13.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 0, marginBottom: 12 }}>Need help with a specific application?</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unlockedApps.map((app) => {
              const Icon = app.icon;
              const accent = appColor(app.id);
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => openApp(app.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${accent}`, borderRadius: radii.pill, padding: '7px 12px', backgroundColor: `${accent}14`, cursor: 'pointer' }}
                >
                  <Icon size={13} color={accent} />
                  <span style={{ fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: accent }}>{app.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginBottom: 12 }}>Frequently Asked Questions</p>

      {filteredGroups.length === 0 ? (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, gap: 8 }}>
          <HelpCircle size={22} color={colors.inkSoft} />
          <p style={{ fontSize: 12.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.inkSoft, textAlign: 'center', margin: 0 }}>
            No FAQs match &quot;{faqQuery}&quot;. Try Report an Issue above.
          </p>
        </div>
      ) : (
        filteredGroups.map((group) => (
          <div key={group.title} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, padding: 18, marginBottom: 14 }}>
            <p style={{ fontSize: 10.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.rust, marginTop: 0, marginBottom: 6 }}>
              {group.title}
            </p>
            {group.items.map((item, i) => {
              const id = `${group.title}__${item.q}`;
              const open = openItems.has(id);
              return (
                <div key={id} style={{ padding: '12px 0', borderBottom: i < group.items.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                  <button
                    type="button"
                    onClick={() => toggleItem(id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    aria-expanded={open}
                  >
                    <span style={{ flex: 1, fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{item.q}</span>
                    {open ? <ChevronUp size={16} color={colors.inkSoft} /> : <ChevronDown size={16} color={colors.inkSoft} />}
                  </button>
                  {open && (
                    <p style={{ fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '19px', marginTop: 8, marginBottom: 0, paddingRight: 24 }}>
                      {item.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
