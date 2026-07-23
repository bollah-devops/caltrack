/**
 * CalTrack — app entry point.
 *
 * Boot sequence:
 *   1. getProfile() opens the SQLite DB and runs schema migrations.
 *   2. No profile → OnboardingScreen (saves profile on completion).
 *   3. Profile exists → main app: TodayScreen + HistoryScreen tabs.
 *
 * Features here:
 *   - Safe-area insets (Android nav bar / iOS home indicator)
 *   - Fixed header with app title + FR/EN language toggle
 *   - Lang persisted to profile on every toggle
 */

import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { getProfile, saveProfile, Profile } from "./src/db/localStore";
import { Lang, makeT, resolveDefaultLang } from "./src/lib/i18n";
import { C } from "./src/lib/theme";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import TodayScreen from "./src/screens/TodayScreen";
import HistoryScreen from "./src/screens/HistoryScreen";

type Tab = "today" | "history";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner() {
  const insets = useSafeAreaInsets();

  const [ready, setReady]     = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lang, setLang]       = useState<Lang>("fr");
  const [tab, setTab]         = useState<Tab>("today");

  const t = makeT(lang);

  // Open DB + load profile on first render
  useEffect(() => {
    const deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    getProfile()
      .then((p) => {
        setProfile(p);
        setLang(resolveDefaultLang(deviceLocale, (p?.lang as Lang | undefined)));
        setReady(true);
      })
      .catch(() => {
        setLang(resolveDefaultLang(deviceLocale));
        setReady(true);
      });
  }, []);

  async function toggleLang() {
    const newLang: Lang = lang === "fr" ? "en" : "fr";
    setLang(newLang);
    if (profile) {
      const updated = { ...profile, lang: newLang };
      await saveProfile(updated);
      setProfile(updated);
    }
  }

  // ── Splash / loading ──────────────────────────────────────────────────────
  if (!ready) {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <Text style={styles.splashTitle}>CalTrack</Text>
        <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
      </View>
    );
  }

  // ── Onboarding ────────────────────────────────────────────────────────────
  if (!profile) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        {/* Lang toggle visible even during onboarding */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.headerTitle}>CalTrack</Text>
          <Pressable onPress={toggleLang} style={styles.langBtn}>
            <Text style={[styles.langTxt, lang === "fr" && styles.langActive]}>FR</Text>
            <Text style={styles.langSep}>/</Text>
            <Text style={[styles.langTxt, lang === "en" && styles.langActive]}>EN</Text>
          </Pressable>
        </View>
        <OnboardingScreen
          lang={lang}
          onComplete={async () => {
            const p = await getProfile();
            setProfile(p);
          }}
        />
      </View>
    );
  }

  // ── Main app ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <Text style={styles.headerTitle}>CalTrack</Text>
        <Pressable onPress={toggleLang} style={styles.langBtn}>
          <Text style={[styles.langTxt, lang === "fr" && styles.langActive]}>FR</Text>
          <Text style={styles.langSep}>/</Text>
          <Text style={[styles.langTxt, lang === "en" && styles.langActive]}>EN</Text>
        </Pressable>
      </View>

      {/* Active screen */}
      <View style={{ flex: 1 }}>
        {tab === "today"
          ? <TodayScreen lang={lang} />
          : <HistoryScreen lang={lang} />}
      </View>

      {/* Tab bar — safe-area aware bottom padding */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TabItem
          label={t("tab_today")}
          active={tab === "today"}
          onPress={() => setTab("today")}
        />
        <TabItem
          label={t("tab_history")}
          active={tab === "history"}
          onPress={() => setTab("history")}
        />
      </View>
    </View>
  );
}

function TabItem({
  label, active, onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabItem} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      {active && <View style={styles.tabIndicator} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Splash
  splash: {
    flex: 1, backgroundColor: C.bg,
    justifyContent: "center", alignItems: "center",
  },
  splashTitle: {
    fontSize: 36, fontStyle: "italic", color: C.ink,
    fontFamily: "Georgia",
  },

  // Main layout
  root: { flex: 1, backgroundColor: C.bg },

  // Fixed header
  header: {
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20, fontStyle: "italic", color: C.ink,
    fontFamily: "Georgia",
  },
  langBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 999, borderWidth: 1, borderColor: C.line,
  },
  langTxt: { fontSize: 12, fontWeight: "700", color: C.muted },
  langSep: { fontSize: 12, color: C.line },
  langActive: { color: C.accent },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  tabItem: {
    flex: 1, alignItems: "center", paddingTop: 12, paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 13, fontWeight: "600", color: C.muted,
  },
  tabLabelActive: {
    color: C.accent,
  },
  tabIndicator: {
    marginTop: 5, height: 2, width: 24,
    borderRadius: 1, backgroundColor: C.accent,
  },
});
