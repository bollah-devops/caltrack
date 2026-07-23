/**
 * WeightScreen — weigh-in log with history and delta display.
 *
 * Layout:
 *   1. Stats row — Start / Current / Goal weights
 *   2. Log today's weight — numeric input + button
 *   3. Tip text
 *   4. Past weigh-ins list — date, weight, Δ vs previous
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addWeightLog,
  deleteWeightLog,
  getProfile,
  getWeightLogs,
  Profile,
  WeightLog,
} from "../db/localStore";
import { Lang, makeT } from "../lib/i18n";
import { C } from "../lib/theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, lang: Lang): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
    weekday: "short", day: "numeric", month: "short",
  }).format(date);
}

function deltaStr(current: number, previous: number): string {
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return "—";
  return (diff > 0 ? "+" : "") + diff + " kg";
}

function deltaColor(current: number, previous: number, goal: "lose" | "gain" | string): string {
  const diff = current - previous;
  if (diff === 0) return C.muted;
  // For "lose" goal: going down is good (green), going up is bad (red)
  // For "gain" goal: going up is good, going down is bad
  // For "maintain": small changes neutral, large changes warn
  if (goal === "lose") return diff < 0 ? C.good : C.over;
  if (goal === "gain") return diff > 0 ? C.good : C.over;
  return Math.abs(diff) > 1 ? C.warn : C.muted;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  lang?: Lang;
}

export default function WeightScreen({ lang = "fr" }: Props) {
  const t = makeT(lang);

  const [loading, setLoading]   = useState(true);
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [logs, setLogs]         = useState<WeightLog[]>([]);
  const [input, setInput]       = useState("");
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [p, w] = await Promise.all([getProfile(), getWeightLogs()]);
    setProfile(p);
    setLogs(w);
    setLoading(false);
  }

  async function handleLog() {
    const kg = parseFloat(input);
    if (!kg || kg < 20 || kg > 300) return;
    setSaving(true);
    await addWeightLog(kg);
    const updated = await getWeightLogs();
    setLogs(updated);
    setInput("");
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await deleteWeightLog(id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const currentWeight = logs[0]?.weightKg ?? profile?.weightKg ?? null;
  const startWeight   = profile?.startWeightKg ?? profile?.weightKg ?? null;
  const goalWeight    = profile?.goalWeightKg ?? null;
  const goalStr       = profile?.goal ?? "maintain";

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={styles.list}
      data={logs}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <>
          {/* ── 1. Stats row ── */}
          <View style={styles.statsRow}>
            <StatCard label={t("start_kg")} value={startWeight} />
            <StatCard label={t("now_kg")}   value={currentWeight} accent />
            <StatCard label={t("goal_kg")}  value={goalWeight} />
          </View>

          {/* ── 2. Log input ── */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>{t("weigh_today")}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.weightInput}
                value={input}
                onChangeText={(v) => setInput(v.replace(/[^\d.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder={currentWeight != null ? String(currentWeight) : "78.5"}
                placeholderTextColor={C.muted}
                selectTextOnFocus
              />
              <Pressable
                style={[styles.logBtn, (!input || saving) && styles.logBtnDisabled]}
                onPress={handleLog}
                disabled={!input || saving}
              >
                <Text style={styles.logBtnTxt}>{t("log")}</Text>
              </Pressable>
            </View>
          </View>

          {/* ── 3. Tip ── */}
          <Text style={styles.tip}>{t("weigh_tip")}</Text>

          {/* ── 4. List header ── */}
          {logs.length > 0 && (
            <Text style={styles.histLabel}>{t("progress")}</Text>
          )}
          {logs.length === 0 && (
            <Text style={styles.empty}>{t("no_weigh_ins")}</Text>
          )}
        </>
      }
      renderItem={({ item, index }) => {
        const prev = logs[index + 1];
        const delta = prev ? deltaStr(item.weightKg, prev.weightKg) : null;
        const dColor = prev ? deltaColor(item.weightKg, prev.weightKg, goalStr) : C.muted;
        return (
          <View style={styles.logRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.logDate}>{formatDate(item.logDate, lang)}</Text>
              {delta && (
                <Text style={[styles.logDelta, { color: dColor }]}>{delta}</Text>
              )}
            </View>
            <Text style={styles.logWeight}>{item.weightKg}</Text>
            <Text style={styles.logUnit}> kg</Text>
            <Pressable
              onPress={() => handleDelete(item.id)}
              style={styles.deleteBtn}
              hitSlop={8}
            >
              <Text style={styles.deleteTxt}>✕</Text>
            </Pressable>
          </View>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, accent,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statCard, accent && styles.statCardAccent]}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>
        {value != null ? value : "—"}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list:   { padding: 16, paddingTop: 16, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: "center", alignItems: "center" },

  // Stats row
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    borderColor: C.line, paddingVertical: 14, alignItems: "center",
  },
  statCardAccent: { borderColor: C.accent, backgroundColor: C.accentSoft },
  statValue: { fontSize: 24, fontFamily: "Georgia", color: C.ink },
  statValueAccent: { color: C.accent },
  statLabel: {
    fontSize: 11, color: C.muted, marginTop: 4, textTransform: "uppercase",
    letterSpacing: 0.8, textAlign: "center",
  },

  // Log input
  card: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.line, padding: 16, marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 12,
  },
  inputRow:  { flexDirection: "row", gap: 10, alignItems: "center" },
  weightInput: {
    flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12,
    padding: 14, fontSize: 24, color: C.ink, backgroundColor: "#fff",
    textAlign: "center", fontFamily: "Georgia",
  },
  logBtn: {
    backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  logBtnDisabled: { opacity: 0.4 },
  logBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Tip
  tip: {
    fontSize: 13, color: C.muted, lineHeight: 20,
    marginBottom: 20, paddingHorizontal: 4,
  },

  // History list
  histLabel: {
    fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 8,
  },
  empty: { fontSize: 14, color: C.muted, textAlign: "center", marginTop: 24 },

  logRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1, borderColor: C.line,
  },
  logDate:   { fontSize: 14, color: C.ink, fontWeight: "500" },
  logDelta:  { fontSize: 12, marginTop: 2 },
  logWeight: { fontSize: 22, fontFamily: "Georgia", color: C.ink },
  logUnit:   { fontSize: 13, color: C.muted, alignSelf: "flex-end", marginBottom: 2 },
  deleteBtn: { marginLeft: 8, padding: 4 },
  deleteTxt: { color: C.muted, fontSize: 12 },
  sep:       { height: 8 },
});
