// Environment configuration (secrets and infrastructure). Business settings
// that you tune from the dashboard live in the database (see settings.ts).

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (!v) return fallback;
  return ["1", "true", "yes", "on"].includes(v);
}

export type EbayEnv = "production" | "sandbox";

export function loadConfig() {
  const ebayEnv: EbayEnv = env("EBAY_ENV", "production") === "sandbox" ? "sandbox" : "production";
  return {
    port: Number(env("PORT", "3000")),
    // 127.0.0.1 = only this computer. 0.0.0.0 = reachable from the network (server/Docker).
    host: env("HOST", "127.0.0.1"),
    backupDir: env("BACKUP_DIR", "data/backups"),
    backupKeep: Number(env("BACKUP_KEEP", "14")),
    dbPath: env("DB_PATH", "data/dropship.db"),
    dashboardPassword: env("DASHBOARD_PASSWORD"),
    // DRY_RUN=true: nothing is written to eBay or CJ. Everything else runs.
    dryRun: bool("DRY_RUN", true),
    // DEMO_SUPPLIER=true: use the built-in fake supplier (no CJ key needed).
    demoSupplier: bool("DEMO_SUPPLIER", false),
    ebay: {
      env: ebayEnv,
      clientId: env("EBAY_CLIENT_ID"),
      clientSecret: env("EBAY_CLIENT_SECRET"),
      ruName: env("EBAY_RUNAME"),
      marketplaceId: env("EBAY_MARKETPLACE_ID", "EBAY_US"),
      currency: env("EBAY_CURRENCY", "USD"),
      apiBase: ebayEnv === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
      authBase: ebayEnv === "sandbox" ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com",
    },
    cj: {
      apiKey: env("CJ_API_KEY"),
      baseUrl: env("CJ_BASE_URL", "https://developers.cjdropshipping.com/api2.0/v1"),
    },
    anthropic: {
      apiKey: env("ANTHROPIC_API_KEY"),
      model: env("ANTHROPIC_MODEL", "claude-opus-5-5"),
    },
    telegram: {
      botToken: env("TELEGRAM_BOT_TOKEN"),
      chatId: env("TELEGRAM_CHAT_ID"),
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** Problems that must stop the app from starting (Azerbaijani, shown in the console). */
export function startupErrors(cfg: Config): string[] {
  const errors: string[] = [];
  if (!LOCAL_HOSTS.has(cfg.host) && cfg.dashboardPassword.length < 10) {
    errors.push(
      `HOST=${cfg.host} ilə panel internetdən açıq olur. DASHBOARD_PASSWORD ən azı 10 simvol olmalıdır.`,
    );
  }
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) errors.push(`PORT yanlışdır: ${cfg.port}`);
  return errors;
}
