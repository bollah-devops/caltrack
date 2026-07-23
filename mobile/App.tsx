/**
 * CalTrack — app entry point.
 *
 * Boot sequence:
 *   1. getProfile() opens the SQLite DB and runs schema migrations.
 *   2. No profile → OnboardingScreen (saves profile on completion).
 *   3. Profile exists → main app: TodayScreen + HistoryScreen tabs.
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
import { getProfile, Profile } from "./src/db/localStore";
import { Lang, makeT } from "./src/lib/i18n";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import TodayScreen from "./src/screens/TodayScreen";
import HistoryScreen from "./src/screens/HistoryScreen";

const C = {
  bg: "#FCF8FA", card: "#FFF", ink: "#33202B", muted: "#8A6E7C",
  line: "#EFE2E8", accent: "#B93A6A",
};

type Tab = "today" | "history";

export default function App() {
  const [ready, setReady]     = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab]         = useState<Tab>("today");

  const lang: Lang = (profile?.lang as Lang | undefined) ?? "fr";
  const t = makeT(lang);

  // Open DB + load profile on first render
  useEffect(() => {
    getProfile()
      .then((p) => { setProfile(p); setReady(true); })
      .catch(() => setReady(true)); // show onboarding if DB fails to open
  }, []);

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
        <OnboardingScreen
          lang={lang}
          onComplete={async () => {
            // saveProfile() was already called inside OnboardingScreen;
            // just re-fetch so App re-renders with the stored profile.
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

      {/* Active screen */}
      <View style={{ flex: 1 }}>
        {tab === "today"
          ? <TodayScreen lang={lang} />
          : <HistoryScreen lang={lang} />}
      </View>

      {/* Tab bar — two plain pressable buttons, no navigation library */}
      <View style={styles.tabBar}>
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

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingBottom: 24, // safe area for Android nav bar / iOS home indicator
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
