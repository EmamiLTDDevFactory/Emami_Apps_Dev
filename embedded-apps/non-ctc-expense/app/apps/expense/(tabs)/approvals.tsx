import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../../../../src/context/AuthContext';
import { useClaim } from '../../../../src/context/ClaimContext';
import { ExpenseClaim } from '../../../../src/types';
import { formatCurrency } from '../../../../src/utils/currency';

export default function ApprovalsScreen() {
  const router = useRouter();
  const { filterClaims, approveClaim, rejectClaim, requestClarification, releasePayment, rejectClaimFinance, fetchClaims, fetchHistorySet, historyEntries, claimSummaryCache, fetchClaimSummaries } = useClaim();
  const { currentUser } = useAuth();
  // Desktop-only layout switch, same breakpoint/pattern as the Dashboard's recent-claims grid.
  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 900;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([]);

  // Reject Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState('');
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  // Success Modal State
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Clarification Modal State
  const [clarifyModalVisible, setClarifyModalVisible] = useState(false);
  const [clarificationRemarks, setClarificationRemarks] = useState('');

  // Stat card selection — drives the history list view
  const [selectedStat, setSelectedStat] = useState<string | null>(null);

  // Helper: parse SAP /Date(...) timestamp
  const formatHistoryDate = (value?: string) => {
    if (!value) return '';
    let d = new Date(value);
    const m = value.match(/(\d+)/);
    if (m && value.includes('/Date(')) d = new Date(parseInt(m[1], 10));
    if (Number.isNaN(d.getTime())) return value;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const normalizeId = (id?: string) => (id || '').toString().replace(/\D/g, '').padStart(8, '0');
  const managerNumeric = normalizeId(currentUser?.employeeId);
  const managerName = (currentUser?.employeeName || '').toLowerCase();
  const managerHistoryEntries = historyEntries || [];

  const isBulkReleaseUser = currentUser?.role === 'B';

  // Filter for Manager view (shows Submitted claims) or B bulk-release view
  const pendingClaims = isBulkReleaseUser ? filterClaims('finance', searchQuery) : filterClaims('manager', searchQuery);
  const isBPendingRelease = (claim: ExpenseClaim) => isBulkReleaseUser && claim.rawStatus === 'P';
  const bulkReleaseClaims = isBulkReleaseUser
    ? pendingClaims.filter(claim => claim.status === 'Pending Release' || isBPendingRelease(claim))
    : [];
  const allBulkSelected = bulkReleaseClaims.length > 0 && bulkReleaseClaims.every(claim => selectedClaimIds.includes(claim.id));

  useEffect(() => {
    setSelectedClaimIds(prev => prev.filter(id => bulkReleaseClaims.some(claim => claim.id === id)));
  }, [bulkReleaseClaims.map(claim => claim.id).join('|')]);

  const toggleClaimSelection = (id: string) => {
    setSelectedClaimIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const toggleSelectAllBulkClaims = () => {
    setSelectedClaimIds(prev => (
      allBulkSelected ? [] : bulkReleaseClaims.map(claim => claim.id)
    ));
  };

  const confirmBulkRelease = async () => {
    if (selectedClaimIds.length === 0) {
      Alert.alert('No claims selected', 'Please select at least one claim to release.');
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    const failedIds: string[] = [];

    for (const claimId of selectedClaimIds) {
      const result = await releasePayment(claimId);
      if (result.success) {
        successCount += 1;
      } else {
        failureCount += 1;
        failedIds.push(claimId);
      }
    }

    setSelectedClaimIds(failedIds);

    await refreshHistoryStats();
    await fetchClaims();

    if (failureCount > 0) {
      Alert.alert(
        'Bulk Release Partial',
        `${successCount} claim(s) released. ${failureCount} claim(s) could not be released.`
      );
      return;
    }

    Alert.alert('Bulk Release Complete', `${successCount} claim(s) were released successfully.`);
  };

  const handleBulkRelease = () => {
    if (selectedClaimIds.length === 0) {
      Alert.alert('No claims selected', 'Please select at least one claim to release.');
      return;
    }
    Alert.alert(
      'Confirm Bulk Release',
      `Release ${selectedClaimIds.length} selected claim(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Release', onPress: confirmBulkRelease }
      ]
    );
  };

  const managerApprovedCount = managerHistoryEntries.filter(entry => (entry.Action || '').toString().toUpperCase() === 'APPROVE').length;
  const managerRejectedCount = managerHistoryEntries.filter(entry => (entry.Action || '').toString().toUpperCase() === 'REJECT').length;
  const managerTotalCount = managerHistoryEntries.length;
  const managerPendingCount = pendingClaims.length;

  const managerStats = [
    { label: 'Approved', value: managerApprovedCount, icon: 'checkmark-circle-outline', accent: '#059669', iconColor: '#047857' },
    { label: 'Pending', value: managerPendingCount, icon: 'time-outline', accent: '#D97706', iconColor: '#B45309' },
    { label: 'Rejected', value: managerRejectedCount, icon: 'close-circle-outline', accent: '#DC2626', iconColor: '#B91C1C' },
    { label: 'Total', value: managerTotalCount, icon: 'people-outline', accent: '#005A9E', iconColor: '#1D4ED8' },
  ];

  // History items filtered by selected stat card
  const statFilteredHistoryItems =
    selectedStat === 'Approved'
      ? managerHistoryEntries.filter(e => (e.Action || '').toUpperCase() === 'APPROVE')
      : selectedStat === 'Rejected'
        ? managerHistoryEntries.filter(e => (e.Action || '').toUpperCase() === 'REJECT')
        : selectedStat === 'Total'
          ? [...managerHistoryEntries]
          : [];

  // HistorySet entries don't carry expense type/amount/employee name — fetch+cache each unique
  // claim's own ClaimHeaderSet record (same call the claim detail page uses) so the cards below
  // can show them, and so search has real expense-type/employee-name text to match against.
  const statFilteredHistoryClaimIds = statFilteredHistoryItems.map((e: any) => e.ClaimId).filter(Boolean).join('|');
  useEffect(() => {
    const ids = statFilteredHistoryClaimIds ? statFilteredHistoryClaimIds.split('|') : [];
    if (ids.length > 0) fetchClaimSummaries(ids);
  }, [statFilteredHistoryClaimIds, fetchClaimSummaries]);

  const isSearching = searchQuery.trim() !== '';
  const searchMatchedHistoryItems = isSearching
    ? statFilteredHistoryItems.filter((entry: any) => {
        const q = searchQuery.trim().toLowerCase();
        const summary = claimSummaryCache[entry.ClaimId];
        return (
          (entry.ClaimId || '').toLowerCase().includes(q) ||
          (summary?.employeeName || '').toLowerCase().includes(q) ||
          (summary?.expenseType || '').toLowerCase().includes(q)
        );
      })
    : statFilteredHistoryItems;

  const getEntryYear = (value?: string) => {
    if (!value) return '';
    let d = new Date(value);
    const m = value.match(/(\d+)/);
    if (m && value.includes('/Date(')) d = new Date(parseInt(m[1], 10));
    if (Number.isNaN(d.getTime())) return '';
    return String(d.getFullYear());
  };

  // Years present among the current search matches — most recent first. Only relevant while
  // searching; browsing without a search term keeps showing everything, same as before this
  // feature existed.
  const availableHistoryYears = Array.from(
    new Set(searchMatchedHistoryItems.map((e: any) => getEntryYear(e.ActionDate)).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  // null = no year filter active (used whenever search is empty); 'ALL' = user explicitly chose
  // "All Years" while searching; otherwise a specific year string like '2026'.
  const [selectedHistoryYear, setSelectedHistoryYear] = useState<string | null>(null);
  const availableHistoryYearsKey = availableHistoryYears.join('|');
  useEffect(() => {
    if (!isSearching) {
      setSelectedHistoryYear(null);
      return;
    }
    // Default to the most recent year the moment a search starts, or if the previously-selected
    // year no longer has any matches (e.g. the search text changed) — never auto-override an
    // explicit "All Years" choice or a still-valid specific year pick.
    setSelectedHistoryYear(prev => {
      if (prev === 'ALL') return prev;
      if (prev && availableHistoryYears.includes(prev)) return prev;
      return availableHistoryYears[0] || 'ALL';
    });
  }, [isSearching, availableHistoryYearsKey]);

  const filteredHistoryItems = !isSearching || !selectedHistoryYear || selectedHistoryYear === 'ALL'
    ? searchMatchedHistoryItems
    : searchMatchedHistoryItems.filter((e: any) => getEntryYear(e.ActionDate) === selectedHistoryYear);

  // When Approved/Rejected/Total selected → show history list. Pending → show pending claims.
  const showHistoryList = selectedStat !== null && selectedStat !== 'Pending';

  useFocusEffect(
    useCallback(() => {
      fetchHistorySet();
    }, [fetchHistorySet, currentUser?.employeeId])
  );

  const refreshHistoryStats = async () => {
    await fetchHistorySet();
  };

  const handleApprove = async (id: string) => {
    if (isBulkReleaseUser) {
      const result = await releasePayment(id);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to release payment.');
      } else {
        await refreshHistoryStats();
        await fetchClaims();
        setSuccessMessage(`Claim ${id} has been released successfully.`);
        setSuccessModalVisible(true);
      }
      return;
    }

    approveClaim(id);
    await refreshHistoryStats();
    await fetchClaims();
    setSuccessMessage(`Claim ${id} has been approved successfully.`);
    setSuccessModalVisible(true);
  };

  const handleOpenRejectModal = (id: string) => {
    setSelectedClaimId(id);
    setRejectionRemarks('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = async () => {
    // BR-010: Mandatory rejection remarks
    const result = isBulkReleaseUser
      ? await rejectClaimFinance(selectedClaimId, rejectionRemarks)
      : await rejectClaim(selectedClaimId, rejectionRemarks);

    if (!result.success) {
      Alert.alert('Validation Error', result.error || 'Rejection remarks are mandatory.');
      return;
    }
    await refreshHistoryStats();
    await fetchClaims();
    setRejectModalVisible(false);
    setSuccessMessage(`Claim ${selectedClaimId} has been rejected. Remarks saved to audit log.`);
    setSuccessModalVisible(true);
  };

  const handleOpenClarifyModal = (id: string) => {
    setSelectedClaimId(id);
    setClarificationRemarks('');
    setClarifyModalVisible(true);
  };

  const handleConfirmClarify = () => {
    requestClarification(selectedClaimId, clarificationRemarks);
    setClarifyModalVisible(false);
    Alert.alert('Clarification Requested', `A clarification request has been sent to the employee for claim ${selectedClaimId}.`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.topSectionInner}>
        <Text style={styles.pageTitle}>{isBulkReleaseUser ? 'Finance Approvals' : 'Manager Approvals'}</Text>
        {/* <Text style={styles.pageSubtitle}>Review and process pending employee claims (Amount ≥ ₹100)</Text> */}

        {isBulkReleaseUser && bulkReleaseClaims.length > 0 ? (
          <View style={styles.bulkActionBar}>
            <TouchableOpacity style={styles.bulkSelectBtn} onPress={toggleSelectAllBulkClaims}>
              <Ionicons
                name={(allBulkSelected ? 'checkbox-outline' : 'square-outline') as keyof typeof Ionicons.glyphMap}
                size={18}
                color="#005A9E"
              />
              <Text style={styles.bulkSelectBtnText}>
                {allBulkSelected ? 'Clear Selection' : `Select All (${bulkReleaseClaims.length})`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkReleaseBtn} onPress={handleBulkRelease}>
              <Ionicons name="cash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.bulkReleaseBtnText}>Release Selected</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Stat Cards — tap to view filtered history */}
        <View style={styles.statsRow}>
          {managerStats.map(stat => (
            <TouchableOpacity
              key={stat.label}
              activeOpacity={0.6}
              style={[
                styles.statCard,
                { borderBottomColor: stat.accent },
                selectedStat === stat.label ? {
                  backgroundColor: stat.label === 'Approved' ? '#ECFDF5' : stat.label === 'Pending' ? '#FFFBEB' : stat.label === 'Rejected' ? '#FEF2F2' : '#EFF6FF',
                  borderColor: stat.accent,
                  borderWidth: 2,
                  borderBottomWidth: 3,
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  elevation: 6,
                } : {
                  shadowOpacity: 0.05,
                  shadowRadius: 3,
                  elevation: 2,
                }
              ]}
              onPress={() => setSelectedStat(selectedStat === stat.label ? null : stat.label)}
            >
              <View style={styles.statIconRow}>
                <Ionicons name={stat.icon as any} size={18} color={stat.iconColor} />
              </View>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Ionicons
                name={selectedStat === stat.label ? "chevron-up" : "chevron-down"}
                size={14}
                color={selectedStat === stat.label ? stat.accent : '#475569'}
                style={{ marginTop: 2 }}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by Employee Name or Expense Type..."
            placeholderTextColor="#94A3B8"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
        </View>
      </View>

      {/* Main List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>

        {/* Header when a stat is selected */}
        {selectedStat && (
          <View style={styles.selectedStatHeader}>
            <Text style={styles.selectedStatTitle}>
              {selectedStat === 'Pending' ? 'Pending Claims' : `${selectedStat} Claims`}
            </Text>
            <TouchableOpacity onPress={() => setSelectedStat(null)} style={styles.clearStatBtn}>
              <Ionicons name="close-circle" size={16} color="#64748B" />
              <Text style={styles.clearStatText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Year pills — only appear while actively searching the history view, so browsing
            without a search term looks exactly like it always has. */}
        {showHistoryList && isSearching && availableHistoryYears.length > 0 && (
          <View style={styles.yearPillRow}>
            <TouchableOpacity
              style={[styles.yearPill, selectedHistoryYear === 'ALL' && styles.yearPillActive]}
              onPress={() => setSelectedHistoryYear('ALL')}
            >
              <Text style={[styles.yearPillText, selectedHistoryYear === 'ALL' && styles.yearPillTextActive]}>
                All Years
              </Text>
            </TouchableOpacity>
            {availableHistoryYears.map(year => (
              <TouchableOpacity
                key={year}
                style={[styles.yearPill, selectedHistoryYear === year && styles.yearPillActive]}
                onPress={() => setSelectedHistoryYear(year)}
              >
                <Text style={[styles.yearPillText, selectedHistoryYear === year && styles.yearPillTextActive]}>
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showHistoryList ? (
          /* History view — Approved / Rejected / Total */
          filteredHistoryItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Records</Text>
              <Text style={styles.emptySub}>No {selectedStat?.toLowerCase()} claims found in your history.</Text>
            </View>
          ) : (
            <View style={[styles.historyGrid, isWideScreen && styles.historyGridWide]}>
              {filteredHistoryItems.map((entry: any, idx: number) => {
                const isApprove = (entry.Action || '').toUpperCase() === 'APPROVE';
                // HistorySet only has the approver's own action trail (ActionBy/ActionByName is
                // always the logged-in manager, since fetchHistorySet filters by their own SAP
                // id) — the submitter's name/amount/expense type come from claimSummaryCache
                // (fetched per-claim above), not `claims`, which drops a claim once it moves past
                // this manager (ClaimHeaderSet's LoginId clears at that point).
                const matchedClaim = claimSummaryCache[entry.ClaimId];
                const expenseType = (matchedClaim?.expenseType || '').trim();
                return (
                  <TouchableOpacity
                    key={`${entry.ClaimId}-${idx}`}
                    style={[
                      styles.historyClaimCard,
                      isWideScreen && styles.historyClaimCardWide,
                      {
                        borderLeftWidth: 5,
                        borderLeftColor: isApprove ? '#059669' : '#DC2626',
                        backgroundColor: isApprove ? '#D1FAE5' : '#FEE2E2',
                      }
                    ]}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/apps/expense/claim/${entry.ClaimId}`)}
                  >
                    <View style={styles.historyTopRow}>
                      <Text style={styles.historyClaimId}>{entry.ClaimId}</Text>
                      {expenseType ? <Text style={styles.historyTypeBadge} numberOfLines={1}>{expenseType}</Text> : null}
                    </View>
                    {matchedClaim?.employeeName ? (
                      <Text style={styles.historyClaimActor} numberOfLines={1}>By: {matchedClaim.employeeName}</Text>
                    ) : null}
                    <Text style={styles.historyClaimDate}>{formatHistoryDate(entry.ActionDate)}</Text>

                    <View style={styles.historyBottomRow}>
                      <Text style={styles.historyAmount}>
                        {matchedClaim ? `₹${formatCurrency(matchedClaim.amount)}` : ''}
                      </Text>
                      <View style={[
                        styles.historyActionBadge,
                        { backgroundColor: isApprove ? '#D1FAE5' : '#FEE2E2' },
                      ]}>
                        <Text style={[
                          styles.historyActionText,
                          { color: isApprove ? '#065F46' : '#B91C1C' },
                        ]}>
                          {isApprove ? 'Approved' : 'Rejected'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.historyViewRow}>
                      <Text style={styles.historyClaimViewText}>View Full Details</Text>
                      <Ionicons name="chevron-forward" size={14} color="#005A9E" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )
        ) : (
          /* Default: Pending claims awaiting approval */
          pendingClaims.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={54} color="#10B981" />
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptySub}>There are no pending expense claims requiring your approval at this time.</Text>
            </View>
          ) : (
            pendingClaims.map(claim => (
              <View key={claim.id} style={styles.claimCard}>
                {isBulkReleaseUser ? (
                  <TouchableOpacity
                    style={styles.bulkSelectCol}
                    onPress={() => toggleClaimSelection(claim.id)}
                  >
                    <Ionicons
                      name={(selectedClaimIds.includes(claim.id) ? 'checkbox-outline' : 'square-outline') as keyof typeof Ionicons.glyphMap}
                      size={22}
                      color="#005A9E"
                    />
                  </TouchableOpacity>
                ) : null}
                <View style={isBulkReleaseUser ? styles.cardRightContent : undefined}>
                  <TouchableOpacity
                    style={styles.cardMainContent}
                    onPress={() => router.push(`/apps/expense/claim/${claim.id}`)}
                  >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.claimId}>{claim.id}</Text>
                      <Text style={styles.employeeName}>{claim.employeeName} ({claim.designation})</Text>
                    </View>
                    <Text style={styles.amount}>₹{formatCurrency(claim.amount)}</Text>
                  </View>

                  <View style={styles.justificationBox}>
                    <Text style={styles.expenseType}>{claim.expenseType}</Text>
                    <Text style={styles.justification} numberOfLines={2}>{claim.justification}</Text>
                  </View>

                  <View style={styles.cardMetaRow}>
                    <Text style={styles.metaText}>Cost Center: {claim.costCenter}</Text>
                    <Text style={styles.metaText}>Date: {claim.claimDate}</Text>
                  </View>

                  {claim.attachments.length > 0 && (
                    <View style={styles.attachmentViewRow}>
                      <Ionicons name="document-text" size={16} color="#005A9E" />
                      <Text style={styles.attachmentViewText}>View Attached Receipt: {claim.attachments[0].name}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Action Buttons */}
                <View style={styles.actionsFooter}>
                  <TouchableOpacity style={styles.actionBtnReject} onPress={() => handleOpenRejectModal(claim.id)}>
                    <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                    <Text style={styles.actionBtnRejectText}>Reject</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionBtnApprove} onPress={() => handleApprove(claim.id)}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.actionBtnApproveText}>{isBulkReleaseUser ? 'Release' : 'Approve'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            ))
          )
        )}
      </ScrollView>

      {/* Reject Modal (BR-010) */}
      <Modal visible={rejectModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Reject Claim {selectedClaimId}</Text>
            <Text style={styles.modalSub}>
              Please provide a mandatory reason for rejecting this expense claim. This will be permanently recorded in the workflow audit log.
            </Text>

            <TextInput
              style={[styles.textInputArea]}
              value={rejectionRemarks}
              onChangeText={setRejectionRemarks}
              placeholder="Enter mandatory rejection remarks..."
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalActionButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setRejectModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirmReject} onPress={handleConfirmReject}>
                <Text style={styles.modalBtnConfirmRejectText}>Confirm Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successModalBox}>
            <View style={styles.successModalIcon}>
              <Ionicons name="checkmark-circle" size={60} color="#10B981" />
            </View>
            <Text style={styles.modalTitle}>{successMessage.includes('rejected') ? 'Action Completed' : 'Success'}</Text>
            <Text style={styles.modalSub}>{successMessage}</Text>

            <TouchableOpacity
              style={styles.successModalOkBtn}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={styles.successModalOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Clarification Modal */}
      <Modal visible={clarifyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Request Clarification</Text>
            <Text style={styles.modalSub}>
              Send a message to the employee requesting additional documentation or explanation for claim {selectedClaimId}.
            </Text>

            <TextInput
              style={[styles.textInputArea]}
              value={clarificationRemarks}
              onChangeText={setClarificationRemarks}
              placeholder="What details or documents do you need?"
              multiline
              numberOfLines={4}
            />

            <View style={styles.modalActionButtons}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setClarifyModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirmClarify} onPress={handleConfirmClarify}>
                <Text style={styles.modalBtnConfirmClarifyText}>Send Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topSection: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomWidth: 3,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  statIconRow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    backgroundColor: '#F1F5F9',
  },
  statLabel: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '700',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  clearBtn: {
    padding: 4,
  },
  listContainer: {
    flex: 1,
  },
  // Caps the header contents without capping the white bar itself, so the bar still spans the
  // full window while its title/stats/search line up with the list below.
  topSectionInner: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
    // Same capped, centred column used across every screen in this app (Dashboard, Create Claim,
    // My Claims, Approvals, Finance, Claim Details) so the content edges line up whichever tab or
    // role you are on. Below 1280 the cap does nothing, so phones and tablets are unaffected.
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  // Selected stat header
  selectedStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  selectedStatTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  clearStatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearStatText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  yearPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  yearPill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  yearPillActive: {
    backgroundColor: '#005A9E',
    borderColor: '#005A9E',
  },
  yearPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  yearPillTextActive: {
    color: '#FFFFFF',
  },
  // History claim cards (for Approved/Rejected/Total view) — a smaller grid than the Dashboard's
  // Recent Claims Activity cards (which sit at 31.5% width / larger padding), same wrapping
  // pattern but sized down further.
  historyGrid: {
    gap: 10,
  },
  historyGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  historyClaimCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  historyClaimCardWide: {
    width: '23%',
    flexGrow: 1,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  historyTypeBadge: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  historyBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  historyViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
  },
  historyClaimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyClaimId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  historyClaimDate: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 2,
    fontWeight: '600',
  },
  historyClaimActor: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '700',
  },
  historyActionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  historyActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyClaimRemarks: {
    fontSize: 13,
    color: '#1E293B',
    marginTop: 10,
    lineHeight: 18,
    fontWeight: '600',
  },
  historyClaimFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 4,
  },
  historyClaimViewText: {
    fontSize: 13,
    color: '#005A9E',
    fontWeight: '600',
  },
  // Existing pending claim styles
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  claimCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardMainContent: {
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  claimId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  employeeName: {
    fontSize: 13,
    color: '#005A9E',
    fontWeight: '600',
  },
  amount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  justificationBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  expenseType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  justification: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  attachmentViewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  attachmentViewText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#005A9E',
    marginLeft: 6,
  },
  actionsFooter: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 8,
    gap: 8,
  },
  actionBtnReject: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionBtnRejectText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 4,
  },
  actionBtnClarify: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionBtnClarifyText: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 4,
  },
  actionBtnApprove: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionBtnApproveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 4,
  },
  bulkActionBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  bulkSelectBtn: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  bulkSelectBtnText: {
    marginLeft: 6,
    color: '#005A9E',
    fontWeight: '700',
    fontSize: 13,
  },
  bulkReleaseBtn: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  bulkReleaseBtnText: {
    marginLeft: 6,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  bulkSelectCol: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  cardRightContent: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  textInputArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#1E293B',
    textAlignVertical: 'top',
    height: 100,
    marginBottom: 20,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtnCancel: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontWeight: '600',
    color: '#475569',
    fontSize: 14,
  },
  modalBtnConfirmReject: {
    flex: 1.5,
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnConfirmRejectText: {
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 14,
  },
  successModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  successModalIcon: {
    marginBottom: 12,
  },
  successModalOkBtn: {
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'center',
    minWidth: 120,
  },
  successModalOkText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  modalBtnConfirmClarify: {
    flex: 1.5,
    backgroundColor: '#D97706',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnConfirmClarifyText: {
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 14,
  },
});
