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
import { saveProfile } from "../db/localStore";

// theme
const C = {
  bg: "#FCF8FA", card: "#FFFFFF", ink: "#33202B", muted: "#8A6E7C",
  line: "#EFE2E8", accent: "#B93A6A", accentSoft: "#F7E3EC", good: "#3E7C5B",
};

interface Props {
  lang?: Lang;
  onComplete: (result: {
    sex: Sex; age: number; heightCm: number; weightKg: number;
    activity: ActivityLevel; goal: Goal; pace: Pace;
    goalWeightKg?: number; dailyTarget: number; maintenance: number;
  }) => void;
}

export default function OnboardingScreen({ lang = "fr", onComplete }: Props) {
  const t = makeT(lang);
  const [step, setStep] = useState(0);

  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("light");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pace, setPace] = useState<Pace>("moderate");

  // compute result once we have enough
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
      <Text style={styles.title}>{t("app_name")}</Text>

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

          {result.estimatedWeeks && (
            <Text style={styles.timeline}>
              {t("estimated_time")}: ~{result.estimatedWeeks} {t("weeks")}
            </Text>
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
                startWeightKg: payload.weightKg,
                goalWeightKg: payload.goalWeightKg ?? null,
                dailyTarget: payload.dailyTarget,
                maintenance: payload.maintenance,
                lang,
              });
              onComplete(payload);
            }}
          >
            <Text style={styles.ctaText}>{t("start_tracking")}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 60 },
  title: {
    fontSize: 26, fontStyle: "italic", textAlign: "center", color: C.ink,
    marginBottom: 20, fontFamily: "Georgia",
  },
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
  pill: {
    flexGrow: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: "#fff", alignItems: "center",
  },
  pillOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  pillText: { color: C.muted, fontWeight: "600", fontSize: 14 },
  pillTextOn: { color: C.accent },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14,
    fontSize: 16, color: C.ink, backgroundColor: "#fff",
  },
  bigMuted: { fontSize: 28, color: C.muted, fontFamily: "Georgia" },
  bigNumber: { fontSize: 48, color: C.ink, fontFamily: "Georgia" },
  unit: { fontSize: 16, color: C.muted },
  timeline: { marginTop: 12, fontSize: 14, color: C.ink },
  floorNote: { marginTop: 8, fontSize: 13, color: C.accent },
  cta: {
    marginTop: 20, backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 15, alignItems: "center",
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
