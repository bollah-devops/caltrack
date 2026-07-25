/**
 * MealBuilderModal — create or edit a named custom meal (recipe).
 *
 * Inner food-search + measure-picker mirrors the Add Food modal flow.
 * No nested Modal: this is rendered inside the parent Add Food Modal
 * using view-switching (modalView state in HomeScreen).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  computeKcal,
  computeMacros,
  FoodItem,
  FoodMeasure,
  resolveFoodName,
  searchFoods,
} from "../api/foods";
import {
  CustomMeal,
  CustomMealItem,
  NewCustomMealItem,
  saveCustomMeal,
  updateCustomMeal,
} from "../db/localStore";
import { Lang, makeT } from "../lib/i18n";
import { C } from "../lib/theme";

const STANDARD = new Set([
  "gram", "ml", "teaspoon", "tablespoon", "cup", "piece", "handful", "ladle", "glass",
]);

type BuilderPhase = "list" | "search" | "measure";

interface Props {
  lang: Lang;
  initialMeal: CustomMeal | null;
  onBack: () => void;
  onSaved: () => void;
}

export default function MealBuilderModal({ lang, initialMeal, onBack, onSaved }: Props) {
  const t = makeT(lang);
  const isEditing = initialMeal != null;

  // Meal state
  const [name, setName]           = useState(initialMeal?.name ?? "");
  const [items, setItems]         = useState<NewCustomMealItem[]>(
    initialMeal?.items.map(itemToNew) ?? []
  );
  const [saving, setSaving]       = useState(false);
  const [phase, setPhase]         = useState<BuilderPhase>("list");

  // Food-search sub-flow
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<FoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked]       = useState<FoodItem | null>(null);
  const [measureIdx, setMeasureIdx] = useState(0);
  const [quantity, setQuantity]   = useState("1");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when initialMeal changes (e.g. switching from create to edit)
  useEffect(() => {
    setName(initialMeal?.name ?? "");
    setItems(initialMeal?.items.map(itemToNew) ?? []);
    setPhase("list");
    setSaving(false);
  }, [initialMeal]);

  // Debounced search
  useEffect(() => {
    if (phase !== "search") return;
    if (timer.current) clearTimeout(timer.current);
    if (!query || query.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      setResults(await searchFoods(query, lang));
      setSearching(false);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, phase, lang]);

  // Derived
  const measure: FoodMeasure | undefined = picked?.measures[measureIdx];
  const qty          = parseFloat(quantity) || 0;
  const previewGrams = measure ? Math.round(qty * measure.grams) : 0;
  const previewKcal  = picked && measure ? computeKcal(qty, measure.grams, picked.kcalPer100) : 0;
  const totalKcal    = items.reduce((s, i) => s + i.kcal, 0);
  const canSave      = name.trim().length > 0 && items.length > 0;

  function mLabel(label: string) {
    return STANDARD.has(label) ? t(`measure_${label}` as any) : label;
  }

  function openSearch() {
    setQuery(""); setResults([]); setPicked(null);
    setMeasureIdx(0); setQuantity("1");
    setPhase("search");
  }

  function selectFood(food: FoodItem) {
    setPicked(food); setMeasureIdx(0); setQuantity("1");
    setPhase("measure");
  }

  function confirmItem() {
    if (!picked || !measure || qty <= 0) return;
    const displayName = lang === "en" ? (picked.nameEn || picked.nameFr) : picked.nameFr;
    setItems((prev) => [...prev, {
      foodId: picked.id,
      foodName: displayName,
      measureLabel: measure.label,
      quantity: qty,
      grams: Math.round(qty * measure.grams * 10) / 10,
      kcal: previewKcal,
      proteinG: computeMacros(qty, measure.grams, picked.proteinG ?? 0),
      carbsG:   computeMacros(qty, measure.grams, picked.carbsG   ?? 0),
      fatG:     computeMacros(qty, measure.grams, picked.fatG     ?? 0),
    }]);
    setPhase("list");
  }

  function handleBack() {
    if (phase === "measure") { setPhase("search"); return; }
    if (phase === "search")  { setPhase("list");   return; }
    onBack();
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    if (isEditing && initialMeal) {
      await updateCustomMeal(initialMeal.id, name.trim(), items);
    } else {
      await saveCustomMeal(name.trim(), items);
    }
    setSaving(false);
    onSaved();
  }

  // ── Header ────────────────────────────────────────────────────────────────

  const headerTitle = phase === "list"
    ? (isEditing ? t("edit_meal") : t("new_meal"))
    : phase === "search"
      ? t("add_item")
      : (picked?.name ?? t("add_item"));

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={handleBack} style={{ flex: 1 }}>
          <Text style={s.backTxt}>← {phase === "list" ? t("my_meals") : (isEditing ? t("edit_meal") : t("new_meal"))}</Text>
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{headerTitle}</Text>
      </View>

      {/* PHASE: list */}
      {phase === "list" && (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.scroll}>

          <Text style={s.sectionLabel}>{t("meal_name")}</Text>
          <TextInput
            style={s.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={t("meal_name_ph")}
            placeholderTextColor={C.muted}
            autoCapitalize="sentences"
          />

          {items.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 20 }]}>{t("meal_ingredients")}</Text>
              {items.map((item, i) => (
                <View key={i} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>
                      {resolveFoodName(item.foodId ?? null, item.foodName, lang)}
                    </Text>
                    <Text style={s.itemMeta}>
                      {item.measureLabel === "gram"
                        ? `${item.grams} g`
                        : `${item.quantity} ${mLabel(item.measureLabel)} · ${item.grams} g`}
                    </Text>
                  </View>
                  <Text style={s.itemKcal}>{item.kcal}</Text>
                  <Pressable
                    onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    style={s.removeBtn}
                  >
                    <Text style={s.removeTxt}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{t("meal_total")}</Text>
                <Text style={s.totalKcal}>{totalKcal} kcal</Text>
              </View>
            </>
          )}

          <Pressable style={s.addItemBtn} onPress={openSearch}>
            <Text style={s.addItemTxt}>+ {t("add_item")}</Text>
          </Pressable>

          <Pressable
            style={[s.saveCta, !canSave && s.ctaDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            <Text style={s.saveCtaTxt}>{saving ? t("loading") : t("save_meal")}</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* PHASE: search */}
      {phase === "search" && (
        <>
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t("search_placeholder")}
            placeholderTextColor={C.muted}
            autoFocus
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} />}
          <FlatList
            data={results}
            keyExtractor={(f) => f.id}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            renderItem={({ item }) => (
              <Pressable style={s.resultRow} onPress={() => selectFood(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.resultName}>{item.name}</Text>
                  {item.nameEn && item.nameFr && item.nameEn !== item.nameFr && (
                    <Text style={s.resultSub}>
                      {lang === "fr" ? item.nameEn : item.nameFr}
                    </Text>
                  )}
                </View>
                <Text style={s.resultKcal}>
                  {item.kcalPer100}{"\n"}
                  <Text style={s.resultUnit}>kcal/100g</Text>
                </Text>
              </Pressable>
            )}
          />
        </>
      )}

      {/* PHASE: measure */}
      {phase === "measure" && picked && (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <View style={[s.pickedCard, { margin: 16, marginTop: 0, marginBottom: 14 }]}>
            <Text style={s.pickedName}>{picked.name}</Text>
            <Text style={s.pickedKcal}>{picked.kcalPer100} kcal / 100 g</Text>
          </View>

          <Text style={s.pickerLabel}>{t("choose_measure")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.chipScroll} contentContainerStyle={s.chipRow}>
            {picked.measures.map((m, i) => (
              <Pressable key={i} onPress={() => setMeasureIdx(i)}
                style={[s.chip, measureIdx === i && s.chipOn]}>
                <Text style={[s.chipTxt, measureIdx === i && s.chipTxtOn]}>
                  {mLabel(m.label)}
                </Text>
                {m.label !== "gram" && (
                  <Text style={[s.chipGrams, measureIdx === i && s.chipGramsOn]}>
                    {m.grams} g
                  </Text>
                )}
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[s.pickerLabel, { marginTop: 20 }]}>{t("quantity")}</Text>
          <TextInput
            style={s.qtyInput}
            value={quantity}
            onChangeText={(v) => setQuantity(v.replace(/[^\d.]/g, ""))}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />

          {qty > 0 && measure && (
            <View style={s.previewBox}>
              <Text style={s.previewTxt}>
                {qty} {mLabel(measure.label)}
                {" = "}{previewGrams} g{" = "}
                <Text style={s.previewKcal}>{previewKcal} kcal</Text>
              </Text>
            </View>
          )}

          <Pressable
            style={[s.saveCta, { margin: 16, marginTop: 20 }, (!qty || qty <= 0) && s.ctaDisabled]}
            onPress={confirmItem}
            disabled={!qty || qty <= 0}
          >
            <Text style={s.saveCtaTxt}>+ {t("add_item")}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function itemToNew(it: CustomMealItem): NewCustomMealItem {
  return {
    foodId: it.foodId, foodName: it.foodName, measureLabel: it.measureLabel,
    quantity: it.quantity, grams: it.grams, kcal: it.kcal,
    proteinG: it.proteinG, carbsG: it.carbsG, fatG: it.fatG,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, marginBottom: 14, gap: 8,
  },
  backTxt:     { color: C.accent, fontSize: 14 },
  headerTitle: { fontSize: 15, fontWeight: "700", color: C.ink, flex: 1, textAlign: "right" as const },

  scroll: { padding: 16, paddingBottom: 60 },

  sectionLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 8,
  },
  nameInput: {
    borderWidth: 1, borderColor: C.line, borderRadius: 12,
    padding: 14, fontSize: 16, color: C.ink, backgroundColor: C.card,
  },

  itemRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 8,
    borderBottomWidth: 1, borderColor: C.line,
  },
  itemName:  { fontSize: 14, color: C.ink, fontWeight: "500" },
  itemMeta:  { fontSize: 12, color: C.muted, marginTop: 2 },
  itemKcal:  {
    fontSize: 14, color: C.muted, fontFamily: "Georgia",
    minWidth: 40, textAlign: "right" as const,
  },
  removeBtn: { padding: 6 },
  removeTxt: { color: C.muted, fontSize: 12 },

  totalRow:   { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, marginTop: 2 },
  totalLabel: { fontSize: 12, color: C.muted, fontWeight: "600", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  totalKcal:  { fontSize: 14, color: C.ink, fontFamily: "Georgia" },

  addItemBtn: {
    marginTop: 16, borderWidth: 1.5, borderColor: C.accent,
    borderRadius: 12, paddingVertical: 12, alignItems: "center" as const,
  },
  addItemTxt: { color: C.accent, fontWeight: "700", fontSize: 14 },

  saveCta:    {
    marginTop: 20, backgroundColor: C.accent,
    borderRadius: 12, paddingVertical: 15, alignItems: "center" as const,
  },
  ctaDisabled:{ opacity: 0.4 },
  saveCtaTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },

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
    textAlign: "right" as const, minWidth: 60,
  },
  resultUnit: { fontSize: 11, color: C.muted },

  // Measure picker
  pickedCard: {
    backgroundColor: C.card, borderRadius: 16,
    borderWidth: 1, borderColor: C.line, padding: 16,
  },
  pickedName: { fontSize: 18, fontWeight: "700", color: C.ink },
  pickedKcal: { fontSize: 13, color: C.muted, marginTop: 4 },
  pickerLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", paddingHorizontal: 16, marginBottom: 10,
  },
  chipScroll:  { maxHeight: 76 },
  chipRow:     { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  chip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.card,
    alignItems: "center" as const, minWidth: 64,
  },
  chipOn:      { borderColor: C.accent, backgroundColor: C.accentSoft },
  chipTxt:     { color: C.muted, fontWeight: "600", fontSize: 14 },
  chipTxtOn:   { color: C.accent },
  chipGrams:   { color: C.muted, fontSize: 11, marginTop: 2 },
  chipGramsOn: { color: C.accent },

  qtyInput: {
    marginHorizontal: 16, borderWidth: 1, borderColor: C.line,
    borderRadius: 12, padding: 14, fontSize: 24, color: C.ink,
    backgroundColor: C.card, textAlign: "center" as const, fontFamily: "Georgia",
  },
  previewBox: {
    marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: C.accentSoft, alignItems: "center" as const,
  },
  previewTxt:  { fontSize: 15, color: C.ink },
  previewKcal: { fontWeight: "700", color: C.accent },
});
