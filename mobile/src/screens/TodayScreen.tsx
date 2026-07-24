/**
 * TodayScreen — daily food log with v2 measure picker.
 *
 * Self-contained: loads the user profile from SQLite on mount.
 * Shows onboarding prompt if no profile exists yet.
 *
 * Add-food flow:
 *   1. Tap "+ Add" on any meal section → opens modal in Search mode
 *   2. Type to search (online + offline fallback)
 *   3. Tap a result → enters Picker mode
 *   4. Choose measure chip + quantity → live preview → tap Confirm
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { computeKcal, computeMacros, searchFoods, FoodItem, FoodMeasure } from "../api/foods";
import {
  addLogEntry,
  deleteLogEntry,
  getEntriesForDate,
  getProfile,
  getStepsForDate,
  LogEntry,
  Meal,
  Profile,
  setStepsDone,
} from "../db/localStore";
import { makeT, Lang } from "../lib/i18n";
import { C } from "../lib/theme";

// ─── Measure label display ────────────────────────────────────────────────────

const STANDARD = new Set([
  "gram", "ml", "teaspoon", "tablespoon", "cup", "piece", "handful", "ladle", "glass",
]);

function measureDisplay(label: string, t: ReturnType<typeof makeT>): string {
  if (STANDARD.has(label)) return t(`measure_${label}` as any);
  return label; // local portions: "1 louche", "1 boule moyenne", etc.
}

// ─── Today string ─────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  lang?: Lang;
}

export default function TodayScreen({ lang = "fr" }: Props) {
  const t = makeT(lang);
  const today = todayISO();

  // ── Core state ──
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [stepsDone, setStepsDoneState] = useState(false);

  // ── Modal state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [activeMeal, setActiveMeal] = useState<Meal>("lunch");

  // Search phase
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);

  // Picker phase
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [measureIdx, setMeasureIdx] = useState(0);
  const [quantity, setQuantity] = useState("1");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load on mount ──
  useEffect(() => {
    async function load() {
      const [p, e, s] = await Promise.all([
        getProfile(),
        getEntriesForDate(today),
        getStepsForDate(today),
      ]);
      setProfile(p);
      setEntries(e);
      setStepsDoneState(s?.stepsDone ?? false);
      setLoading(false);
    }
    load();
  }, []);

  // ── Debounced search ──
  useEffect(() => {
    if (!modalOpen || picked) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchFoods(query, lang);
      setResults(r);
      setSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, modalOpen, picked, lang]);

  // ── Derived ──
  const totalKcal = entries.reduce((s, e) => s + e.kcal, 0);
  const target = profile?.dailyTarget ?? 0;
  const remaining = target - totalKcal;
  const isOver = remaining < 0;

  const byMeal = MEALS.reduce((acc, m) => {
    acc[m] = entries.filter((e) => e.meal === m);
    return acc;
  }, {} as Record<Meal, LogEntry[]>);

  // ── Measure picker preview ──
  const measure: FoodMeasure | undefined = picked?.measures[measureIdx];
  const qty = parseFloat(quantity) || 0;
  const previewGrams = measure ? Math.round(qty * measure.grams) : 0;
  const previewKcal = picked && measure
    ? computeKcal(qty, measure.grams, picked.kcalPer100)
    : 0;

  // ── Handlers ──
  function openModal(meal: Meal) {
    setActiveMeal(meal);
    setQuery("");
    setResults([]);
    setPicked(null);
    setMeasureIdx(0);
    setQuantity("1");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPicked(null);
    setQuery("");
    setResults([]);
  }

  function selectFood(food: FoodItem) {
    setPicked(food);
    setMeasureIdx(0);
    setQuantity("1");
  }

  async function handleLog() {
    if (!picked || !measure || qty <= 0) return;
    const displayName = lang === "en" ? (picked.nameEn || picked.nameFr) : picked.nameFr;
    await addLogEntry({
      logDate: today,
      meal: activeMeal,
      foodName: displayName,
      measureLabel: measure.label,
      quantity: qty,
      grams: Math.round(qty * measure.grams * 10) / 10,
      kcal: previewKcal,
      proteinG: computeMacros(qty, measure.grams, picked.proteinG ?? 0),
      carbsG:   computeMacros(qty, measure.grams, picked.carbsG ?? 0),
      fatG:     computeMacros(qty, measure.grams, picked.fatG ?? 0),
    });
    const updated = await getEntriesForDate(today);
    setEntries(updated);
    closeModal();
  }

  async function handleDelete(id: string) {
    await deleteLogEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSteps() {
    const next = !stepsDone;
    setStepsDoneState(next);
    await setStepsDone(today, next);
  }

  // ── Render helpers ──
  const renderEntry = useCallback(({ item }: { item: LogEntry }) => (
    <View style={styles.entryRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName}>{item.foodName}</Text>
        <Text style={styles.entryMeta}>
          {item.measureLabel === "gram"
            ? `${item.grams} g`
            : `${item.quantity} ${measureDisplay(item.measureLabel, t)} · ${item.grams} g`}
        </Text>
      </View>
      <Text style={styles.entryKcal}>{item.kcal}</Text>
      <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
        <Text style={styles.deleteTxt}>✕</Text>
      </Pressable>
    </View>
  ), [t]);

  // ── Loading ──
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.accent} />
        <Text style={[styles.muted, { marginTop: 8 }]}>{t("loading")}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* No-profile banner */}
        {!profile && (
          <View style={[styles.card, { borderColor: C.accent }]}>
            <Text style={[styles.muted, { textAlign: "center" }]}>
              {t("no_profile")}
            </Text>
          </View>
        )}

        {/* Budget card */}
        {profile && (
          <View style={styles.card}>
            <View style={styles.budgetRow}>
              <Stat label={t("eaten")} value={totalKcal} color={C.ink} />
              <Stat label={t("target")} value={target} color={C.muted} />
              <Stat
                label={isOver ? t("over_by") : t("left_to_eat")}
                value={Math.abs(remaining)}
                color={isOver ? C.over : C.good}
              />
            </View>
          </View>
        )}

        {/* Steps */}
        <Pressable
          style={[styles.card, styles.stepsRow, stepsDone && { borderColor: C.good }]}
          onPress={handleSteps}
        >
          <Text style={stepsDone ? styles.stepsOn : styles.stepsMuted}>
            {stepsDone ? `✓ ${t("steps_done")}` : t("steps_prompt")}
          </Text>
        </Pressable>

        {/* Meal sections */}
        {MEALS.map((meal) => (
          <MealSection
            key={meal}
            label={t(meal)}
            entries={byMeal[meal]}
            noEntriesLabel={t("no_entries")}
            addLabel={t("add_to_meal")}
            onAdd={() => openModal(meal)}
            renderEntry={renderEntry}
          />
        ))}
      </ScrollView>

      {/* ── Add food modal ── */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modal}>
          {/* Modal header */}
          <View style={styles.modalHeader}>
            {picked ? (
              <Pressable onPress={() => setPicked(null)} style={styles.backBtn}>
                <Text style={styles.backTxt}>← {t("search_placeholder").split("…")[0].trim()}</Text>
              </Pressable>
            ) : (
              <Text style={styles.modalTitle}>{t("add_food")}</Text>
            )}
            <Pressable onPress={closeModal}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {/* Meal selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mealPills}>
            {MEALS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setActiveMeal(m)}
                style={[styles.mealPill, activeMeal === m && styles.mealPillOn]}
              >
                <Text style={[styles.mealPillTxt, activeMeal === m && styles.mealPillTxtOn]}>
                  {t(m)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* PHASE 1: Search */}
          {!picked && (
            <>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t("search_placeholder")}
                placeholderTextColor={C.muted}
                autoFocus
                clearButtonMode="while-editing"
              />
              {searching && (
                <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} />
              )}
              <FlatList
                data={results}
                keyExtractor={(f) => f.id}
                renderItem={({ item }) => (
                  <Pressable style={styles.resultRow} onPress={() => selectFood(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>{item.name}</Text>
                      {item.nameEn && item.nameFr && item.nameEn !== item.nameFr && (
                        <Text style={styles.resultSub}>
                          {lang === "fr" ? item.nameEn : item.nameFr}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.resultKcal}>
                      {item.kcalPer100}{"\n"}
                      <Text style={styles.resultUnit}>kcal/100g</Text>
                    </Text>
                  </Pressable>
                )}
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
              />
            </>
          )}

          {/* PHASE 2: Picker */}
          {picked && (
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {/* Food header */}
              <View style={[styles.card, { marginTop: 0, marginBottom: 14 }]}>
                <Text style={styles.pickedName}>{picked.name}</Text>
                <Text style={styles.pickedKcal}>
                  {picked.kcalPer100} kcal / 100 g
                </Text>
              </View>

              {/* Measure chips */}
              <Text style={styles.pickerLabel}>{t("choose_measure")}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipScroll}
                contentContainerStyle={styles.chipRow}
              >
                {picked.measures.map((m, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setMeasureIdx(i)}
                    style={[styles.chip, measureIdx === i && styles.chipOn]}
                  >
                    <Text style={[styles.chipTxt, measureIdx === i && styles.chipTxtOn]}>
                      {measureDisplay(m.label, t)}
                    </Text>
                    {m.label !== "gram" && (
                      <Text style={[styles.chipGrams, measureIdx === i && styles.chipGramsOn]}>
                        {m.grams} g
                      </Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>

              {/* Quantity */}
              <Text style={[styles.pickerLabel, { marginTop: 20 }]}>{t("quantity")}</Text>
              <TextInput
                style={styles.qtyInput}
                value={quantity}
                onChangeText={(v) => setQuantity(v.replace(/[^\d.]/g, ""))}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />

              {/* Live preview */}
              {qty > 0 && measure && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewTxt}>
                    {qty} {measureDisplay(measure.label, t)}
                    {" = "}{previewGrams} g{" = "}
                    <Text style={styles.previewKcal}>{previewKcal} kcal</Text>
                  </Text>
                </View>
              )}

              {/* Confirm */}
              <Pressable
                style={[styles.cta, (!qty || qty <= 0) && styles.ctaDisabled]}
                onPress={handleLog}
                disabled={!qty || qty <= 0}
              >
                <Text style={styles.ctaTxt}>{t("confirm")}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[styles.statNum, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MealSection({
  label, entries, noEntriesLabel, addLabel, onAdd, renderEntry,
}: {
  label: string;
  entries: LogEntry[];
  noEntriesLabel: string;
  addLabel: string;
  onAdd: () => void;
  renderEntry: ({ item }: { item: LogEntry }) => React.ReactElement;
}) {
  const total = entries.reduce((s, e) => s + e.kcal, 0);
  return (
    <View style={styles.card}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{label}</Text>
        {entries.length > 0 && (
          <Text style={styles.mealTotal}>{total} kcal</Text>
        )}
      </View>
      {entries.length === 0 ? (
        <Text style={styles.muted}>{noEntriesLabel}</Text>
      ) : (
        entries.map((e) => (
          <React.Fragment key={e.id}>
            {renderEntry({ item: e })}
          </React.Fragment>
        ))
      )}
      <Pressable style={styles.addRow} onPress={onAdd}>
        <Text style={styles.addTxt}>+ {addLabel}</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:     { padding: 16, paddingTop: 16, paddingBottom: 40 },
  center:     { flex: 1, justifyContent: "center", alignItems: "center" },

  // Cards
  card: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.line, padding: 16, marginBottom: 12,
  },
  muted: { color: C.muted, fontSize: 13 },

  // Budget
  budgetRow: { flexDirection: "row", justifyContent: "space-between" },
  statNum:   { fontSize: 28, fontFamily: "Georgia", fontWeight: "600" },
  statLabel: { fontSize: 11, color: C.muted, textTransform: "uppercase",
               letterSpacing: 0.8, marginTop: 2 },

  // Steps
  stepsRow:  { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  stepsOn:   { color: C.good, fontWeight: "700", fontSize: 14 },
  stepsMuted:{ color: C.muted, fontSize: 13 },

  // Meal section
  mealHeader: { flexDirection: "row", justifyContent: "space-between",
                alignItems: "center", marginBottom: 10 },
  mealTitle:  { fontSize: 13, fontWeight: "700", color: C.ink,
                textTransform: "uppercase", letterSpacing: 0.8 },
  mealTotal:  { fontSize: 13, color: C.muted, fontFamily: "Georgia" },
  addRow:     { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.line },
  addTxt:     { color: C.accent, fontWeight: "700", fontSize: 13 },

  // Log entries
  entryRow:   { flexDirection: "row", alignItems: "center",
                paddingVertical: 6, gap: 8 },
  entryName:  { fontSize: 14, color: C.ink, fontWeight: "500" },
  entryMeta:  { fontSize: 12, color: C.muted, marginTop: 1 },
  entryKcal:  { fontSize: 14, color: C.muted, fontFamily: "Georgia",
                minWidth: 40, textAlign: "right" },
  deleteBtn:  { padding: 6 },
  deleteTxt:  { color: C.muted, fontSize: 12 },

  // Modal
  modal:       { flex: 1, backgroundColor: C.bg, paddingTop: 16 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between",
                 alignItems: "center", paddingHorizontal: 16, marginBottom: 12 },
  modalTitle:  { fontSize: 17, fontWeight: "700", color: C.ink },
  backBtn:     { flex: 1 },
  backTxt:     { color: C.accent, fontSize: 14 },
  closeTxt:    { color: C.muted, fontSize: 18, padding: 4 },

  // Meal pill selector
  mealPills: { maxHeight: 48, paddingHorizontal: 12, marginBottom: 12 },
  mealPill:  {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
    marginRight: 8, alignItems: "center",
  },
  mealPillOn:    { borderColor: C.accent, backgroundColor: C.accentSoft },
  mealPillTxt:   { color: C.muted, fontWeight: "600", fontSize: 13 },
  mealPillTxtOn: { color: C.accent },

  // Search
  searchInput: {
    marginHorizontal: 16, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, padding: 14, fontSize: 16, color: C.ink,
    backgroundColor: C.card, marginBottom: 8,
  },
  resultRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: C.line,
  },
  resultName: { fontSize: 15, color: C.ink, fontWeight: "500" },
  resultSub:  { fontSize: 12, color: C.muted, marginTop: 2 },
  resultKcal: { fontSize: 14, color: C.muted, fontFamily: "Georgia",
                textAlign: "right", minWidth: 60 },
  resultUnit: { fontSize: 11, color: C.muted },

  // Picker
  pickedName:  { fontSize: 18, fontWeight: "700", color: C.ink },
  pickedKcal:  { fontSize: 13, color: C.muted, marginTop: 4 },
  pickerLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700",
    paddingHorizontal: 16, marginBottom: 10,
  },
  chipScroll:  { maxHeight: 76 },
  chipRow:     { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
    alignItems: "center", minWidth: 64,
  },
  chipOn:      { borderColor: C.accent, backgroundColor: C.accentSoft },
  chipTxt:     { color: C.muted, fontWeight: "600", fontSize: 14 },
  chipTxtOn:   { color: C.accent },
  chipGrams:   { color: C.muted, fontSize: 11, marginTop: 2 },
  chipGramsOn: { color: C.accent },

  qtyInput: {
    marginHorizontal: 16, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, padding: 14, fontSize: 24, color: C.ink,
    backgroundColor: C.card, textAlign: "center", fontFamily: "Georgia",
  },
  previewBox: {
    marginHorizontal: 16, marginTop: 16,
    padding: 14, borderRadius: 12, backgroundColor: C.accentSoft,
    alignItems: "center",
  },
  previewTxt:  { fontSize: 15, color: C.ink },
  previewKcal: { fontWeight: "700", color: C.accent },

  cta: {
    margin: 16, marginTop: 20, backgroundColor: C.accent,
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
  },
  ctaDisabled: { opacity: 0.4 },
  ctaTxt:      { color: "#fff", fontWeight: "700", fontSize: 16 },
});
