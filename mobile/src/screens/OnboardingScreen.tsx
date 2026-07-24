/**
 * OnboardingScreen — collects a new user's stats + goal, runs the calorie
 * engine, and shows their personalized numbers (maintenance, daily target,
 * estimated timeline). Bilingual via i18n. This is the app's headline feature.
 *
 * Expo / React Native. Uses the shared calorieEngine + i18n we built.
 */

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { calculateCalories, Sex, ActivityLevel, Goal, Pace } from "../lib/calorieEngine";
import { makeT, Lang } from "../lib/i18n";
import { saveProfile, Profile } from "../db/localStore";
import { C } from "../lib/theme";

const ACTIVITY_LEVELS: ActivityLevel[] = [
  "sedentary", "light", "moderate", "active", "very_active",
];

function targetDateStr(weeks: number, lang: Lang): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
    month: "long", year: "numeric",
  }).format(d);
}

interface Props {
  lang?: Lang;
  initialProfile?: Profile;
  onComplete: (result: {
    sex: Sex; age: number; heightCm: number; weightKg: number;
    activity: ActivityLevel; goal: Goal; pace: Pace;
    goalWeightKg?: number; dailyTarget: number; maintenance: number;
  }) => void;
}

export default function OnboardingScreen({ lang = "fr", initialProfile, onComplete }: Props) {
  const t = makeT(lang);
  const isEditing = initialProfile != null;
  const [sex, setSex] = useState<Sex | null>((initialProfile?.sex as Sex) ?? null);
  const [age, setAge] = useState(initialProfile?.age?.toString() ?? "");
  const [height, setHeight] = useState(initialProfile?.heightCm?.toString() ?? "");
  const [weight, setWeight] = useState(initialProfile?.weightKg?.toString() ?? "");
  const [goalWeight, setGoalWeight] = useState(initialProfile?.goalWeightKg?.toString() ?? "");
  const [activity, setActivity] = useState<ActivityLevel>((initialProfile?.activity as ActivityLevel) ?? "light");
  const [goal, setGoal] = useState<Goal | null>((initialProfile?.goal as Goal) ?? null);
  const [pace, setPace] = useState<Pace>((initialProfile?.pace as Pace) ?? "moderate");

  const canCompute =
    sex && goal && Number(age) > 0 && Number(height) > 0 && Number(weight) > 0;

  const result = canCompute
    ? calculateCalories({
        sex: sex!,
        age: Number(age),
        heightCm: Number(height),
        weightKg: Number(weight),
        activity,
        goal: goal!,
        pace,
        goalWeightKg: goalWeight ? Number(goalWeight) : undefined,
      })
    : null;

  const pill = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active && styles.pillOn]}
    >
      <Text style={[styles.pillText, active && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );

  const field = (label: string, value: string, setter: (s: string) => void, ph: string) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(v) => setter(v.replace(/[^\d.]/g, ""))}
        keyboardType="numeric"
        placeholder={ph}
        placeholderTextColor={C.muted}
      />
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.container}>

      {/* SEX */}
      <View style={styles.card}>
        <Text style={styles.label}>{t("onboarding_sex")}</Text>
        <View style={styles.row}>
          {pill(t("female"), sex === "female", () => setSex("female"))}
          {pill(t("male"), sex === "male", () => setSex("male"))}
        </View>
      </View>

      {/* STATS */}
      <View style={styles.card}>
        {field(t("your_age"), age, setAge, "40")}
        {field(t("your_height"), height, setHeight, "170")}
        {field(t("your_weight"), weight, setWeight, "78")}
      </View>

      {/* ACTIVITY LEVEL */}
      <View style={styles.card}>
        <Text style={styles.label}>{t("your_activity")}</Text>
        {ACTIVITY_LEVELS.map((level) => (
          <Pressable
            key={level}
            onPress={() => setActivity(level)}
            style={[styles.activityPill, activity === level && styles.activityPillOn]}
          >
            <Text style={[styles.activityLabel, activity === level && styles.activityLabelOn]}>
              {t(`act_${level}` as any)}
            </Text>
            <Text style={[styles.activityDesc, activity === level && styles.activityDescOn]}>
              {t(`act_${level}_desc` as any)}
            </Text>
          </Pressable>
        ))}
        <Text style={styles.activityHint}>{t("act_hint")}</Text>
      </View>

      {/* GOAL */}
      <View style={styles.card}>
        <Text style={styles.label}>{t("your_goal")}</Text>
        <View style={styles.rowWrap}>
          {pill(t("goal_lose"), goal === "lose", () => setGoal("lose"))}
          {pill(t("goal_maintain"), goal === "maintain", () => setGoal("maintain"))}
          {pill(t("goal_gain"), goal === "gain", () => setGoal("gain"))}
        </View>
        {goal && goal !== "maintain" && (
          <>
            <Text style={[styles.label, { marginTop: 14 }]}>{t("goal_kg")}</Text>
            <TextInput
              style={styles.input}
              value={goalWeight}
              onChangeText={(v) => setGoalWeight(v.replace(/[^\d.]/g, ""))}
              keyboardType="numeric"
              placeholder="71"
              placeholderTextColor={C.muted}
            />
          </>
        )}
      </View>

      {/* RESULT */}
      {result && (
        <View style={[styles.card, { backgroundColor: C.accentSoft }]}>
          <Text style={styles.label}>{t("your_maintenance")}</Text>
          <Text style={styles.bigMuted}>
            {result.maintenance.toLocaleString()} {t("kcal")}
          </Text>

          <Text style={[styles.label, { marginTop: 16 }]}>{t("your_daily_target")}</Text>
          <Text style={styles.bigNumber}>
            {result.dailyTarget.toLocaleString()} <Text style={styles.unit}>{t("kcal")}</Text>
          </Text>

          {result.estimatedWeeks != null && (
            <View style={styles.timelineBox}>
              <Text style={styles.timelineLine}>
                {t("target_date")}: <Text style={styles.timelineEm}>{targetDateStr(result.estimatedWeeks, lang)}</Text>
              </Text>
              <Text style={styles.timelineLine}>
                {t("weekly_pace")}: <Text style={styles.timelineEm}>{Math.abs(result.weeklyPaceKg)} kg / {lang === "fr" ? "semaine" : "week"}</Text>
              </Text>
              <Text style={styles.steadyNote}>{t("steady_loss_note")}</Text>
            </View>
          )}

          {result.flooredToMinimum && (
            <Text style={styles.floorNote}>{t("floor_note")}</Text>
          )}

          <Pressable
            style={styles.cta}
            onPress={async () => {
              const payload = {
                sex: sex!, age: Number(age), heightCm: Number(height),
                weightKg: Number(weight), activity, goal: goal!, pace,
                goalWeightKg: goalWeight ? Number(goalWeight) : undefined,
                dailyTarget: result.dailyTarget, maintenance: result.maintenance,
              };
              await saveProfile({
                sex: payload.sex,
                age: payload.age,
                heightCm: payload.heightCm,
                weightKg: payload.weightKg,
                activity: payload.activity,
                goal: payload.goal,
                pace: payload.pace,
                startWeightKg: initialProfile?.startWeightKg ?? payload.weightKg,
                goalWeightKg: payload.goalWeightKg ?? null,
                dailyTarget: payload.dailyTarget,
                maintenance: payload.maintenance,
                lang,
              });
              onComplete(payload);
            }}
          >
            <Text style={styles.ctaText}>{isEditing ? t("save_profile") : t("start_tracking")}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 20, paddingBottom: 60 },

  card: {
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1,
    borderColor: C.line, padding: 20, marginBottom: 14,
  },
  label: {
    fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
    color: C.muted, fontWeight: "700", marginBottom: 10,
  },
  row: { flexDirection: "row", gap: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Generic pill (sex, goal)
  pill: {
    flexGrow: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", alignItems: "center",
  },
  pillOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  pillText: { color: C.muted, fontWeight: "600", fontSize: 14 },
  pillTextOn: { color: C.accent },

  // Activity level pills (stacked, full-width)
  activityPill: {
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: C.line, backgroundColor: "#fff",
    marginBottom: 8,
  },
  activityPillOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  activityLabel: { fontSize: 14, fontWeight: "700", color: C.ink },
  activityLabelOn: { color: C.accent },
  activityDesc: { fontSize: 12, color: C.muted, marginTop: 2 },
  activityDescOn: { color: C.accent },
  activityHint: { fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 18 },

  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14,
    fontSize: 16, color: C.ink, backgroundColor: "#fff",
  },

  // Result card
  bigMuted: { fontSize: 28, color: C.muted, fontFamily: "Georgia" },
  bigNumber: { fontSize: 48, color: C.ink, fontFamily: "Georgia" },
  unit: { fontSize: 16, color: C.muted },

  timelineBox: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: "#fff", borderWidth: 1, borderColor: C.line,
  },
  timelineLine: { fontSize: 13, color: C.ink, marginBottom: 4 },
  timelineEm: { fontWeight: "700", color: C.accent },
  steadyNote: { fontSize: 12, color: C.muted, marginTop: 4 },

  floorNote: { marginTop: 8, fontSize: 13, color: C.accent },

  cta: {
    marginTop: 20, backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: "center",
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
