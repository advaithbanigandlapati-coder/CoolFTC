/**
 * CoolFTC design tokens — black & orange system
 * packages/ui/src/theme/colors.ts
 */
export const colors = {
  bg:       "#07070A",
  bg2:      "#0C0C12",
  bg3:      "#121219",
  surface:  "#18181F",
  surface2: "#1F1F28",
  surface3: "#272730",

  border:   "rgba(255,255,255,0.065)",
  border2:  "rgba(255,255,255,0.11)",
  border3:  "rgba(255,255,255,0.17)",

  text:     "#EAE8DE",
  text2:    "#6E6E68",
  text3:    "#2E2E30",
  text4:    "#A0A09A",

  accent:       "#FF5A1F",
  accentLight:  "#FF7A45",
  accentDim:    "rgba(255,90,31,0.12)",
  accentGlow:   "rgba(255,90,31,0.22)",

  green:    "#2DD88A",
  greenDim: "rgba(45,216,138,0.08)",
  greenB:   "rgba(45,216,138,0.2)",

  amber:    "#F5A623",
  amberDim: "rgba(245,166,35,0.09)",
  amberB:   "rgba(245,166,35,0.22)",

  red:      "#EF4545",
  redDim:   "rgba(239,69,69,0.09)",
  redB:     "rgba(239,69,69,0.22)",

  blue:     "#5B9CF4",
  blueDim:  "rgba(91,156,244,0.09)",
  blueB:    "rgba(91,156,244,0.22)",
} as const;

export const tierColor: Record<string, string> = {
  OPTIMAL: colors.green,
  MID:     colors.amber,
  BAD:     colors.red,
};

export const roleColor: Record<string, string> = {
  admin:    colors.accent,
  analyst:  colors.blue,
  scout:    colors.green,
  viewer:   colors.text2,
};
