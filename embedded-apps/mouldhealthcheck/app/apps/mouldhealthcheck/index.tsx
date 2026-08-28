import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Icons from "phosphor-react-native";
import GradientButton from "@/components/ui/GradientButton";
import { colors, font } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/config";
import { getHubEmail } from "@/lib/hubEmailLogin";

/**
 * Replaces the old (auth)/welcome + (auth)/login screens entirely. There's no credential entry
 * here anymore — this app is only ever reached from the Emami Apps hub (already-authenticated
 * user), so this screen just resolves that person's MoldHealthCheck role automatically and drops
 * them straight into the tabs.
 *
 * SAP's ZmoldRoleSet entity returns a numeric code — "01" Reviewer, "02" Approver, "03"
 * User/Vendor — which maps onto the two role strings every screen in this app already checks for
 * (Dashboard.tsx, statistics.tsx, CustomTabs.tsx, ReportDetailsModal.tsx all check
 * user.Role === "Admin"/"User" exactly): 01 and 02 both mean Admin, 03 means User. Nothing
 * downstream of this screen changes — only how Role gets set does.
 */
function mapSapRole(sapRole: unknown): "Admin" | "User" {
  const code = String(sapRole ?? "").trim();
  return code === "01" || code === "02" ? "Admin" : "User";
}

/**
 * ZmoldRole was only described in terms of its Role values, not vendor details — but
 * SparePart/PreventiveMaint/InpSum/InspectionChecklist all fall back to user?.matnr /
 * user?.vendorCode / user?.Vendor when a screen is opened without explicit navigation params.
 * Dashboard.tsx already knows how to derive that data from just an email (ZMouldDetailsSet
 * filtered by SmtpAddr) — reusing that exact same call here means every screen's user object has
 * real vendor info from the moment of entry, not only once Dashboard happens to have loaded.
 * Best-effort: an Admin/Approver reviewing other people's submissions may have no material record
 * of their own here at all, and that's fine — it only feeds fallbacks, not the role gate itself.
 */
async function fetchVendorDetails(email: string) {
  try {
    const { data } = await api.get("/ZMM_MOULD_CARE_SRV/ZMouldDetailsSet", {
      params: { "$filter": `SmtpAddr eq '${email}'`, "$format": "json" },
    });
    const record = data?.d?.results?.[0];
    if (!record) return {};
    return {
      vendorCode: record.Lifnr,
      vendorName: record.Name1,
      matnr: record.Matnr,
      Vendor: record.Lifnr,
    };
  } catch {
    return {};
  }
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
      // Verified live against SAP: entity set name is ZmoldRoleSet (not ZmoldRole), key is Email
      // alone. Vendor fields (vendorCode/vendorName/matnr/Vendor) aren't part of this entity's
      // response, which is why fetchVendorDetails() below derives them separately.
      const { data } = await api.get(`/ZMM_MOULD_CARE_SRV/ZmoldRoleSet(Email='${email.trim()}')`, {
        params: { $format: "json" },
      });
      const record = data?.d?.results ? data.d.results[0] : data?.d;
      if (!record) {
        setError("Your account isn't set up for MoldHealthCheck yet. Contact your admin.");
        setChecking(false);
        return;
      }

      const role = mapSapRole(record.Role ?? record.role);
      const vendorDetails = await fetchVendorDetails(email.trim());
      setUser({ ...vendorDetails, ...record, Email: email, email, Role: role });
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
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Image source={require("../../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
      {checking ? (
        <>
          <ActivityIndicator size="large" color={colors.brand} style={styles.spinner} />
          <Text style={styles.title}>Checking your access…</Text>
        </>
      ) : (
        <View style={styles.errorCard}>
          <Icons.WarningCircle size={36} color={colors.brand} weight="fill" />
          <Text style={styles.title}>{error}</Text>
          <GradientButton title="Try Again" onPress={resolveRole} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8, backgroundColor: colors.bg },
  logo: { width: 96, height: 96, marginBottom: 8, borderRadius: 22 },
  spinner: { marginTop: 8 },
  errorCard: { alignItems: "center", gap: 16, maxWidth: 360, marginTop: 8 },
  title: { color: colors.textDark, fontSize: font.body, fontWeight: font.semibold, textAlign: "center" },
});
