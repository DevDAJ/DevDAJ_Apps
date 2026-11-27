export const colors = {
  background: "#0b100c",
  surface: "#111813",
  surfaceRaised: "#172019",
  surfacePressed: "#1d2a20",
  border: "#26362a",
  borderStrong: "#35503b",
  text: "#f3f7f3",
  textSecondary: "#b7c4b9",
  textMuted: "#869488",
  brand: "#22c55e",
  brandPressed: "#16a34a",
  brandMuted: "#12301d",
  onBrand: "#06130a",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#fb7185",
  dangerSolid: "#e11d48",
  overlay: "rgba(2, 8, 4, 0.76)",
  shadow: "#000000",
  transparent: "transparent",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screen: 20,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  full: 999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

export const theme = { colors, spacing, radii, fontSizes } as const;
