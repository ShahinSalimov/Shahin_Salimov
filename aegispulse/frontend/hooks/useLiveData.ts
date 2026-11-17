"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE, api, ApiError } from "@/lib/api";
import type { Company, Telemetry, ThreatDetail, ThreatSummary } from "@/lib/types";

export type Connection = "connecting" | "live" | "polling" | "offline";

const POLL_FALLBACK_MS = 4000;
const SAFETY_POLL_MS = 20000;

/**
 * Dashboard data source. Real-time updates arrive over Server-Sent Events from
 * /api/stream; if SSE drops (proxies, network), the hook falls back to polling
 * until the stream recovers. `version` increments on every change so dependent
 * views (the inspector) can refetch.
 */
export function useLiveData() {
  const [company, setCompany] = useState<Company | null>(null);
  const [threats, setThreats] = useState<ThreatSummary[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [version, setVersion] = useState(0);
  const companyRef = useRef<Company | null>(null);
  const inflight = useRef(false);
  const pending = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      pending.current = true;
      return;
    }
    inflight.current = true;
    try {
      let current = companyRef.current;
      if (!current) {
        const companies = await api.companies();
        current = companies[0] ?? null;
        companyRef.current = current;
        setCompany(current);
      }
      const [list, tel] = await Promise.all([api.threats(current?.id), api.telemetry()]);
      setThreats(list.items);
      setTelemetry(tel);
      setError(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load dashboard data");
    } finally {
      inflight.current = false;
      setLoading(false);
      if (pending.current) {
        pending.current = false;
        void refresh();
      }
    }
  }, []);

  const replaceCompany = useCallback(
    (next: Company) => {
      companyRef.current = next;
      setCompany(next);
      void refresh();
    },
    [refresh],
  );

  // Initial load + SSE subscription.
  useEffect(() => {
    void refresh();
    let source: EventSource | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource(`${API_BASE}/stream`);
      source.addEventListener("open", () => setConnection("live"));
      source.addEventListener("update", () => {
        setConnection("live");
        clearTimeout(debounce);
        debounce = setTimeout(() => void refresh(), 250);
      });
      source.addEventListener("error", () => {
        setConnection(navigator.onLine ? "polling" : "offline");
        source?.close();
        retry = setTimeout(connect, 5000);
      });
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(debounce);
      clearTimeout(retry);
      source?.close();
    };
  }, [refresh]);

  // Polling: fast while SSE is down, slow safety net otherwise.
  useEffect(() => {
    const interval = setInterval(() => void refresh(), connection === "live" ? SAFETY_POLL_MS : POLL_FALLBACK_MS);
    return () => clearInterval(interval);
  }, [connection, refresh]);

  return { company, threats, telemetry, loading, error, connection, version, refresh, replaceCompany };
}

export function useThreatDetail(threatId: string | null, version: number) {
  const [detail, setDetail] = useState<ThreatDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localVersion, setLocalVersion] = useState(0);

  useEffect(() => {
    if (!threatId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading((prev) => prev || detail?.id !== threatId);
    api
      .threat(threatId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load threat");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detail is read only to decide the spinner
  }, [threatId, version, localVersion]);

  const reload = useCallback(() => setLocalVersion((v) => v + 1), []);
  return { detail: detail?.id === threatId ? detail : null, loading, error, reload };
}
