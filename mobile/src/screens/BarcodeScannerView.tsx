/**
 * BarcodeScannerView — full-screen camera with barcode detection.
 *
 * Rendered inside the Add Food modal (modalView === "scanner"), not as a
 * separate Modal, to avoid iOS nested-sheet issues.
 *
 * Supports EAN-13, EAN-8, UPC-A, UPC-E (common on packaged goods).
 * Fires onScanned() once then freezes until the parent resets the view.
 */

import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Lang, makeT } from "../lib/i18n";
import { C } from "../lib/theme";

const { width: SW, height: SH } = Dimensions.get("window");
const VF_SIZE = Math.min(SW * 0.65, 240); // viewfinder square side

interface Props {
  lang: Lang;
  onScanned: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScannerView({ lang, onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const t = makeT(lang);

  // ── Permission not yet resolved ──
  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  // ── Permission denied or not granted ──
  if (!permission.granted) {
    return (
      <View style={s.permView}>
        <Text style={s.permTitle}>{t("camera_permission")}</Text>
        <Pressable style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnTxt}>{t("grant_permission")}</Text>
        </Pressable>
        <Pressable onPress={onClose} style={{ marginTop: 16 }}>
          <Text style={s.cancelTxt}>{lang === "fr" ? "Annuler" : "Cancel"}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera active ──
  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
        onBarcodeScanned={
          scanned
            ? undefined
            : ({ data }) => {
                setScanned(true);
                onScanned(data);
              }
        }
      />

      {/* Viewfinder overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Top mask */}
        <View style={[s.mask, { height: (SH - VF_SIZE) / 2 }]} />
        {/* Middle row */}
        <View style={s.middleRow}>
          <View style={[s.mask, { width: (SW - VF_SIZE) / 2 }]} />
          {/* Viewfinder cutout */}
          <View style={s.viewfinder}>
            <View style={[s.corner, s.tl]} />
            <View style={[s.corner, s.tr]} />
            <View style={[s.corner, s.bl]} />
            <View style={[s.corner, s.br]} />
          </View>
          <View style={[s.mask, { width: (SW - VF_SIZE) / 2 }]} />
        </View>
        {/* Bottom mask */}
        <View style={[s.mask, { flex: 1 }]}>
          <Text style={s.hint}>
            {scanned ? (lang === "fr" ? "Chargement…" : "Loading…") : t("scanning")}
          </Text>
        </View>
      </View>

      {/* Close button */}
      <Pressable style={s.closeBtn} onPress={onClose}>
        <Text style={s.closeTxt}>✕</Text>
      </Pressable>
    </View>
  );
}

const CORNER = 20;
const BORDER = 3;

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Permission screen
  permView: {
    flex: 1, justifyContent: "center", alignItems: "center",
    padding: 32, backgroundColor: C.bg,
  },
  permTitle: { fontSize: 15, color: C.ink, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  permBtn:   {
    backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 24,
  },
  permBtnTxt:{ color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelTxt: { color: C.muted, fontSize: 14 },

  // Viewfinder
  mask:      { backgroundColor: "rgba(0,0,0,0.55)" },
  middleRow: { flexDirection: "row", height: VF_SIZE },
  viewfinder:{ width: VF_SIZE, height: VF_SIZE },
  hint: {
    color: "#fff", fontSize: 13, textAlign: "center",
    marginTop: 20, opacity: 0.85,
  },

  // Corner accents (L-shaped, using border on only two sides)
  corner: {
    position: "absolute",
    width: CORNER, height: CORNER,
    borderColor: C.accent,
  },
  tl: { top: 0,  left: 0,  borderTopWidth: BORDER, borderLeftWidth: BORDER },
  tr: { top: 0,  right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  bl: { bottom: 0, left: 0,  borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  br: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },

  // Close button (top-right overlay)
  closeBtn: {
    position: "absolute", top: 16, right: 16,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20,
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
  },
  closeTxt: { color: "#fff", fontSize: 16 },
});
