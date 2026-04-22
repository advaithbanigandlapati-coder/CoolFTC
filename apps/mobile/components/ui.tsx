import React from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { C } from "../lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.card, style]}>{children}</View>
  );
}

export function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

export function Input({ value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, numberOfLines, onSubmitEditing, autoCapitalize, autoFocus, returnKeyType }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string;
  secureTextEntry?: boolean; keyboardType?: "default" | "numeric" | "email-address";
  multiline?: boolean; numberOfLines?: number;
  onSubmitEditing?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoFocus?: boolean;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
}) {
  return (
    <TextInput
      style={[styles.input, multiline && { height: (numberOfLines ?? 3) * 20 + 24, textAlignVertical: "top" }]}
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={C.text3} secureTextEntry={secureTextEntry}
      keyboardType={keyboardType} multiline={multiline}
      onSubmitEditing={onSubmitEditing} autoCapitalize={autoCapitalize}
      autoFocus={autoFocus} returnKeyType={returnKeyType}
    />
  );
}

export function Btn({ label, onPress, variant = "primary", disabled, loading, style }: {
  label: string; onPress: () => void; variant?: "primary" | "ghost" | "danger";
  disabled?: boolean; loading?: boolean; style?: object;
}) {
  const bg = variant === "primary" ? C.accent : variant === "danger" ? C.redDim : "transparent";
  const border = variant === "ghost" ? C.border2 : variant === "danger" ? C.red : "transparent";
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, borderWidth: 1, opacity: disabled ? 0.5 : 1 }, style]}>
      {loading ? <ActivityIndicator color={C.text} size="small" />
               : <Text style={styles.btnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const colors: Record<string, [string, string]> = {
    OPTIMAL: [C.greenDim, C.green], MID: [C.amberDim, C.amber], BAD: [C.redDim, C.red],
  };
  const [bg, fg] = colors[tier] ?? [C.surface2, C.text2];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: fg + "50" }}>
      <Text style={{ color: fg, fontSize: 10, fontFamily: "mono", letterSpacing: 1 }}>{tier}</Text>
    </View>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 1, backgroundColor: C.border, borderRadius: 8, overflow: "hidden" }}>
      {items.map(({ label, value }) => (
        <View key={label} style={{ flex: 1, backgroundColor: C.surface, padding: 10, alignItems: "center" }}>
          <Text style={{ color: C.text, fontFamily: "mono", fontSize: 15, fontWeight: "500" }}>{String(value)}</Text>
          <Text style={{ color: C.text2, fontFamily: "mono", fontSize: 9, marginTop: 2, letterSpacing: 1 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16 },
  label: { color: C.text2, fontSize: 10, fontFamily: "mono", letterSpacing: 2, marginBottom: 6, textTransform: "uppercase" },
  input: { backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14 },
  btn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  btnText: { color: C.text, fontSize: 14, fontWeight: "600" },
  sectionHeader: { color: C.accent, fontSize: 10, fontFamily: "mono", letterSpacing: 3, textTransform: "uppercase", marginBottom: 12, marginTop: 4 },
});
