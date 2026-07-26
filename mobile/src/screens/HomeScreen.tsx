/**
 * HomeScreen — daily budget card, quick actions, meal log, progress strip.
 *
 * Layout order:
 *   1. Budget card  (remaining kcal + progress bar + eaten/target)
 *   2. Quick actions (Add food | Weigh in | 10k steps)
 *   3. Meal sections (Breakfast / Lunch / Dinner / Snacks)
 *   4. Progress strip (weight progress + steps streak)
 *
 * The add-food modal (search → measure picker) lives here too.
 */

import React, { Component, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Svg, Path } from "react-native-svg";
import { BarcodeResult, computeKcal, computeMacros, customFoodToItem, FoodItem, FoodMeasure, lookupBarcode, resolveFoodName, searchFoods } from "../api/foods";
import {
  addLogEntry,
  CustomMeal,
  deleteCustomMeal,
  deleteLogEntry,
  getCustomMeals,
  getEntriesForDate,
  getStepsForDate,
  getStepsStreak,
  getWeightLogs,
  LogEntry,
  Meal,
  Profile,
  saveCustomFood,
  setStepsDone,
} from "../db/localStore";
import MealBuilderModal from "./MealBuilderModal";
// Lazy-load the scanner so expo-camera's native module is NOT required at
// startup. If the native module is missing it will only fail when the user
// taps "Scan", not when the app boots.
const BarcodeScannerView = React.lazy(() => import("./BarcodeScannerView"));
import { Lang, makeT } from "../lib/i18n";
import { C } from "../lib/theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STANDARD = new Set([
  "gram", "ml", "teaspoon", "tablespoon", "cup", "piece", "handful", "ladle", "glass",
]);

function measureDisplay(label: string, t: ReturnType<typeof makeT>): string {
  if (STANDARD.has(label)) return t(`measure_${label}` as any);
  return label;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

// ─── Scanner error boundary ───────────────────────────────────────────────────
// Catches native module errors from expo-camera so they don't crash the app.

class ScannerErrorBoundary extends Component<
  { children: React.ReactNode; onClose: () => void },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: C.bg }}>
          <Text style={{ color: C.over, fontSize: 15, fontWeight: "700", marginBottom: 12, textAlign: "center" }}>
            {`Camera unavailable\n`}
          </Text>
          <Text style={{ color: C.ink, fontSize: 12, textAlign: "center", marginBottom: 24 }}>
            {this.state.error}
          </Text>
          <Pressable onPress={this.props.onClose} style={{ backgroundColor: C.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Close</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  lang?: Lang;
  onGoToWeight: () => void;
  profile: Profile | null;
}

export default function HomeScreen({ lang = "fr", onGoToWeight, profile }: Props) {
  const t = makeT(lang);
  const today = todayISO();

  // Core state
  const [loading, setLoading]           = useState(true);
  const [entries, setEntries]           = useState<LogEntry[]>([]);
  const [stepsDone, setStepsDoneState]  = useState(false);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [streak, setStreak]             = useState(0);

  // Modal state
  const [modalOpen, setModalOpen]   = useState(false);
  const [activeMeal, setActiveMeal] = useState<Meal>("lunch");
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<FoodItem[]>([]);
  const [searching, setSearching]   = useState(false);
  const [picked, setPicked]         = useState<FoodItem | null>(null);
  const [measureIdx, setMeasureIdx] = useState(0);
  const [quantity, setQuantity]     = useState("1");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // My meals
  const [modalView, setModalView]             = useState<"foods" | "meals" | "builder" | "scanner" | "manual_product">("foods");
  const [customMeals, setCustomMeals]         = useState<CustomMeal[]>([]);
  const [editingMeal, setEditingMeal]         = useState<CustomMeal | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Pre-seeded items for builder (Save as meal)
  const [preseedItems, setPreseedItems] = useState<import("../db/localStore").NewCustomMealItem[]>([]);

  // Scanner / manual product
  const [scanBarcode, setScanBarcode]   = useState("");
  const [scanOffline, setScanOffline]   = useState(false);
  const [scanLoading, setScanLoading]   = useState(false);
  const [mName, setMName]               = useState("");
  const [mKcal, setMKcal]               = useState("");
  const [mProtein, setMProtein]         = useState("");
  const [mCarbs, setMCarbs]             = useState("");
  const [mFat, setMFat]                 = useState("");

  // ── Load entries/steps/weight on mount ──
  useEffect(() => {
    async function load() {
      const [e, s, wLogs, str] = await Promise.all([
        getEntriesForDate(today),
        getStepsForDate(today),
        getWeightLogs(1),
        getStepsStreak(),
      ]);
      setEntries(e);
      setStepsDoneState(s?.stepsDone ?? false);
      setLatestWeight(wLogs[0]?.weightKg ?? null);
      setStreak(str);
      setLoading(false);
    }
    load();
  }, []);

  // ── Load custom meals when modal opens ──
  useEffect(() => {
    if (modalOpen) getCustomMeals().then(setCustomMeals);
  }, [modalOpen]);

  // ── Debounced food search ──
  useEffect(() => {
    if (!modalOpen || picked) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchFoods(query, lang);
      setResults(r);
      setSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, modalOpen, picked, lang]);

  // ── Derived ──
  const totalKcal  = entries.reduce((s, e) => s + e.kcal, 0);
  const target     = profile?.dailyTarget ?? 0;
  const remaining  = target - totalKcal;
  const isOver     = remaining < 0;
  const fillRatio  = target > 0 ? Math.min(1, totalKcal / target) : 0;
  const macros = {
    proteinG: entries.reduce((s, e) => s + (e.proteinG ?? 0), 0),
    carbsG:   entries.reduce((s, e) => s + (e.carbsG ?? 0), 0),
    fatG:     entries.reduce((s, e) => s + (e.fatG ?? 0), 0),
  };

  const byMeal = MEALS.reduce((acc, m) => {
    acc[m] = entries.filter((e) => e.meal === m);
    return acc;
  }, {} as Record<Meal, LogEntry[]>);

  // ── Picker preview ──
  const measure: FoodMeasure | undefined = picked?.measures[measureIdx];
  const qty          = parseFloat(quantity) || 0;
  const previewGrams = measure ? Math.round(qty * measure.grams) : 0;
  const previewKcal  = picked && measure
    ? computeKcal(qty, measure.grams, picked.kcalPer100)
    : 0;

  // ── Handlers ──
  function openMyMeals() {
    setActiveMeal("lunch");
    setQuery(""); setResults([]); setPicked(null);
    setMeasureIdx(0); setQuantity("1");
    setModalView("meals");
    setDeleteConfirmId(null);
    setScanLoading(false);
    setPreseedItems([]);
    setModalOpen(true);
  }

  function handleSaveAsMeal(meal: Meal) {
    const entries = byMeal[meal];
    if (entries.length === 0) return;
    setPreseedItems(entries.map((e) => ({
      foodId: e.foodId,
      foodName: e.foodName,
      measureLabel: e.measureLabel,
      quantity: e.quantity,
      grams: e.grams,
      kcal: e.kcal,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
    })));
    setEditingMeal(null);
    setActiveMeal(meal);
    setDeleteConfirmId(null);
    setScanLoading(false);
    setModalView("builder");
    setModalOpen(true);
  }

  function openModal(meal: Meal) {
    setActiveMeal(meal);
    setQuery(""); setResults([]); setPicked(null);
    setMeasureIdx(0); setQuantity("1");
    setModalView("foods");
    setDeleteConfirmId(null);
    setScanLoading(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPicked(null); setQuery(""); setResults([]);
  }

  function selectFood(food: FoodItem) {
    setPicked(food); setMeasureIdx(0); setQuantity("1");
  }

  async function handleLog() {
    if (!picked || !measure || qty <= 0) return;
    const displayName = lang === "en" ? (picked.nameEn || picked.nameFr) : picked.nameFr;
    await addLogEntry({
      logDate: today, meal: activeMeal,
      foodId: picked.id,
      foodName: displayName,
      measureLabel: measure.label,
      quantity: qty,
      grams: Math.round(qty * measure.grams * 10) / 10,
      kcal: previewKcal,
      proteinG: computeMacros(qty, measure.grams, picked.proteinG ?? 0),
      carbsG:   computeMacros(qty, measure.grams, picked.carbsG ?? 0),
      fatG:     computeMacros(qty, measure.grams, picked.fatG ?? 0),
    });
    setEntries(await getEntriesForDate(today));
    closeModal();
  }

  async function handleDelete(id: string) {
    await deleteLogEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleLogMeal(meal: CustomMeal) {
    for (const item of meal.items) {
      await addLogEntry({
        logDate: today, meal: activeMeal,
        foodId: item.foodId,
        foodName: item.foodName,
        measureLabel: item.measureLabel,
        quantity: item.quantity,
        grams: item.grams,
        kcal: item.kcal,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      });
    }
    setEntries(await getEntriesForDate(today));
    closeModal();
  }

  async function handleDeleteMeal(id: string) {
    await deleteCustomMeal(id);
    setCustomMeals((prev) => prev.filter((m) => m.id !== id));
    setDeleteConfirmId(null);
  }

  async function handleBarcodeScan(barcode: string) {
    setScanLoading(true);
    const result: BarcodeResult = await lookupBarcode(barcode, lang);
    setScanLoading(false);
    if (result.type === "found") {
      setPicked(result.food);
      setModalView("foods"); // measure picker shows since picked is set
    } else {
      setScanBarcode(barcode);
      setScanOffline(result.type === "offline");
      setMName(""); setMKcal(""); setMProtein(""); setMCarbs(""); setMFat("");
      setModalView("manual_product");
    }
  }

  async function handleSaveManualProduct() {
    const kcal = parseFloat(mKcal);
    if (!mName.trim() || !kcal) return;
    const cf = await saveCustomFood({
      barcode: scanBarcode || null,
      nameFr: mName.trim(),
      kcalPer100: kcal,
      proteinPer100: parseFloat(mProtein) || 0,
      carbsPer100:   parseFloat(mCarbs)   || 0,
      fatPer100:     parseFloat(mFat)     || 0,
      source: "user",
    });
    setPicked(customFoodToItem(cf, lang));
    setModalView("foods"); // measure picker shows
  }

  async function handleSteps() {
    const next = !stepsDone;
    setStepsDoneState(next);
    await setStepsDone(today, next);
    setStreak(await getStepsStreak());
  }

  const renderEntry = useCallback(({ item }: { item: LogEntry }) => (
    <View style={styles.entryRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName}>{resolveFoodName(item.foodId, item.foodName, lang)}</Text>
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
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
        <Text style={[styles.muted, { marginTop: 8 }]}>{t("loading")}</Text>
      </View>
    );
  }

  const currentWeight = latestWeight ?? profile?.weightKg ?? null;
  const showWeightProgress =
    currentWeight != null && profile?.goalWeightKg != null;

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

        {/* ── 1. Budget card ── */}
        {profile && (
          <View style={styles.card}>
            <Text style={styles.budgetLabel}>
              {isOver ? t("over_by") : t("left_to_eat")}
            </Text>
            <Text style={[styles.budgetNum, { color: isOver ? C.over : C.ink }]}>
              {Math.abs(remaining).toLocaleString()}
              <Text style={styles.budgetUnit}> {t("kcal")}</Text>
            </Text>
            {/* Progress bar */}
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(fillRatio * 100)}%` as any,
                    backgroundColor: isOver ? C.over : C.good,
                  },
                ]}
              />
            </View>
            <View style={styles.budgetStats}>
              <Text style={styles.budgetStat}>
                {t("eaten")}
                {"  "}
                <Text style={styles.budgetStatNum}>{totalKcal.toLocaleString()}</Text>
              </Text>
              <Text style={styles.budgetStat}>
                {t("target")}
                {"  "}
                <Text style={styles.budgetStatNum}>{target.toLocaleString()}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* ── 1.5. Macro donut ── */}
        {profile && totalKcal > 0 && (
          <MacroDonut
            proteinG={macros.proteinG}
            carbsG={macros.carbsG}
            fatG={macros.fatG}
            totalKcal={totalKcal}
            proteinTarget={currentWeight ? Math.round(1.6 * currentWeight) : null}
            t={t}
          />
        )}

        {/* ── 2. Quick actions ── */}
        <View style={styles.quickRow}>
          <Pressable
            style={[styles.quickBtn, styles.qFilled]}
            onPress={() => openModal("lunch")}
          >
            <Text style={styles.qFilledTxt}>+ {t("add_food")}</Text>
          </Pressable>
          <Pressable
            style={[styles.quickBtn, styles.qOutline]}
            onPress={onGoToWeight}
          >
            <Text style={styles.qOutlineTxt}>{t("log_weight_short")}</Text>
          </Pressable>
          <Pressable
            style={[styles.quickBtn, styles.qOutline, stepsDone && styles.qDone]}
            onPress={handleSteps}
          >
            <Text style={[styles.qOutlineTxt, stepsDone && styles.qDoneTxt]}>
              {stepsDone ? "✓ " : ""}{t("steps_10k")}
            </Text>
          </Pressable>
        </View>

        {/* My Meals shortcut */}
        <Pressable style={styles.myMealsShortcut} onPress={openMyMeals}>
          <Text style={styles.myMealsShortcutTxt}>🍽  {t("my_meals")} →</Text>
        </Pressable>

        {/* ── 3. Meal sections ── */}
        {MEALS.map((meal) => (
          <MealSection
            key={meal}
            label={t(meal)}
            entries={byMeal[meal]}
            noEntriesLabel={t("no_entries")}
            addLabel={t("add_to_meal")}
            onAdd={() => openModal(meal)}
            onSaveAsMeal={byMeal[meal].length > 0 ? () => handleSaveAsMeal(meal) : undefined}
            saveAsLabel={t("save_as_meal")}
            renderEntry={renderEntry}
          />
        ))}

        {/* ── 4. Progress strip ── */}
        {(showWeightProgress || streak > 0) && (
          <View style={styles.strip}>
            {showWeightProgress && (
              <Text style={styles.stripItem}>
                {currentWeight} → {profile!.goalWeightKg} kg
              </Text>
            )}
            {streak > 0 && (
              <Text style={styles.stripItem}>
                {streak} {t("streak_days")}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Add food modal ── */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modal}>
          {modalView === "scanner" ? (
            <ScannerErrorBoundary onClose={() => setModalView("foods")}>
              <React.Suspense fallback={
                <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                  <ActivityIndicator color={C.accent} />
                </View>
              }>
                <BarcodeScannerView
                  lang={lang}
                  onScanned={handleBarcodeScan}
                  onClose={() => setModalView("foods")}
                />
              </React.Suspense>
            </ScannerErrorBoundary>
          ) : modalView === "builder" ? (
            <MealBuilderModal
              lang={lang}
              initialMeal={editingMeal}
              preseedItems={preseedItems}
              onBack={() => { setPreseedItems([]); setModalView("meals"); }}
              onSaved={async () => {
                setPreseedItems([]);
                setModalView("meals");
                setCustomMeals(await getCustomMeals());
              }}
            />
          ) : (
            <>
              {/* Header */}
              <View style={styles.modalHeader}>
                {(picked || modalView === "manual_product") ? (
                  <Pressable
                    onPress={() => {
                      if (modalView === "manual_product") setModalView("foods");
                      else setPicked(null);
                    }}
                    style={styles.backBtn}
                  >
                    <Text style={styles.backTxt}>
                      ← {modalView === "manual_product"
                        ? t("scan_barcode")
                        : t("search_placeholder").split("…")[0].trim()}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.modalTitle}>{t("add_food")}</Text>
                )}
                <Pressable onPress={closeModal}>
                  <Text style={styles.closeTxt}>✕</Text>
                </Pressable>
              </View>

              {/* Meal selector — hidden during manual product entry */}
              {modalView !== "manual_product" && <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.mealPills}
              >
                {MEALS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setActiveMeal(m)}
                    style={[styles.mealPill, activeMeal === m && styles.mealPillOn]}
                  >
                    <Text
                      style={[
                        styles.mealPillTxt,
                        activeMeal === m && styles.mealPillTxtOn,
                      ]}
                    >
                      {t(m)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>}

              {/* Tab toggle: Foods | My Meals — hidden during manual product entry */}
              {modalView !== "manual_product" &&
              <View style={styles.tabToggle}>
                <Pressable
                  style={[styles.tabToggleBtn, modalView === "foods" && styles.tabToggleBtnOn]}
                  onPress={() => { setModalView("foods"); setPicked(null); }}
                >
                  <Text style={[styles.tabToggleTxt, modalView === "foods" && styles.tabToggleTxtOn]}>
                    {t("foods_tab")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.tabToggleBtn, modalView === "meals" && styles.tabToggleBtnOn]}
                  onPress={() => setModalView("meals")}
                >
                  <Text style={[styles.tabToggleTxt, modalView === "meals" && styles.tabToggleTxtOn]}>
                    {t("my_meals")}
                  </Text>
                </Pressable>
              </View>}

              {/* Foods tab */}
              {modalView === "foods" && (
                <>
                  {/* Phase 1 — Search */}
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
                      {/* Scan button */}
                      <Pressable
                        style={styles.scanBtn}
                        onPress={() => setModalView("scanner")}
                      >
                        <Text style={styles.scanBtnTxt}>
                          {"📷  "}{t("scan_barcode")}
                        </Text>
                      </Pressable>
                      {searching && (
                        <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} />
                      )}
                      <FlatList
                        data={results}
                        keyExtractor={(f) => f.id}
                        keyboardShouldPersistTaps="handled"
                        style={{ flex: 1 }}
                        renderItem={({ item }) => (
                          <Pressable
                            style={styles.resultRow}
                            onPress={() => selectFood(item)}
                          >
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
                      />
                    </>
                  )}

                  {/* Phase 2 — Measure picker */}
                  {picked && (
                    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                      <View style={[styles.card, { marginTop: 0, marginBottom: 14 }]}>
                        <Text style={styles.pickedName}>{picked.name}</Text>
                        <Text style={styles.pickedKcal}>
                          {picked.kcalPer100} kcal / 100 g
                        </Text>
                      </View>

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
                            <Text
                              style={[styles.chipTxt, measureIdx === i && styles.chipTxtOn]}
                            >
                              {measureDisplay(m.label, t)}
                            </Text>
                            {m.label !== "gram" && (
                              <Text
                                style={[
                                  styles.chipGrams,
                                  measureIdx === i && styles.chipGramsOn,
                                ]}
                              >
                                {m.grams} g
                              </Text>
                            )}
                          </Pressable>
                        ))}
                      </ScrollView>

                      <Text style={[styles.pickerLabel, { marginTop: 20 }]}>
                        {t("quantity")}
                      </Text>
                      <TextInput
                        style={styles.qtyInput}
                        value={quantity}
                        onChangeText={(v) => setQuantity(v.replace(/[^\d.]/g, ""))}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />

                      {qty > 0 && measure && (
                        <View style={styles.previewBox}>
                          <Text style={styles.previewTxt}>
                            {qty} {measureDisplay(measure.label, t)}
                            {" = "}{previewGrams} g{" = "}
                            <Text style={styles.previewKcal}>{previewKcal} kcal</Text>
                          </Text>
                        </View>
                      )}

                      <Pressable
                        style={[styles.cta, (!qty || qty <= 0) && styles.ctaDisabled]}
                        onPress={handleLog}
                        disabled={!qty || qty <= 0}
                      >
                        <Text style={styles.ctaTxt}>{t("confirm")}</Text>
                      </Pressable>
                    </ScrollView>
                  )}
                </>
              )}

              {/* My Meals tab */}
              {modalView === "meals" && (
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {customMeals.length === 0 ? (
                    <Text style={[styles.muted, { padding: 24, textAlign: "center" }]}>
                      {t("no_custom_meals")}
                    </Text>
                  ) : (
                    customMeals.map((meal) => (
                      <View key={meal.id} style={styles.mealCardRow}>
                        {deleteConfirmId === meal.id ? (
                          <View style={styles.deleteConfirm}>
                            <Text style={styles.deleteConfirmTxt} numberOfLines={1}>
                              {lang === "fr"
                                ? `Supprimer « ${meal.name} » ?`
                                : `Delete "${meal.name}"?`}
                            </Text>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              <Pressable style={styles.cancelBtn} onPress={() => setDeleteConfirmId(null)}>
                                <Text style={styles.cancelTxt}>
                                  {lang === "fr" ? "Annuler" : "Cancel"}
                                </Text>
                              </Pressable>
                              <Pressable style={styles.confirmDeleteBtn} onPress={() => handleDeleteMeal(meal.id)}>
                                <Text style={styles.confirmDeleteTxt}>{t("delete_meal")}</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <>
                            <Pressable style={styles.mealCardMain} onPress={() => handleLogMeal(meal)}>
                              <Text style={styles.mealCardName}>{meal.name}</Text>
                              <Text style={styles.mealCardMeta}>
                                {meal.items.length}
                                {lang === "fr"
                                  ? ` aliment${meal.items.length > 1 ? "s" : ""}`
                                  : ` item${meal.items.length > 1 ? "s" : ""}`}
                                {"  ·  "}
                                {meal.items.reduce((s, i) => s + i.kcal, 0)} kcal
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => { setEditingMeal(meal); setModalView("builder"); }}
                              style={styles.mealActionBtn}
                            >
                              <Text style={styles.mealActionTxt}>✏</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => setDeleteConfirmId(meal.id)}
                              style={styles.mealActionBtn}
                            >
                              <Text style={[styles.mealActionTxt, { color: C.over }]}>✕</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    ))
                  )}
                  <Pressable
                    style={styles.createMealBtn}
                    onPress={() => { setEditingMeal(null); setModalView("builder"); }}
                  >
                    <Text style={styles.createMealTxt}>+ {t("create_meal")}</Text>
                  </Pressable>
                </ScrollView>
              )}
              {/* Manual product form */}
              {modalView === "manual_product" && (
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.manualScroll}>
                  {scanOffline && (
                    <View style={styles.offlineBanner}>
                      <Text style={styles.offlineTxt}>{t("no_internet_scan")}</Text>
                    </View>
                  )}
                  <Text style={styles.manualTitle}>{t("product_not_found")}</Text>
                  {scanBarcode ? (
                    <Text style={styles.manualBarcode}>{scanBarcode}</Text>
                  ) : null}

                  <Text style={styles.manualLabel}>{t("product_name")}</Text>
                  <TextInput
                    style={styles.manualInput}
                    value={mName}
                    onChangeText={setMName}
                    placeholder={lang === "fr" ? "ex. Biscuits Amina" : "e.g. Amina Biscuits"}
                    placeholderTextColor={C.muted}
                    autoCapitalize="words"
                  />

                  <Text style={styles.manualLabel}>{t("kcal_per_100g")} *</Text>
                  <TextInput
                    style={styles.manualInput}
                    value={mKcal}
                    onChangeText={(v) => setMKcal(v.replace(/[^\d.]/g, ""))}
                    keyboardType="numeric"
                    placeholder="450"
                    placeholderTextColor={C.muted}
                  />

                  <Text style={[styles.manualLabel, { marginTop: 4 }]}>
                    {lang === "fr" ? "Macros (optionnel)" : "Macros (optional)"}
                  </Text>
                  <View style={styles.macroRow3}>
                    <TextInput
                      style={[styles.manualInput, { flex: 1 }]}
                      value={mProtein}
                      onChangeText={(v) => setMProtein(v.replace(/[^\d.]/g, ""))}
                      keyboardType="numeric"
                      placeholder={lang === "fr" ? "Prot. g" : "Prot. g"}
                      placeholderTextColor={C.muted}
                    />
                    <TextInput
                      style={[styles.manualInput, { flex: 1 }]}
                      value={mCarbs}
                      onChangeText={(v) => setMCarbs(v.replace(/[^\d.]/g, ""))}
                      keyboardType="numeric"
                      placeholder={lang === "fr" ? "Gluc. g" : "Carbs g"}
                      placeholderTextColor={C.muted}
                    />
                    <TextInput
                      style={[styles.manualInput, { flex: 1 }]}
                      value={mFat}
                      onChangeText={(v) => setMFat(v.replace(/[^\d.]/g, ""))}
                      keyboardType="numeric"
                      placeholder={lang === "fr" ? "Lip. g" : "Fat g"}
                      placeholderTextColor={C.muted}
                    />
                  </View>

                  <Pressable
                    style={[styles.cta, (!mName.trim() || !mKcal) && styles.ctaDisabled]}
                    onPress={handleSaveManualProduct}
                    disabled={!mName.trim() || !mKcal}
                  >
                    <Text style={styles.ctaTxt}>{t("save_product")}</Text>
                  </Pressable>

                  <Pressable
                    style={styles.scanAgainBtn}
                    onPress={() => setModalView("scanner")}
                  >
                    <Text style={styles.scanAgainTxt}>📷  {t("scan_again")}</Text>
                  </Pressable>
                </ScrollView>
              )}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── donutArc ─────────────────────────────────────────────────────────────────

function donutArc(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startDeg: number, endDeg: number
): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const s = rad(startDeg);
  const e = rad(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const ox1 = cx + outerR * Math.cos(s);
  const oy1 = cy + outerR * Math.sin(s);
  const ox2 = cx + outerR * Math.cos(e);
  const oy2 = cy + outerR * Math.sin(e);
  const ix1 = cx + innerR * Math.cos(e);
  const iy1 = cy + innerR * Math.sin(e);
  const ix2 = cx + innerR * Math.cos(s);
  const iy2 = cy + innerR * Math.sin(s);
  return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${large} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

// ─── MacroDonut ───────────────────────────────────────────────────────────────

function MacroDonut({
  proteinG, carbsG, fatG, totalKcal, proteinTarget, t,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  totalKcal: number;
  proteinTarget: number | null;
  t: ReturnType<typeof makeT>;
}) {
  const SIZE = 100;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = 44;
  const innerR = 28;

  const macroKcal = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (macroKcal === 0) return null;

  const pct = (kcal: number) =>
    totalKcal > 0 ? Math.round((kcal / totalKcal) * 100) : 0;

  const parts = [
    { value: proteinG * 4, color: C.accent },
    { value: carbsG * 4,   color: C.warn },
    { value: fatG * 9,     color: C.fat },
  ].filter((p) => p.value > 0);

  const gapDeg = parts.length > 1 ? 3 : 0;
  const gapTotal = gapDeg * parts.length;

  const segments: { d: string; color: string }[] = [];
  let start = 0;
  for (const p of parts) {
    const deg = (p.value / macroKcal) * (360 - gapTotal);
    if (deg >= 0.5) {
      segments.push({ d: donutArc(cx, cy, outerR, innerR, start, start + deg), color: p.color });
      start += deg + gapDeg;
    }
  }

  const proteinRatio = proteinTarget
    ? Math.min(Math.round(proteinG) / proteinTarget, 1)
    : null;

  return (
    <View style={styles.donutCard}>
      {/* Donut + legend row */}
      <View style={styles.donutRow}>
        <Svg width={SIZE} height={SIZE}>
          {segments.map((seg, i) => (
            <Path key={i} d={seg.d} fill={seg.color} />
          ))}
        </Svg>
        <View style={styles.macroLegend}>
          <Text style={styles.macroTitle}>{t("macros")}</Text>
          <MacroRow color={C.accent} label={t("protein")} value={`${Math.round(proteinG)}g`} pct={pct(proteinG * 4)} />
          <MacroRow color={C.warn}   label={t("carbs")}   value={`${Math.round(carbsG)}g`}  pct={pct(carbsG * 4)} />
          <MacroRow color={C.fat}    label={t("fat")}     value={`${Math.round(fatG)}g`}    pct={pct(fatG * 9)} />
        </View>
      </View>

      {/* Protein target */}
      {proteinTarget != null && (
        <View style={styles.proteinTarget}>
          <View style={styles.proteinTargetRow}>
            <Text style={styles.proteinTargetLabel}>{t("protein_target")}</Text>
            <Text style={styles.proteinTargetVal}>
              {Math.round(proteinG)} / {proteinTarget} g
            </Text>
          </View>
          <View style={styles.proteinBarBg}>
            <View
              style={[
                styles.proteinBarFill,
                { width: `${Math.round((proteinRatio ?? 0) * 100)}%` as any,
                  backgroundColor: (proteinRatio ?? 0) >= 1 ? C.good : C.accent },
              ]}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function MacroRow({
  color, label, value, pct,
}: {
  color: string; label: string; value: string; pct: number;
}) {
  return (
    <View style={styles.macroRow}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroRowTxt}>{label}</Text>
      <Text style={styles.macroRowPct}>{pct}%</Text>
      <Text style={styles.macroRowVal}>{value}</Text>
    </View>
  );
}

// ─── MealSection ──────────────────────────────────────────────────────────────

function MealSection({
  label, entries, noEntriesLabel, addLabel, onAdd, onSaveAsMeal, saveAsLabel, renderEntry,
}: {
  label: string;
  entries: LogEntry[];
  noEntriesLabel: string;
  addLabel: string;
  onAdd: () => void;
  onSaveAsMeal?: () => void;
  saveAsLabel?: string;
  renderEntry: ({ item }: { item: LogEntry }) => React.ReactElement;
}) {
  const total = entries.reduce((s, e) => s + e.kcal, 0);
  return (
    <View style={styles.card}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTitle}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {entries.length > 0 && onSaveAsMeal && saveAsLabel && (
            <Pressable onPress={onSaveAsMeal} style={styles.saveAsBtn}>
              <Text style={styles.saveAsTxt}>💾 {saveAsLabel}</Text>
            </Pressable>
          )}
          {entries.length > 0 && (
            <Text style={styles.mealTotal}>{total} kcal</Text>
          )}
        </View>
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
  scroll: { padding: 16, paddingTop: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  muted:  { color: C.muted, fontSize: 13 },

  // Card shell
  card: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.line, padding: 16, marginBottom: 12,
  },

  // Budget card
  budgetLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 6,
  },
  budgetNum: {
    fontSize: 52, fontFamily: "Georgia", fontWeight: "600", lineHeight: 58,
  },
  budgetUnit: { fontSize: 18, color: C.muted },
  progressBg: {
    height: 6, borderRadius: 3, backgroundColor: C.line,
    marginTop: 14, marginBottom: 12, overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3 },
  budgetStats: { flexDirection: "row", justifyContent: "space-between" },
  budgetStat: { fontSize: 12, color: C.muted, textTransform: "uppercase",
                letterSpacing: 0.5 },
  budgetStatNum: { color: C.ink, fontFamily: "Georgia" },

  // Quick actions
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  quickBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  qFilled:       { backgroundColor: C.accent },
  qOutline:      { borderWidth: 1.5, borderColor: C.accent },
  qDone:         { borderColor: C.good, backgroundColor: C.accentSoft },
  qFilledTxt:    { color: "#fff", fontWeight: "700", fontSize: 13, textAlign: "center" },
  qOutlineTxt:   { color: C.accent, fontWeight: "700", fontSize: 13 },
  qDoneTxt:      { color: C.good },

  // Meal section
  mealHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 10,
  },
  mealTitle: {
    fontSize: 13, fontWeight: "700", color: C.ink,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  mealTotal: { fontSize: 13, color: C.muted, fontFamily: "Georgia" },
  addRow:    { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.line },
  addTxt:    { color: C.accent, fontWeight: "700", fontSize: 13 },

  // Log entries
  entryRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  entryName:  { fontSize: 14, color: C.ink, fontWeight: "500" },
  entryMeta:  { fontSize: 12, color: C.muted, marginTop: 1 },
  entryKcal:  {
    fontSize: 14, color: C.muted, fontFamily: "Georgia",
    minWidth: 40, textAlign: "right",
  },
  deleteBtn:  { padding: 6 },
  deleteTxt:  { color: C.muted, fontSize: 12 },

  // Macro donut
  donutCard: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.line, padding: 12, marginBottom: 12,
  },
  donutRow:    { flexDirection: "row", alignItems: "center", gap: 16 },
  macroLegend: { flex: 1, gap: 4 },
  macroTitle: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 4,
  },
  macroRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  macroDot:    { width: 8, height: 8, borderRadius: 4 },
  macroRowTxt: { fontSize: 12, color: C.muted, flex: 1 },
  macroRowPct: { fontSize: 11, color: C.muted, minWidth: 30, textAlign: "right" as const },
  macroRowVal: { fontSize: 12, color: C.ink, fontFamily: "Georgia", minWidth: 36, textAlign: "right" as const },

  // Protein target bar
  proteinTarget: {
    borderTopWidth: 1, borderColor: C.line,
    marginTop: 10, paddingTop: 10,
  },
  proteinTargetRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  proteinTargetLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700",
  },
  proteinTargetVal: { fontSize: 12, color: C.accent, fontFamily: "Georgia" },
  proteinBarBg:   { height: 4, borderRadius: 2, backgroundColor: C.line },
  proteinBarFill: { height: 4, borderRadius: 2 },

  // Progress strip
  strip: {
    flexDirection: "row", justifyContent: "space-between",
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1,
    borderColor: C.line, paddingVertical: 10, paddingHorizontal: 16,
    marginBottom: 4,
  },
  stripItem: { fontSize: 13, color: C.muted },

  // Modal shell
  modal: { flex: 1, backgroundColor: C.bg, paddingTop: 16 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingHorizontal: 16, marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: C.ink },
  backBtn:    { flex: 1 },
  backTxt:    { color: C.accent, fontSize: 14 },
  closeTxt:   { color: C.muted, fontSize: 18, padding: 4 },

  // Meal pills (modal)
  mealPills:     { maxHeight: 48, paddingHorizontal: 12, marginBottom: 12 },
  mealPill:      {
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
  resultKcal: {
    fontSize: 14, color: C.muted, fontFamily: "Georgia",
    textAlign: "right", minWidth: 60,
  },
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
    marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: C.accentSoft, alignItems: "center",
  },
  previewTxt:  { fontSize: 15, color: C.ink },
  previewKcal: { fontWeight: "700", color: C.accent },

  cta: {
    margin: 16, marginTop: 20, backgroundColor: C.accent,
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
  },
  ctaDisabled: { opacity: 0.4 },
  ctaTxt:      { color: "#fff", fontWeight: "700", fontSize: 16 },

  // Tab toggle (Foods | My Meals)
  tabToggle: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 12,
    backgroundColor: C.line, borderRadius: 10, padding: 3,
  },
  tabToggleBtn:   { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" as const },
  tabToggleBtnOn: { backgroundColor: C.card },
  tabToggleTxt:   { fontSize: 13, fontWeight: "600", color: C.muted },
  tabToggleTxtOn: { color: C.ink },

  // My Meals list rows
  mealCardRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: C.line,
  },
  mealCardMain: { flex: 1 },
  mealCardName: { fontSize: 15, fontWeight: "600", color: C.ink },
  mealCardMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  mealActionBtn:{ padding: 10 },
  mealActionTxt:{ fontSize: 16, color: C.muted },

  // Delete confirmation inline
  deleteConfirm: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  deleteConfirmTxt: { fontSize: 13, color: C.ink, flex: 1 },
  cancelBtn: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: C.line,
  },
  cancelTxt:        { fontSize: 12, color: C.muted },
  confirmDeleteBtn: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: C.over,
  },
  confirmDeleteTxt: { fontSize: 12, color: "#fff", fontWeight: "700" },

  // My Meals home screen shortcut
  myMealsShortcut: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.accent, borderRadius: 12,
    paddingVertical: 10, backgroundColor: C.accentSoft, marginBottom: 12,
  },
  myMealsShortcutTxt: { fontSize: 14, color: C.accent, fontWeight: "700" },

  // Save as meal (in MealSection header)
  saveAsBtn: { paddingVertical: 2 },
  saveAsTxt: { fontSize: 11, color: C.accent, fontWeight: "600" },

  // Scan button (in food search)
  scanBtn: {
    marginHorizontal: 16, marginBottom: 10, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingVertical: 10, backgroundColor: C.card,
  },
  scanBtnTxt: { fontSize: 14, color: C.ink, fontWeight: "600" },

  // Manual product form
  manualScroll:  { padding: 16, paddingBottom: 60 },
  offlineBanner: {
    backgroundColor: "#FFF3CD", borderRadius: 10, padding: 12, marginBottom: 14,
  },
  offlineTxt:    { fontSize: 13, color: "#856404", lineHeight: 18 },
  manualTitle:   { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 4 },
  manualBarcode: { fontSize: 12, color: C.muted, fontFamily: "Georgia", marginBottom: 20 },
  manualLabel:   {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 6, marginTop: 14,
  },
  manualInput:   {
    borderWidth: 1, borderColor: C.line, borderRadius: 12,
    padding: 12, fontSize: 16, color: C.ink, backgroundColor: C.card,
  },
  macroRow3:     { flexDirection: "row", gap: 8 },
  scanAgainBtn:  {
    marginTop: 14, alignItems: "center", paddingVertical: 12,
  },
  scanAgainTxt:  { color: C.muted, fontSize: 13 },

  // Create meal button
  createMealBtn: {
    margin: 16, borderWidth: 1.5, borderColor: C.accent,
    borderRadius: 12, paddingVertical: 12, alignItems: "center" as const,
  },
  createMealTxt: { color: C.accent, fontWeight: "700", fontSize: 14 },
});
