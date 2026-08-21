const PALETTE = [
  { bg: "#eef2ff", text: "#4338ca", solid: "#6366f1" }, // indigo
  { bg: "#ecfdf5", text: "#047857", solid: "#10b981" }, // emerald
  { bg: "#fff7ed", text: "#c2410c", solid: "#f97316" }, // orange
  { bg: "#fdf2f8", text: "#be185d", solid: "#ec4899" }, // pink
  { bg: "#eff6ff", text: "#1d4ed8", solid: "#3b82f6" }, // blue
  { bg: "#f5f3ff", text: "#6d28d9", solid: "#8b5cf6" }, // violet
  { bg: "#fefce8", text: "#a16207", solid: "#eab308" }, // yellow
  { bg: "#f0fdfa", text: "#0f766e", solid: "#14b8a6" }, // teal
  { bg: "#fef2f2", text: "#b91c1c", solid: "#ef4444" }, // red
];

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function colorFor(name: string) {
  const idx = hashName(name.trim().toLowerCase()) % PALETTE.length;
  return PALETTE[idx];
}
