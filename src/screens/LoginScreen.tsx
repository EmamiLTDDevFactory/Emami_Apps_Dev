import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { BadgeCheck, Mail, CheckCircle2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { colors, fonts, radii } from '../theme/tokens';
import EmpAppMark from '../components/EmpAppMark';
import { getMicrosoftSignInUrl, loginWithEmail, checkStillAuthorized } from '../lib/authApi';

interface LoginScreenProps {
  error?: string | null;
  verifying?: boolean;
  onDismissError?: () => void;
  onLogin?: (email?: string, token?: string) => void;
}

/**
 * One email field, one action button that redraws itself as the user types — mirrors how
 * Microsoft's own sign-in page (and Entra External ID) resolves an account before showing the
 * right next step. @emamigroup.com emails turn the button into "Sign in with Microsoft" (SAML
 * 2.0, backend/saml-sso.js — only works once the bundled Azure IdP metadata is present and
 * HUB_AUTH_SAML_ENABLED=true; until then the backend redirects back here with
 * ?ssoError=not_configured, which RootNavigator turns into the "not set up yet" message). Every
 * other domain keeps the button labeled "Continue" for direct email sign-in.
 *
 * Both paths are gated by the same Manage Access check (authApi.ts's checkStillAuthorized,
 * backed by emami_apps.authorized_users) — an email must exist there and be active to log in. The
 * live debounced check below (liveStatus) calls that same function purely for the inline
 * checkmark/error feedback as you type; the actual submit still re-derives from its result rather
 * than trusting client state alone (see signInWithEmail).
 */
const SSO_DOMAIN = '@emamigroup.com';
const LIVE_CHECK_DEBOUNCE_MS = 500;

const APPS_GRADIENT = ['#2563EB', '#7C3AED', '#16A34A', '#F59E0B', '#DB2777'] as const;

// Purely decorative accents for this screen only — Login intentionally
// breaks from the brand palette here (same as APPS_GRADIENT above), so
// these stay local rather than being promoted into theme/tokens.ts.
const LOGIN_ACCENTS = {
  blobTop: '#F7B9A0',
  blobBottom: '#A9C9F5',
  blobMid: '#F5C9E0',
  haloRingOuter: 'rgba(31,27,51,0.12)',
  haloRingInner: 'rgba(31,27,51,0.1)',
  haloDotBlue: '#2563EB',
  haloDotPink: '#DB2777',
  taglineAccent: '#0D9488',
} as const;

// One-off hero-card radius (bigger than any step in the shared `radii`
// scale) — not a missing token, just this card's specific treatment.
const CARD_RADIUS = radii.xxxl + 6;

function AppsWordmark() {
  // react-native-web doesn't actually mask with @react-native-masked-view —
  // it silently falls back to rendering the opaque mask text, which is why
  // this showed up solid black on web. Use the CSS gradient-text trick there
  // instead; MaskedView works correctly on native (iOS/Android).
  if (Platform.OS === 'web') {
    const webGradientStyle: any = {
      backgroundImage: `linear-gradient(90deg, ${APPS_GRADIENT.join(', ')})`,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
    };
    return <Text style={[styles.appsText, webGradientStyle]}>APPS</Text>;
  }

  return (
    <MaskedView maskElement={<Text style={styles.appsText}>APPS</Text>}>
      <LinearGradient
        colors={APPS_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={[styles.appsText, { opacity: 0 }]}>APPS</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/** Classic four-square Microsoft glyph — lucide has no brand icon for this, so it's drawn directly. */
function MicrosoftGlyph() {
  const squares = ['#F25022', '#7FBA00', '#00A4EF', '#FFB900'];
  return (
    <View style={styles.msGlyph}>
      {squares.map((color) => (
        <View key={color} style={[styles.msGlyphSquare, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/** Mirrors Microsoft's own account-resolution UX: as the user finishes typing, the field/button
 * redraw themselves before any click. 'checking'/'authorized'/'unauthorized' only apply to
 * non-@emamigroup.com addresses — corporate emails go straight to 'sso' since Microsoft (not
 * Manage Access) is the first gate there; the Manage Access re-check for that path still happens
 * at submit time (see signInWithEmail), it just isn't reflected in the field live. */
type LiveStatus = 'idle' | 'checking' | 'sso' | 'authorized' | 'unauthorized';

export default function LoginScreen({ error, verifying, onDismissError, onLogin }: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle');

  const trimmedEmail = email.trim().toLowerCase();
  const looksLikeEmail = /^\S+@\S+\.\S+$/.test(trimmedEmail);
  const isSsoDomain = trimmedEmail.endsWith(SSO_DOMAIN);

  // Debounced live check — same checkStillAuthorized() call authApi.ts already uses to re-verify
  // a persisted session (App.tsx) and the post-SSO callback (verifySsoToken). Calling it here too,
  // on a timer instead of a click, is what lets the field show "not registered" (or a checkmark)
  // before the user ever presses the button.
  useEffect(() => {
    if (!looksLikeEmail) {
      setLiveStatus('idle');
      return;
    }
    if (isSsoDomain) {
      setLiveStatus('sso');
      return;
    }
    setLiveStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const authorized = await checkStillAuthorized(trimmedEmail);
      if (!cancelled) setLiveStatus(authorized ? 'authorized' : 'unauthorized');
    }, LIVE_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedEmail, looksLikeEmail, isSsoDomain]);

  const signInWithMicrosoft = () => {
    const url = getMicrosoftSignInUrl();
    if (Platform.OS === 'web') {
      window.location.href = url;
    } else {
      // Native completion (deep-linking back into the app after SSO) isn't
      // wired up yet — this app is served as a web hub today.
      Linking.openURL(url).catch(() => {});
    }
  };

  const signInWithEmail = async () => {
    setLocalError('');
    onDismissError?.();
    if (liveStatus === 'idle' || liveStatus === 'checking') return; // button is disabled here anyway

    if (liveStatus === 'sso') {
      // The live check above never ran for this domain — Manage Access still has to be checked
      // before handing off to Microsoft, so a user who isn't registered never leaves this page.
      setCheckingAccess(true);
      const authorized = await checkStillAuthorized(trimmedEmail);
      setCheckingAccess(false);
      if (!authorized) {
        setLiveStatus('unauthorized');
        setLocalError('This email-id is not registered. Contact your admin for access.');
        return;
      }
      signInWithMicrosoft();
      return;
    }

    if (liveStatus === 'unauthorized') {
      setLocalError('This email-id is not registered. Contact your admin for access.');
      return;
    }

    setCheckingAccess(true);
    const result = await loginWithEmail(trimmedEmail);
    setCheckingAccess(false);
    if (!result.ok) {
      setLiveStatus('unauthorized');
      setLocalError(result.error || 'This email-id is not registered.');
      return;
    }
    onLogin?.(result.email, result.token);
  };

  const shownError = error || localError;
  const busy = verifying || checkingAccess;
  const buttonDisabled = checkingAccess || liveStatus === 'idle' || liveStatus === 'checking';
  const fieldInvalid = liveStatus === 'unauthorized';
  const fieldValid = liveStatus === 'authorized' || liveStatus === 'sso';

  return (
    <View style={styles.root}>
      <View style={[styles.blob, styles.blobTop]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobBottom]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobMid]} pointerEvents="none" />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.logoHalo} pointerEvents="none">
              <View style={[styles.haloRing, styles.haloRingOuter]} />
              <View style={[styles.haloRing, styles.haloRingInner]} />
              <View style={[styles.haloDot, styles.haloDotBlue]} />
              <View style={[styles.haloDot, styles.haloDotPink]} />
            </View>
            <View style={styles.logoTile}>
              <EmpAppMark size={56} />
            </View>

            <AppsWordmark />
            <Text style={styles.tagline}>
              <Text style={styles.taglinePrimary}>ONE ACCESS. </Text>
              <Text style={styles.taglineAccent}>ENDLESS POSSIBILITIES.</Text>
            </Text>

            <View style={styles.badgePill}>
              <BadgeCheck size={13} color={colors.white} />
              <Text style={styles.badgeText}>EMAMI APPS. EMPOWERING EVERY POSSIBILITY.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>{busy ? 'Signing you in…' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {verifying ? 'Verifying your Microsoft sign-in.' : 'Sign in with your Emami work email'}
            </Text>

            {verifying ? (
              <ActivityIndicator size="small" color={colors.plumDeep} style={{ marginTop: 10 }} />
            ) : (
              <>
                {!!shownError && <Text style={styles.error}>{shownError}</Text>}

                <View style={styles.inputWrapper}>
                  <Mail size={16} color={colors.inkSoft} style={styles.inputIconLeft} />
                  <TextInput
                    style={[
                      styles.input,
                      fieldInvalid && styles.inputInvalid,
                      fieldValid && styles.inputValid,
                    ]}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setLocalError(''); onDismissError?.(); }}
                    placeholder="you@company.com"
                    placeholderTextColor={colors.inkSoft}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!checkingAccess}
                    onSubmitEditing={signInWithEmail}
                  />
                  {liveStatus === 'checking' && (
                    <ActivityIndicator size="small" color={colors.inkSoft} style={styles.inputIconRight} />
                  )}
                  {fieldValid && (
                    <CheckCircle2 size={18} color={colors.green} style={styles.inputIconRight} />
                  )}
                </View>
                {fieldInvalid && (
                  <Text style={styles.fieldError}>This email-id is not registered. Contact your admin for access.</Text>
                )}

                <Pressable
                  onPress={signInWithEmail}
                  style={[
                    styles.primaryBtn,
                    liveStatus === 'sso' && styles.microsoftBtn,
                    buttonDisabled && styles.primaryBtnDisabled,
                  ]}
                  disabled={buttonDisabled}
                >
                  {checkingAccess ? (
                    <ActivityIndicator size="small" color={liveStatus === 'sso' ? colors.ink : colors.white} />
                  ) : liveStatus === 'sso' ? (
                    <>
                      <MicrosoftGlyph />
                      <Text style={styles.microsoftBtnText}>Sign in with Microsoft</Text>
                    </>
                  ) : (
                    <Text style={[styles.primaryBtnText, buttonDisabled && styles.primaryBtnTextDisabled]}>Continue →</Text>
                  )}
                </Pressable>
              </>
            )}

            <Text style={styles.helper}>
              <Text style={styles.helperAccent}>@emamigroup.com signs in with Microsoft. </Text>
              <Text>No access? Contact your admin.</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream2,
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.22,
  },
  blobTop: {
    width: 420,
    height: 420,
    backgroundColor: LOGIN_ACCENTS.blobTop,
    top: -200,
    right: -160,
  },
  blobBottom: {
    width: 360,
    height: 360,
    backgroundColor: LOGIN_ACCENTS.blobBottom,
    bottom: -160,
    left: -130,
  },
  blobMid: {
    width: 300,
    height: 300,
    backgroundColor: LOGIN_ACCENTS.blobMid,
    top: 100,
    left: -130,
    opacity: 0.16,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  hero: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    marginBottom: 28,
  },
  logoHalo: {
    position: 'absolute',
    top: -50,
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
  },
  haloRingOuter: {
    width: 190,
    height: 190,
    borderColor: LOGIN_ACCENTS.haloRingOuter,
  },
  haloRingInner: {
    width: 142,
    height: 142,
    borderColor: LOGIN_ACCENTS.haloRingInner,
  },
  haloDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  haloDotBlue: {
    backgroundColor: LOGIN_ACCENTS.haloDotBlue,
    top: 24,
    left: 18,
  },
  haloDotPink: {
    backgroundColor: LOGIN_ACCENTS.haloDotPink,
    top: 24,
    right: 18,
  },
  logoTile: {
    width: 96,
    height: 96,
    borderRadius: radii.xxl,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.plumDeep,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  appsText: {
    fontFamily: fonts.sansBold,
    fontSize: 46,
    letterSpacing: 0,
    color: '#000',
  },
  tagline: {
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: 8,
    textAlign: 'center',
  },
  taglinePrimary: {
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  taglineAccent: {
    fontFamily: fonts.sansBold,
    color: LOGIN_ACCENTS.taglineAccent,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.plumDeep,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 20,
  },
  badgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.white,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: CARD_RADIUS,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: colors.plumDeep,
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  welcome: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    color: colors.inkSoft,
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center',
  },
  inputWrapper: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: colors.cream2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingLeft: 42,
    paddingRight: 18,
    paddingVertical: 14,
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: colors.ink,
  },
  inputInvalid: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  inputValid: {
    borderColor: colors.rust,
  },
  inputIconLeft: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  inputIconRight: {
    position: 'absolute',
    right: 16,
  },
  fieldError: {
    width: '100%',
    fontFamily: fonts.sansMedium,
    fontSize: 11.5,
    color: '#DC2626',
    marginTop: 6,
  },
  error: {
    width: '100%',
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: '#DC2626',
    marginTop: 4,
    marginBottom: 6,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.rust,
    borderRadius: radii.pill,
    paddingVertical: 14,
    gap: 10,
    marginTop: 16,
  },
  primaryBtnDisabled: {
    backgroundColor: colors.border,
  },
  primaryBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14.5,
    color: colors.white,
  },
  primaryBtnTextDisabled: {
    color: colors.inkSoft,
  },
  microsoftBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  microsoftBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14.5,
    color: colors.ink,
  },
  msGlyph: {
    width: 16,
    height: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1,
  },
  msGlyphSquare: {
    width: 7.5,
    height: 7.5,
  },
  helper: {
    marginTop: 20,
    fontFamily: fonts.sansRegular,
    fontSize: 11.5,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  helperAccent: {
    fontFamily: fonts.sansMedium,
    color: colors.rust,
  },
});
