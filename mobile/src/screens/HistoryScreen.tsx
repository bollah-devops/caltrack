/**
 * HistoryScreen — past days, expandable to show foods per meal.
 *
 * - Lists days that have at least one log entry, newest first.
 * - Tap a day to expand its meal breakdown.
 * - Delete individual entries inline; day row updates immediately.
 * - Reads dailyTarget from the stored profile for within/over display.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Svg, Rect, Line, Text as SvgText } from "react-native-svg";
import {
  deleteLogEntry,
  DaySummary,
  DayKcal,
  getEntriesForDate,
  getDailyKcalHistory,
  getHistoryDays,
  getProfile,
  LogEntry,
  Meal,
  Profile,
} from "../db/localStore";
import { resolveFoodName } from "../api/foods";
import { makeT, Lang } from "../lib/i18n";
import { C } from "../lib/theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STANDARD = new Set([
  "gram", "ml", "teaspoon", "tablespoon", "cup", "piece", "handful", "ladle", "glass",
]);

function measureDisplay(label: string, t: ReturnType<typeof makeT>): string {
  if (STANDARD.has(label)) return t(`measure_${label}` as any);
  return label;
}

function formatDate(dateStr: string, lang: Lang): string {
  // Parse as local noon to avoid UTC-offset day-shift
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
    weekday: "short", day: "numeric", month: "short",
  }).format(date);
}

const MEAL_ORDER: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  lang?: Lang;
}

export default function HistoryScreen({ lang = "fr" }: Props) {
  const t = makeT(lang);

  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState<Profile | null>(null);
  const [days, setDays]             = useState<DaySummary[]>([]);
  const [chartData, setChartData]   = useState<DayKcal[]>([]);
  // Dates whose detail panel is open
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  // Lazily loaded entry lists, keyed by date
  const [cache, setCache]           = useState<Record<string, LogEntry[]>>({});

  useEffect(() => {
    async function load() {
      const [p, d, chart] = await Promise.all([
        getProfile(),
        getHistoryDays(90),
        getDailyKcalHistory(14),
      ]);
      setProfile(p);
      setDays(d);
      setChartData(chart);
      setLoading(false);
    }
    load();
  }, []);

  // Toggle a day open/closed; load its entries on first open
  const toggle = useCallback(async (date: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) { next.delete(date); } else { next.add(date); }
      return next;
    });
    if (!cache[date]) {
      const entries = await getEntriesForDate(date);
      setCache((prev) => ({ ...prev, [date]: entries }));
    }
  }, [cache]);

  // Delete an entry and refresh that day's summary
  const handleDelete = useCallback(async (entryId: string, date: string) => {
    await deleteLogEntry(entryId);
    // Refresh the cached entries for this day
    const updated = await getEntriesForDate(date);
    setCache((prev) => ({ ...prev, [date]: updated }));
    // Refresh the day summaries (kcal total may change, day may disappear)
    const updatedDays = await getHistoryDays(90);
    setDays(updatedDays);
    // If the day now has no entries, collapse it
    if (updated.length === 0) {
      setExpanded((prev) => { const next = new Set(prev); next.delete(date); return next; });
    }
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const target = profile?.dailyTarget ?? 0;
  const hasChart = chartData.some((d) => d.kcal > 0);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={days}
        keyExtractor={(d) => d.date}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          hasChart ? (
            <CalorieBarChart data={chartData} target={target} t={t} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("no_history")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <DayRow
            day={item}
            target={target}
            lang={lang}
            t={t}
            isExpanded={expanded.has(item.date)}
            entries={cache[item.date]}
            onToggle={() => toggle(item.date)}
            onDelete={(id) => handleDelete(id, item.date)}
          />
        )}
      />
    </View>
  );
}

// ─── CalorieBarChart ──────────────────────────────────────────────────────────

function CalorieBarChart({
  data, target, t,
}: {
  data: DayKcal[];
  target: number;
  t: ReturnType<typeof makeT>;
}) {
  const { width: screenW } = Dimensions.get("window");
  const width  = screenW - 32 - 2;  // list padding 16×2, border 1×2
  const height = 150;
  const padL   = 36;
  const padR   = 8;
  const padT   = 12;
  const padB   = 28;
  const plotW  = width - padL - padR;
  const plotH  = height - padT - padB;

  const maxKcal = Math.max(target * 1.2, ...data.map((d) => d.kcal), 1);
  const barW    = plotW / data.length;
  const barPad  = 2;
  const yPos    = (v: number) => padT + (1 - v / maxKcal) * plotH;
  const targetY = target > 0 ? yPos(target) : -1;

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartLabel}>{t("last_14_days")}</Text>
      <Svg width={width} height={height}>
        <SvgText
          x={padL - 4} y={padT + 8}
          textAnchor="end" fontSize={10} fill={C.muted}
        >
          {Math.round(maxKcal)}
        </SvgText>

        {data.map((d, i) => {
          const barH  = d.kcal > 0 ? Math.max(2, (d.kcal / maxKcal) * plotH) : 2;
          const color = d.kcal === 0 ? C.line : d.kcal <= target ? C.good : C.over;
          return (
            <Rect
              key={i}
              x={padL + i * barW + barPad}
              y={padT + plotH - barH}
              width={barW - barPad * 2}
              height={barH}
              fill={color}
              rx={2}
            />
          );
        })}

        {target > 0 && targetY >= padT && (
          <Line
            x1={padL} y1={targetY} x2={width - padR} y2={targetY}
            stroke={C.accent} strokeWidth={1.5} strokeDasharray="4 3"
          />
        )}
      </Svg>
    </View>
  );
}

// ─── DayRow ───────────────────────────────────────────────────────────────────

interface DayRowProps {
  day: DaySummary;
  target: number;
  lang: Lang;
  t: ReturnType<typeof makeT>;
  isExpanded: boolean;
  entries: LogEntry[] | undefined;
  onToggle: () => void;
  onDelete: (id: string) => void;
}

function DayRow({ day, target, lang, t, isExpanded, entries, onToggle, onDelete }: DayRowProps) {
  const over = target > 0 ? day.kcal - target : 0;
  const isOver = over > 0;
  const fillRatio = target > 0 ? Math.min(day.kcal / target, 1) : 0;

  return (
    <View style={styles.dayCard}>
      {/* Summary row — always visible */}
      <Pressable onPress={onToggle} style={styles.dayHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dateLabel}>{formatDate(day.date, lang)}</Text>
          <Text style={[styles.budgetLabel, { color: isOver ? C.over : C.good }]}>
            {isOver
              ? `${t("over_budget_by")} ${over} kcal`
              : t("within_budget")}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={styles.kcalNum}>{day.kcal.toLocaleString()}</Text>
          <Text style={styles.kcalUnit}>kcal</Text>
        </View>

        <Text style={[styles.chevron, isExpanded && styles.chevronOpen]}>›</Text>
      </Pressable>

      {/* Budget bar */}
      <View style={styles.barBg}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.round(fillRatio * 100)}%` as any,
              backgroundColor: isOver ? C.over : C.good },
          ]}
        />
      </View>

      {/* Steps badge */}
      {day.stepsDone && (
        <Text style={styles.stepsBadge}>🚶 {t("steps_done")}</Text>
      )}

      {/* Expanded detail */}
      {isExpanded && (
        <View style={styles.detail}>
          {entries === undefined ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />
          ) : entries.length === 0 ? (
            <Text style={styles.mutedText}>{t("no_entries")}</Text>
          ) : (
            MEAL_ORDER.map((meal) => {
              const mealEntries = entries.filter((e) => e.meal === meal);
              if (mealEntries.length === 0) return null;
              const mealKcal = mealEntries.reduce((s, e) => s + e.kcal, 0);
              return (
                <View key={meal} style={styles.mealGroup}>
                  <View style={styles.mealGroupHeader}>
                    <Text style={styles.mealName}>{t(meal)}</Text>
                    <Text style={styles.mealKcal}>{mealKcal} kcal</Text>
                  </View>
                  {mealEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      lang={lang}
                      t={t}
                      onDelete={() => onDelete(entry.id)}
                    />
                  ))}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Tap hint when collapsed and has entries */}
      {!isExpanded && (
        <Pressable onPress={onToggle}>
          <Text style={styles.tapHint}>{t("tap_to_see")}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── EntryRow ─────────────────────────────────────────────────────────────────

function EntryRow({
  entry, lang, t, onDelete,
}: {
  entry: LogEntry;
  lang: Lang;
  t: ReturnType<typeof makeT>;
  onDelete: () => void;
}) {
  return (
    <View style={styles.entryRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryName}>{resolveFoodName(entry.foodId, entry.foodName, lang)}</Text>
        <Text style={styles.entryMeta}>
          {entry.measureLabel === "gram"
            ? `${entry.grams} g`
            : `${entry.quantity} ${measureDisplay(entry.measureLabel, t)} · ${entry.grams} g`}
        </Text>
      </View>
      <Text style={styles.entryKcal}>{entry.kcal}</Text>
      <Pressable onPress={onDelete} style={styles.deleteBtn} hitSlop={8}>
        <Text style={styles.deleteTxt}>✕</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center:       { flex: 1, backgroundColor: C.bg, justifyContent: "center",
                  alignItems: "center", padding: 32 },
  emptyText:    { fontSize: 14, color: C.muted, textAlign: "center" },
  emptyContainer: { paddingTop: 32, alignItems: "center" },

  list:         { padding: 16, paddingTop: 16, paddingBottom: 40 },

  // Bar chart
  chartCard: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.line, marginBottom: 12, overflow: "hidden",
    paddingTop: 8,
  },
  chartLabel: {
    fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", paddingHorizontal: 14, paddingBottom: 4,
  },

  dayCard:      { backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
                  borderColor: C.line, marginBottom: 12, overflow: "hidden" },

  dayHeader:    { flexDirection: "row", alignItems: "center",
                  gap: 12, padding: 16, paddingBottom: 10 },
  dateLabel:    { fontSize: 15, fontWeight: "700", color: C.ink },
  budgetLabel:  { fontSize: 12, marginTop: 2 },
  kcalNum:      { fontSize: 24, fontFamily: "Georgia", color: C.ink,
                  fontWeight: "600" },
  kcalUnit:     { fontSize: 11, color: C.muted, textTransform: "uppercase",
                  letterSpacing: 0.8 },
  chevron:      { fontSize: 22, color: C.muted, transform: [{ rotate: "0deg" }] },
  chevronOpen:  { transform: [{ rotate: "90deg" }] },

  barBg:        { height: 4, backgroundColor: C.line, marginHorizontal: 16 },
  barFill:      { height: 4, borderRadius: 2 },

  stepsBadge:   { fontSize: 11, color: C.good, paddingHorizontal: 16,
                  paddingTop: 6, paddingBottom: 2 },

  tapHint:      { fontSize: 12, color: C.muted, textAlign: "center",
                  paddingVertical: 10 },

  detail:       { borderTopWidth: 1, borderColor: C.line,
                  paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  mutedText:    { color: C.muted, fontSize: 13, paddingBottom: 8 },

  mealGroup:    { marginBottom: 12 },
  mealGroupHeader: { flexDirection: "row", justifyContent: "space-between",
                     marginBottom: 6 },
  mealName:     { fontSize: 11, fontWeight: "700", color: C.muted,
                  textTransform: "uppercase", letterSpacing: 0.8 },
  mealKcal:     { fontSize: 11, color: C.muted, fontFamily: "Georgia" },

  entryRow:     { flexDirection: "row", alignItems: "center",
                  paddingVertical: 5, gap: 8 },
  entryName:    { fontSize: 14, color: C.ink },
  entryMeta:    { fontSize: 12, color: C.muted, marginTop: 1 },
  entryKcal:    { fontSize: 14, color: C.muted, fontFamily: "Georgia",
                  minWidth: 36, textAlign: "right" },
  deleteBtn:    { padding: 4 },
  deleteTxt:    { color: C.muted, fontSize: 12 },
});
