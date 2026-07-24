/**
 * CalTrack — app entry point.
 *
 * Boot sequence:
 *   1. getProfile() opens SQLite and runs schema migrations.
 *   2. No profile → OnboardingScreen.
 *   3. Profile → 3-tab app: Home | History | Weight.
 *
 * Features:
 *   - Fixed header: app title + FR/EN language toggle
 *   - 3-tab bottom bar with Ionicons, safe-area insets
 *   - Home tab passes onGoToWeight so the quick-action can switch tabs
 */

import { Ionicons } from "@expo/vector-icons";
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
import { getProfile, Profile, saveProfile } from "./src/db/localStore";
import { Lang, makeT, resolveDefaultLang } from "./src/lib/i18n";
import { C } from "./src/lib/theme";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import WeightScreen from "./src/screens/WeightScreen";

type Tab = "home" | "history" | "weight" | "settings";

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
  const [tab, setTab]         = useState<Tab>("home");

  const t = makeT(lang);

  useEffect(() => {
    const deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    getProfile()
      .then((p) => {
        setProfile(p);
        setLang(resolveDefaultLang(deviceLocale, p?.lang as Lang | undefined));
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

  // ── Splash ────────────────────────────────────────────────────────────────
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
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.headerTitle}>CalTrack</Text>
          <LangToggle lang={lang} onToggle={toggleLang} />
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
        <LangToggle lang={lang} onToggle={toggleLang} />
      </View>

      {/* Screen area — all 3 tabs stay mounted, visibility toggled */}
      <View style={{ flex: 1 }}>
        <View style={[StyleSheet.absoluteFill, { display: tab === "home" ? "flex" : "none" }]}>
          <HomeScreen lang={lang} onGoToWeight={() => setTab("weight")} />
        </View>
        <View style={[StyleSheet.absoluteFill, { display: tab === "history" ? "flex" : "none" }]}>
          <HistoryScreen lang={lang} />
        </View>
        <View style={[StyleSheet.absoluteFill, { display: tab === "weight" ? "flex" : "none" }]}>
          <WeightScreen lang={lang} />
        </View>
        <View style={[StyleSheet.absoluteFill, { display: tab === "settings" ? "flex" : "none" }]}>
          <OnboardingScreen
            lang={lang}
            initialProfile={profile ?? undefined}
            onComplete={async () => {
              const p = await getProfile();
              setProfile(p);
              setTab("home");
            }}
          />
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TabItem
          icon="home"
          label={t("tab_home")}
          active={tab === "home"}
          onPress={() => setTab("home")}
        />
        <TabItem
          icon="time"
          label={t("tab_history")}
          active={tab === "history"}
          onPress={() => setTab("history")}
        />
        <TabItem
          icon="barbell"
          label={t("tab_weight")}
          active={tab === "weight"}
          onPress={() => setTab("weight")}
        />
        <TabItem
          icon="person"
          label={t("tab_settings")}
          active={tab === "settings"}
          onPress={() => setTab("settings")}
        />
      </View>
    </View>
  );
}

// ─── TabItem ──────────────────────────────────────────────────────────────────

function TabItem({
  icon, label, active, onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const color = active ? C.accent : C.muted;
  const iconName = (active ? icon : `${icon}-outline`) as keyof typeof Ionicons.glyphMap;
  return (
    <Pressable style={styles.tabItem} onPress={onPress}>
      <Ionicons name={iconName} size={22} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ─── LangToggle ───────────────────────────────────────────────────────────────

function LangToggle({ lang, onToggle }: { lang: Lang; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={styles.langBtn}>
      <Text style={[styles.langTxt, lang === "fr" && styles.langActive]}>FR</Text>
      <Text style={styles.langSep}>/</Text>
      <Text style={[styles.langTxt, lang === "en" && styles.langActive]}>EN</Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Splash
  splash: {
    flex: 1, backgroundColor: C.bg,
    justifyContent: "center", alignItems: "center",
  },
  splashTitle: {
    fontSize: 36, fontStyle: "italic", color: C.ink, fontFamily: "Georgia",
  },

  // Root
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20, fontStyle: "italic", color: C.ink, fontFamily: "Georgia",
  },

  // Lang toggle
  langBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 999, borderWidth: 1, borderColor: C.line,
  },
  langTxt:    { fontSize: 12, fontWeight: "700", color: C.muted },
  langSep:    { fontSize: 12, color: C.line },
  langActive: { color: C.accent },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  tabItem: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 10, paddingBottom: 4, gap: 3,
  },
  tabLabel: { fontSize: 11, fontWeight: "600" },
});
