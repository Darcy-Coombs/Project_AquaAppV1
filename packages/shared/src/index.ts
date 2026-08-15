export const AQUA_SCALE = 100n;
export const FIELDKIT_VERSION = "1.0.2";
export const WEEKLY_UBI_AQUA = 480n * AQUA_SCALE;
export const TRANSACTION_TAX_BASIS_POINTS = 400n;
export const BASIS_POINTS = 10_000n;
export const GENESIS_EARTH_SUPPLY = 300_000_000_000_000n * AQUA_SCALE;
export const EARTH_UBI_CAP_PER_ACCOUNT = 100_000n * AQUA_SCALE;
export const PROXY_MAX_DEPTH = 5;

export type RuntimeMode = "development" | "test" | "production";

export type AquaConfig = {
  mode: RuntimeMode;
  betaOverrideEnabled: boolean;
  nodeUrl: string;
};

export function loadConfig(overrides: Partial<AquaConfig> = {}): AquaConfig {
  const mode = overrides.mode ?? ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV as RuntimeMode | undefined) ?? "development";
  const betaOverrideEnabled = overrides.betaOverrideEnabled ?? mode !== "production";
  const config: AquaConfig = {
    mode,
    betaOverrideEnabled,
    nodeUrl: overrides.nodeUrl ?? "http://127.0.0.1:8787"
  };
  assertProductionSafe(config);
  return config;
}

export function assertProductionSafe(config: AquaConfig): void {
  if (config.mode === "production" && config.betaOverrideEnabled) {
    throw new Error("BETAoverride must be disabled in production builds");
  }
}

export function aqua(amount: number): bigint {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount * 100)) {
    throw new Error("Aqua amount must be finite with at most 2 decimal places");
  }
  return BigInt(Math.round(amount * 100));
}

export function formatAqua(minor: bigint): string {
  const sign = minor < 0n ? "-" : "";
  const value = minor < 0n ? -minor : minor;
  const whole = value / AQUA_SCALE;
  const cents = `${value % AQUA_SCALE}`.padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}
