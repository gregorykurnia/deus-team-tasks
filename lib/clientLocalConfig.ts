import { BUILTIN_COLS, ColConfig, DEFAULT_FIELD_OPTIONS, FieldOptionsMap, TableKey } from "./clientTypes";

const OPTIONS_KEY = "clients_dp_options";
const COL_CONFIG_KEY = "clients_col_config";

const TABLE_KEYS: TableKey[] = ["main", "raw", "hold"];

export function loadFieldOptions(): FieldOptionsMap {
  if (typeof window === "undefined") return JSON.parse(JSON.stringify(DEFAULT_FIELD_OPTIONS));
  try {
    const s = window.localStorage.getItem(OPTIONS_KEY);
    return s ? JSON.parse(s) : JSON.parse(JSON.stringify(DEFAULT_FIELD_OPTIONS));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_FIELD_OPTIONS));
  }
}

export function saveFieldOptions(options: FieldOptionsMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
}

function initColConfig(): ColConfig {
  const cfg = {} as ColConfig;
  TABLE_KEYS.forEach((tk) => {
    cfg[tk] = BUILTIN_COLS[tk].map((bc) => ({ ...bc, visible: true, custom: false }));
  });
  return cfg;
}

export function loadColConfig(): ColConfig {
  if (typeof window === "undefined") return initColConfig();
  try {
    const s = window.localStorage.getItem(COL_CONFIG_KEY);
    if (!s) return initColConfig();
    const cfg = JSON.parse(s) as ColConfig;
    TABLE_KEYS.forEach((tk) => {
      if (!cfg[tk]) {
        cfg[tk] = BUILTIN_COLS[tk].map((bc) => ({ ...bc, visible: true, custom: false }));
        return;
      }
      BUILTIN_COLS[tk].forEach((bc) => {
        if (!cfg[tk].find((c) => c.key === bc.key)) {
          const firstCustom = cfg[tk].findIndex((c) => c.custom);
          const col = { ...bc, visible: true, custom: false };
          if (firstCustom >= 0) cfg[tk].splice(firstCustom, 0, col);
          else cfg[tk].push(col);
        }
      });
    });
    return cfg;
  } catch {
    return initColConfig();
  }
}

export function saveColConfig(cfg: ColConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COL_CONFIG_KEY, JSON.stringify(cfg));
}
