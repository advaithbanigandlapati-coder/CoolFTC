export const C = {
  bg: "#07070A", bg2: "#0C0C12", bg3: "#121219",
  surface: "#18181F", surface2: "#1F1F28",
  border: "rgba(255,255,255,0.065)", border2: "rgba(255,255,255,0.11)",
  text: "#EAE8DE", text2: "#6E6E68", text3: "#2E2E30", text4: "#A0A09A",
  accent: "#FF5A1F", accentDim: "rgba(255,90,31,0.15)",
  green: "#2DD88A", greenDim: "rgba(45,216,138,0.12)",
  amber: "#F5A623", amberDim: "rgba(245,166,35,0.12)",
  red: "#EF4545", redDim: "rgba(239,69,69,0.12)",
  blue: "#5B9CF4",
} as const;

export const tierColor: Record<string, string> = {
  OPTIMAL: C.green, MID: C.amber, BAD: C.red,
};
