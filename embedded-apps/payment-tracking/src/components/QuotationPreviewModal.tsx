import React, { useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import { base64ToBlob } from '../lib/pdfAttachment';
import type { PoAttachment } from '../lib/paymentTrackingApi';

interface Props {
  attachment: PoAttachment;
  onClose: () => void;
}

/** Preview + download for a PO header's quotation (see fetchPoAttachment in
 * paymentTrackingApi.ts — a keyed GetEntity read against ZPOAttachmentSet). Web-only, same posture
 * as every other attachment viewer/downloader in this app (e.g. po-creation.tsx's template
 * download) — this hub build has no native counterpart. PDF gets an inline preview; anything else
 * (images included, to keep this simple and not silently mis-render a non-PDF/image type) just
 * offers Download, since there's no confirmed need yet for an image-specific preview here. */
export function QuotationPreviewModal({ attachment, onClose }: Props) {
  const { filename, mimetype, value } = attachment;
  const isPdf = mimetype.toLowerCase().includes('pdf');

  const blobUrl = useMemo(() => {
    if (Platform.OS !== 'web') return '';
    try {
      return URL.createObjectURL(base64ToBlob(value, mimetype));
    } catch {
      return '';
    }
  }, [value, mimetype]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleDownload = () => {
    if (Platform.OS !== 'web' || !blobUrl || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.flex1}>
              <Text style={styles.title} numberOfLines={1}>{filename}</Text>
              <Text style={styles.subtitle}>Quotation attachment</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                style={[styles.downloadBtn, !blobUrl && styles.downloadBtnDisabled]}
                onPress={handleDownload}
                disabled={!blobUrl}
                accessibilityRole="button"
                accessibilityLabel="Download"
              >
                <Ionicons name="download-outline" size={14} color={colors.white} />
                <Text style={styles.downloadBtnText}>Download</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
          </View>

          <View style={styles.previewArea}>
            {blobUrl && isPdf ? (
              // eslint-disable-next-line react/no-unknown-property
              <iframe src={blobUrl} title={filename} style={{ width: '100%', height: '100%', border: 'none' }} />
            ) : (
              <View style={styles.noPreview}>
                <Ionicons name="document-outline" size={30} color={colors.inkSoft} />
                <Text style={styles.noPreviewText}>
                  {blobUrl ? "Preview isn't available for this file type — use Download to open it." : 'Could not prepare a preview for this file.'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(31,27,51,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 820,
    height: '85%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 2,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.rust,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  downloadBtnDisabled: {
    opacity: 0.5,
  },
  downloadBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  previewArea: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.appBg,
    overflow: 'hidden',
  },
  noPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  noPreviewText: {
    fontSize: 12.5,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
