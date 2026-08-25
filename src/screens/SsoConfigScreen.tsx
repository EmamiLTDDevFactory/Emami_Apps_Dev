import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Switch, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowLeft, ShieldCheck, Info, UploadCloud, Copy, Check, Trash2, KeyRound, CalendarClock,
} from 'lucide-react-native';
import ScreenScaffold from '../components/ScreenScaffold';
import { colors, fonts, radii } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { getSsoConfig, uploadIdpMetadata, setSsoEnabled, clearSsoConfig } from '../lib/ssoConfigApi';
import type { SsoConfig } from '../types';

/** Reads the text content of a picked file cross-platform — expo-document-picker's web assets
 * carry a `file` Blob directly; native assets carry a `uri` that `fetch` can read. */
async function readAssetText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const webFile = (asset as unknown as { file?: File }).file;
  if (webFile) return webFile.text();
  const response = await fetch(asset.uri);
  return response.text();
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Highlights an expiry date once it's close — an expired/soon-to-expire signing certificate is
 * the single most common way SAML SSO silently breaks. */
function expiryTone(iso?: string | null): 'ok' | 'soon' | 'expired' | null {
  if (!iso) return null;
  const daysLeft = (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'expired';
  if (daysLeft < 30) return 'soon';
  return 'ok';
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Clipboard access can be denied by the browser — the value is still visible to select by hand.
    }
  };

  return (
    <View style={styles.copyField}>
      <View style={styles.flex1}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue} selectable numberOfLines={2}>{value}</Text>
      </View>
      <Pressable onPress={copy} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}>
        {copied ? <Check size={14} color={colors.green} /> : <Copy size={14} color={colors.inkSoft} />}
      </Pressable>
    </View>
  );
}

export default function SsoConfigScreen() {
  const [query, setQuery] = useState('');
  const navigation = useNavigation();
  const { userEmail } = useAuth();

  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const result = await getSsoConfig();
    setLoading(false);
    if (result.ok && result.config) {
      setConfig(result.config);
    } else {
      setError(result.error || 'Could not load SSO configuration.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pickAndUpload = async () => {
    setError('');
    setNotice('');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/xml', 'text/xml', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const xml = await readAssetText(result.assets[0]);
      const uploadResult = await uploadIdpMetadata(xml, userEmail || undefined);
      if (!uploadResult.ok || !uploadResult.idp) {
        setError(uploadResult.error || 'Could not save this configuration.');
        return;
      }
      await load();
      setNotice('Metadata uploaded. Turn on "Sign in with Microsoft" below once you\'re ready.');
    } catch {
      setError('Could not read this file. Make sure it\'s the Federation Metadata XML from Azure.');
    } finally {
      setUploading(false);
    }
  };

  const toggleEnabled = async (next: boolean) => {
    setError('');
    setToggling(true);
    const result = await setSsoEnabled(next);
    setToggling(false);
    if (!result.ok) {
      setError(result.error || 'Could not update this setting.');
      return;
    }
    setConfig((prev) => (prev ? { ...prev, idp: { ...prev.idp, isEnabled: next } } : prev));
  };

  const removeConfig = async () => {
    setError('');
    setRemoving(true);
    const result = await clearSsoConfig();
    setRemoving(false);
    if (!result.ok) {
      setError(result.error || 'Could not clear this configuration.');
      return;
    }
    setConfig((prev) => (prev ? { ...prev, idp: { configured: false, isEnabled: false } } : prev));
    setNotice('SSO configuration removed. Microsoft sign-in is off until new metadata is uploaded.');
  };

  const idp = config?.idp;
  const tone = expiryTone(idp?.certificateExpiresAt);

  return (
    <ScreenScaffold searchValue={query} onSearchChange={setQuery}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.backBtn} onPress={() => navigation.navigate('UserAccess' as never)}>
            <ArrowLeft size={13} color={colors.ink} />
            <Text style={styles.backText}>Back to Manage Access</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Configure SSO</Text>
        </View>

        <View style={styles.noticeCard}>
          <Info size={15} color={colors.rust} />
          <Text style={styles.noticeText}>
            Microsoft is the Identity Provider (IdP); EmamiApps is the Service Provider (SP). Give
            Azure the SP details below when creating the Enterprise Application, then upload the
            Federation Metadata XML it generates — no code change needed to rotate certificates or
            update the SSO URL later, just re-upload here.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={colors.rust} style={styles.loadingIndicator} />
        ) : (
          <>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {!!notice && <Text style={styles.noticeText2}>{notice}</Text>}

            <View style={[styles.baseCard, styles.card]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <KeyRound size={15} color={colors.rust} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>1. Service Provider (give these to Azure)</Text>
                  <Text style={styles.cardSubtitle}>
                    In Azure: Enterprise Applications → New application → non-gallery → Single sign-on → SAML
                  </Text>
                </View>
              </View>

              <CopyField label="Identifier (Entity ID)" value={config?.sp.entityId || ''} />
              <CopyField label="Reply URL (Assertion Consumer Service URL)" value={config?.sp.acsUrl || ''} />
            </View>

            <View style={[styles.baseCard, styles.card]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardIconBox}>
                  <ShieldCheck size={15} color={colors.rust} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.cardTitle}>2. Identity Provider (upload from Azure)</Text>
                  <Text style={styles.cardSubtitle}>
                    Download "Federation Metadata XML" from the SAML setup page and upload it here
                  </Text>
                </View>
              </View>

              <Pressable style={styles.uploadBtn} onPress={pickAndUpload} disabled={uploading}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <UploadCloud size={14} color={colors.white} />
                    <Text style={styles.uploadBtnText}>{idp?.configured ? 'Replace metadata.xml' : 'Upload metadata.xml'}</Text>
                  </>
                )}
              </Pressable>

              {idp?.configured && (
                <>
                  <View style={styles.divider} />

                  <View style={styles.statusRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.statusLabel}>Sign in with Microsoft</Text>
                      <Text style={styles.statusHelper}>
                        {idp.isEnabled ? 'Live — the Login screen shows the Microsoft button.' : 'Off — email sign-in only, until enabled.'}
                      </Text>
                    </View>
                    {toggling ? (
                      <ActivityIndicator size="small" color={colors.rust} />
                    ) : (
                      <Switch
                        value={idp.isEnabled}
                        onValueChange={toggleEnabled}
                        trackColor={{ true: colors.rust, false: colors.border }}
                        accessibilityLabel={`${idp.isEnabled ? 'Disable' : 'Enable'} Microsoft sign-in`}
                      />
                    )}
                  </View>

                  <View style={styles.metaGrid}>
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>IdP Entity ID</Text>
                      <Text style={styles.metaValue} selectable numberOfLines={2}>{idp.entityId}</Text>
                    </View>
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>SSO URL</Text>
                      <Text style={styles.metaValue} selectable numberOfLines={2}>{idp.ssoUrl}</Text>
                    </View>
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Uploaded</Text>
                      <Text style={styles.metaValue}>{formatDate(idp.uploadedAt)}{idp.uploadedBy ? ` · ${idp.uploadedBy}` : ''}</Text>
                    </View>
                    <View style={styles.metaCell}>
                      <View style={styles.certLabelRow}>
                        <CalendarClock size={11} color={colors.inkSoft} />
                        <Text style={styles.metaLabel}>Certificate expires</Text>
                      </View>
                      <Text style={[
                        styles.metaValue,
                        tone === 'expired' && styles.metaValueDanger,
                        tone === 'soon' && styles.metaValueWarn,
                      ]}>
                        {formatDate(idp.certificateExpiresAt)}
                        {tone === 'expired' ? ' · Expired' : tone === 'soon' ? ' · Expiring soon' : ''}
                      </Text>
                    </View>
                  </View>

                  <Pressable style={styles.removeBtn} onPress={removeConfig} disabled={removing}>
                    {removing ? (
                      <ActivityIndicator size="small" color={colors.rust} />
                    ) : (
                      <>
                        <Trash2 size={13} color={colors.rust} />
                        <Text style={styles.removeBtnText}>Remove configuration</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  flex1: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.white,
  },
  backText: {
    fontSize: 12,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  pageTitle: {
    fontSize: 18,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: `${colors.rust}33`,
    backgroundColor: `${colors.rust}0d`,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.ink,
    lineHeight: 17,
  },
  noticeText2: {
    fontSize: 12,
    fontFamily: fonts.sansMedium,
    color: colors.green,
    marginBottom: 12,
  },
  loadingIndicator: {
    marginTop: 18,
  },
  errorText: {
    fontSize: 11.5,
    fontFamily: fonts.sansMedium,
    color: '#C0392B',
    marginBottom: 12,
  },
  baseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14.5,
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 1,
  },
  copyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.appBg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },
  copyLabel: {
    fontSize: 10,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    marginBottom: 3,
  },
  copyValue: {
    fontSize: 12.5,
    fontFamily: fonts.sansMedium,
    color: colors.ink,
  },
  copyBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.lg,
    paddingVertical: 12,
    backgroundColor: colors.rust,
  },
  uploadBtnText: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.white,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 13,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  statusHelper: {
    fontSize: 11.5,
    fontFamily: fonts.sansRegular,
    color: colors.inkSoft,
    marginTop: 2,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  metaCell: {
    minWidth: 200,
    flexGrow: 1,
  },
  certLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: fonts.sansBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.ink,
  },
  metaValueWarn: {
    color: '#B45309',
  },
  metaValueDanger: {
    color: '#C0392B',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: `${colors.rust}40`,
    borderRadius: radii.lg,
    paddingVertical: 10,
    backgroundColor: `${colors.rust}0d`,
  },
  removeBtnText: {
    fontSize: 12.5,
    fontFamily: fonts.sansSemiBold,
    color: colors.rust,
  },
});
