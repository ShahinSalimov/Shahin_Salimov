import type {
  AlertChannel,
  AlertLog,
  AlertPreview,
  CollectorStatus,
  Company,
  Patch,
  PatchSimulation,
  Scenario,
  StackComponent,
  Telemetry,
  ThreatDetail,
  ThreatSummary,
} from "./types";

export const API_BASE = "/api/backend";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d)))
      .join("; ");
  }
  return "Request failed";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Network error: dashboard cannot reach its server");
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (body.detail) message = describe(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  telemetry: () => request<Telemetry>("/telemetry"),
  companies: () => request<Company[]>("/companies"),
  updateStack: (companyId: string, techStack: StackComponent[]) =>
    request<Company>(`/companies/${companyId}/stack`, { method: "PUT", body: JSON.stringify({ tech_stack: techStack }) }),
  threats: (companyId?: string) =>
    request<{ items: ThreatSummary[]; total: number }>(
      `/threats?sort=priority&limit=200${companyId ? `&company_id=${companyId}` : ""}`,
    ),
  threat: (id: string) => request<ThreatDetail>(`/threats/${id}`),
  reanalyze: (id: string) => post<{ threat_id: string; status: string }>(`/threats/${id}/analyze`),
  dismiss: (id: string) => post<ThreatSummary>(`/threats/${id}/dismiss`),
  scenarios: () => request<Scenario[]>("/simulate-attack/scenarios"),
  simulateAttack: (scenarioId?: string) =>
    post<{ scenario: Scenario; threat_id: string; status: string }>("/simulate-attack", scenarioId ? { scenario_id: scenarioId } : {}),
  approvePatch: (id: string, reviewer = "soc-analyst") => post<Patch>(`/patches/${id}/approve`, { reviewer }),
  rejectPatch: (id: string, reviewer = "soc-analyst") => post<Patch>(`/patches/${id}/reject`, { reviewer }),
  simulatePatch: (id: string) => post<PatchSimulation>(`/patches/${id}/simulate`),
  alertPreview: (id: string, channel: AlertChannel) => request<AlertPreview>(`/threats/${id}/alert-preview?channel=${channel}`),
  collectors: () => request<CollectorStatus[]>("/collectors"),
  runCollector: (name: string) => post<CollectorStatus>(`/collectors/${encodeURIComponent(name)}/run`),
  dispatch: (id: string, channels: AlertChannel[]) => post<AlertLog[]>(`/threats/${id}/dispatch`, { channels }),
};

/** Download an export (STIX/CEF) through the proxy and save it with the server-provided filename. */
export async function downloadExport(threatId: string, format: "stix" | "cef"): Promise<void> {
  const res = await fetch(`${API_BASE}/threats/${threatId}/export/${format}`, { cache: "no-store" });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      message = describe(((await res.json()) as { detail?: unknown }).detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `aegispulse-${threatId}.${format === "stix" ? "json" : "cef"}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Clipboard write with a fallback for non-secure (plain HTTP) origins. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Clipboard unavailable");
}
