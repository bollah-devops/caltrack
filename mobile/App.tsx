/**
 * CalTrack — app entry point.
 *
 * Boot sequence:
 *   1. getProfile() opens SQLite and runs schema migrations.
 *   2. No profile → OnboardingScreen (language auto-detected from device locale).
 *   3. Profile → 4-tab app: Home | History | Weight | Profile.
 *
 * Language: detected from device locale on first run, stored in profile.
 * Changeable in the Profile tab. No header toggle.
 */

import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React, { Component, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { getProfile, Profile } from "./src/db/localStore";
import { Lang, makeT, resolveDefaultLang } from "./src/lib/i18n";
import { C } from "./src/lib/theme";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import WeightScreen from "./src/screens/WeightScreen";

type Tab = "home" | "history" | "weight" | "settings";

// ─── Global error collector ───────────────────────────────────────────────────
// Runs before React mounts, catches JS errors that happen during module init
// or in async code outside React's render tree.
const _preRenderErrors: string[] = [];
declare const ErrorUtils: { getGlobalHandler(): Function; setGlobalHandler(h: Function): void } | undefined;
try {
  if (typeof ErrorUtils !== "undefined") {
    const prev = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((e: Error, fatal: boolean) => {
      _preRenderErrors.push(
        `[${fatal ? "FATAL" : "ERROR"}] ${e?.message ?? String(e)}\n${e?.stack ?? "(no stack)"}`
      );
      prev?.(e, fatal);
    });
  }
} catch {}

// ─── Error display (pure inline styles — no theme/StyleSheet deps) ────────────

function ErrorScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{ padding: 20, paddingTop: 56 }}
    >
      <Text style={{ fontSize: 15, fontWeight: "700", color: "#c00", marginBottom: 4 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 10, color: "#333", lineHeight: 16 }}>
        {detail}
      </Text>
      {_preRenderErrors.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#c00", marginTop: 20, marginBottom: 4 }}>
            Pre-render errors:
          </Text>
          <Text style={{ fontSize: 10, color: "#333", lineHeight: 16 }}>
            {_preRenderErrors.join("\n\n---\n\n")}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ─── Error boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, info: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info: info.componentStack ?? "" });
  }
  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <ErrorScreen
          title={`Render crash: ${error.message}`}
          detail={`${error.stack ?? "(no stack)"}\n\nComponent stack:${info}`}
        />
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function AppInner() {
  const insets = useSafeAreaInsets();

  const [ready, setReady]         = useState(false);
  const [profile, setProfile]     = useState<Profile | null>(null);
  const [lang, setLang]           = useState<Lang>("fr");
  const [tab, setTab]             = useState<Tab>("home");
  const [bootError, setBootError] = useState<string | null>(null);

  const t = makeT(lang);

  useEffect(() => {
    let deviceLocale = "fr";
    try {
      deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {}

    getProfile()
      .then((p) => {
        setProfile(p);
        setLang(resolveDefaultLang(deviceLocale, p?.lang as Lang | undefined));
        setReady(true);
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        setBootError(
          `DB init failed: ${err.message}\n\n${err.stack ?? "(no stack)"}`
        );
        setLang(resolveDefaultLang(deviceLocale));
        setReady(true);
      });
  }, []);

  // Show DB / startup errors visibly so they can be reported
  if (bootError) {
    return <ErrorScreen title="Startup error — screenshot this" detail={bootError} />;
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
        </View>
        <OnboardingScreen
          lang={lang}
          onComplete={async () => {
            const p = await getProfile();
            setProfile(p);
            if (p?.lang) setLang(p.lang as Lang);
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
      </View>

      {/* Screen area — all 3 tabs stay mounted, visibility toggled */}
      <View style={{ flex: 1 }}>
        <View style={[StyleSheet.absoluteFill, { display: tab === "home" ? "flex" : "none" }]}>
          <HomeScreen lang={lang} onGoToWeight={() => setTab("weight")} profile={profile} />
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
              console.log("[CT] App onComplete read back dailyTarget=", p?.dailyTarget, "activity=", p?.activity);
              setProfile(p);
              if (p?.lang) setLang(p.lang as Lang);
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
    paddingHorizontal: 20, paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20, fontStyle: "italic", color: C.ink, fontFamily: "Georgia",
  },

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
