import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import * as Icons from "phosphor-react-native";
import GradientButton from "@/components/ui/GradientButton";
import { gradients, font } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/config";
import { getHubEmail } from "@/lib/hubEmailLogin";

/**
 * Replaces the old (auth)/welcome + (auth)/login screens entirely. There's no credential entry
 * here anymore — this app is only ever reached from the Emami Apps hub (already-authenticated
 * user), so this screen just resolves that person's MoldHealthCheck role automatically and drops
 * them straight into the tabs.
 *
 * SAP's ZmoldRole entity returns one of three role names — Approver, Reviewer, User — which map
 * onto the two role strings every screen in this app already checks for (Dashboard.tsx,
 * statistics.tsx, CustomTabs.tsx, ReportDetailsModal.tsx all check user.Role === "Admin"/"User"
 * exactly): Approver and Reviewer both mean Admin, User means User. Nothing downstream of this
 * screen changes — only how Role gets set does.
 */
function mapSapRole(sapRole: unknown): "Admin" | "User" {
  return sapRole === "Approver" || sapRole === "Reviewer" ? "Admin" : "User";
}

export default function MouldEntryGate() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const resolveRole = useCallback(async () => {
    setChecking(true);
    setError(null);

    const email = getHubEmail();
    if (!email) {
      setError("Could not find your Emami Apps sign-in. Please open MoldHealthCheck from the Emami Apps home page.");
      setChecking(false);
      return;
    }

    try {
      // TODO(SAP): assumed to follow the exact same call shape as the entity ZmoldRole replaces
      // (ZmouldLoginSet — same service, same Email key predicate) and to return the same vendor
      // fields (vendorCode/vendorName/matnr/Vendor) alongside Role, since those still feed
      // SparePart/PreventiveMaint/InpSum/InspectionChecklist/profile/Dashboard's header
      // elsewhere in this app. ZmoldRole was only described in terms of its Role values — if
      // those screens show blank vendor info after this ships, this response shape is why.
      const { data } = await api.get(`/ZMM_MOULD_CARE_SRV/ZmoldRole(Email='${email.trim()}')`, {
        params: { $format: "json" },
      });
      const record = data?.d?.results ? data.d.results[0] : data?.d;
      if (!record) {
        setError("Your account isn't set up for MoldHealthCheck yet. Contact your admin.");
        setChecking(false);
        return;
      }

      const role = mapSapRole(record.Role ?? record.role);
      setUser({ ...record, Email: email, email, Role: role });
      router.replace("/apps/mouldhealthcheck/(tabs)");
    } catch (e: any) {
      setError(e?.message || "Could not verify your MoldHealthCheck access. Please try again.");
      setChecking(false);
    }
  }, [router, setUser]);

  useEffect(() => {
    resolveRole();
  }, [resolveRole]);

  return (
    <LinearGradient colors={gradients.aurora} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <StatusBar style="light" />
      {checking ? (
        <>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.title}>Checking your access…</Text>
        </>
      ) : (
        <View style={styles.errorCard}>
          <Icons.WarningCircle size={40} color="#fff" weight="fill" />
          <Text style={styles.title}>{error}</Text>
          <GradientButton title="Try Again" onPress={resolveRole} variant="ink" />
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  errorCard: { alignItems: "center", gap: 16, maxWidth: 360 },
  title: { color: "#fff", fontSize: font.body, fontWeight: font.semibold, textAlign: "center" },
});
