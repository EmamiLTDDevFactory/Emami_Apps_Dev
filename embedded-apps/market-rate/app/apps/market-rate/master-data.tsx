import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { useMarketRateAuth } from '../../../src/context/MarketRateAuthContext';
import { uploadMasterDataFile } from '../../../src/lib/marketRateApi';

type UploadStatus = { type: 'success' | 'error'; message: string } | null;

/** Reads a browser File as base64 via FileReader's data URL form, stripping the
 * "data:<mime>;base64," prefix — FileUploadSet wants the raw base64 payload (see its note in
 * marketRateApi.ts). Native has no equivalent here since no file-picker package is installed. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

/** Web-only file picker — same raw-DOM-element approach as the date/year inputs elsewhere in this
 * app (no file-picker package is installed for native). */
function FilePicker({ fileName, onPick }: { fileName: string | null; onPick: (file: File) => void }) {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeNotice}>
        <Ionicons name="information-circle-outline" size={16} color={colors.inkSoft} />
        <Text style={styles.nativeNoticeText}>File upload is available on the web app for now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.pickerRow}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          border: `1px dashed ${colors.border}`,
          borderRadius: radii.lg,
          padding: '14px 16px',
          cursor: 'pointer',
          backgroundColor: colors.appBg,
          width: '100%',
          maxWidth: 480,
          boxSizing: 'border-box',
        }}
      >
        <Ionicons name="document-attach-outline" size={18} color={colors.rust} />
        <span style={{ fontSize: 13, color: fileName ? colors.ink : colors.inkSoft, fontWeight: fileName ? 700 : 400 }}>
          {fileName || 'Choose an .xlsx file'}
        </span>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e: any) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
          }}
          style={{ display: 'none' }}
        />
      </label>
    </View>
  );
}

export default function MasterDataScreen() {
  const { role, roleLoading } = useMarketRateAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<UploadStatus>(null);

  if (roleLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={colors.rust} />
      </View>
    );
  }

  // Defense in depth — the nav bar already hides this link from non-Admins, but the route is
  // still reachable by a typed URL.
  if (role !== 'Admin') {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="lock-closed-outline" size={22} color={colors.inkSoft} />
        <Text style={styles.deniedText}>Master Data is only available to Admins.</Text>
      </View>
    );
  }

  const onUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setStatus(null);
    try {
      const base64 = await readFileAsBase64(selectedFile);
      const result = await uploadMasterDataFile({ fileName: selectedFile.name, base64 });
      setStatus({ type: 'success', message: result.message });
      setSelectedFile(null);
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Could not upload this file.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionIconBox}>
          <Ionicons name="cloud-upload-outline" size={14} color={colors.rust} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.sectionTitle}>Master Data Upload</Text>
          <Text style={styles.sectionSubtitle}>Upload a file to update material master data</Text>
        </View>
      </View>

      <View style={styles.card}>
        <FilePicker fileName={selectedFile?.name ?? null} onPick={setSelectedFile} />

        {status && (
          <View style={[styles.statusBanner, status.type === 'success' ? styles.statusSuccess : styles.statusError]}>
            <Ionicons
              name={status.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={status.type === 'success' ? colors.green : colors.red}
            />
            <Text style={[styles.statusText, { color: status.type === 'success' ? colors.green : colors.red }]}>
              {status.message}
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.uploadBtn, (uploading || !selectedFile) && styles.uploadBtnDisabled]}
          onPress={onUpload}
          disabled={uploading || !selectedFile}
          accessibilityRole="button"
          accessibilityLabel="Upload"
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
              <Text style={styles.uploadBtnText}>Upload</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 20,
  },
  flex1: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  deniedText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionIconBox: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: `${colors.rust}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 1,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    padding: 20,
    gap: 16,
    maxWidth: 560,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(31,27,51,0.06)' },
      default: {
        shadowColor: colors.plum,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  pickerRow: {
    alignItems: 'flex-start',
  },
  nativeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nativeNoticeText: {
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.lg,
    padding: 12,
  },
  statusSuccess: {
    backgroundColor: `${colors.green}14`,
  },
  statusError: {
    backgroundColor: `${colors.red}14`,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.lg,
    paddingVertical: 13,
    backgroundColor: colors.rust,
  },
  uploadBtnDisabled: {
    opacity: 0.6,
  },
  uploadBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
});
