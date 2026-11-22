import type { Engine } from "./engine.ts";
import type { Ops } from "./ops.ts";

export type JobName = "orders" | "messages" | "cases" | "tracking" | "sync" | "finance" | "research";
export const JOBS: JobName[] = ["orders", "messages", "cases", "tracking", "sync", "finance", "research"];

export type JobState = { lastRun: Date | null; nextRun: Date | null; running: boolean };

export class Scheduler {
  private engine: Engine;
  private ops: Ops;
  private timer: NodeJS.Timeout | null = null;
  state = Object.fromEntries(JOBS.map((j) => [j, { lastRun: null, nextRun: null, running: false }])) as Record<JobName, JobState>;

  constructor(engine: Engine, ops: Ops) {
    this.engine = engine;
    this.ops = ops;
  }

  private interval(job: JobName): number {
    const s = this.engine.settings();
    const min = {
      orders: s.ordersEveryMin,
      messages: s.messagesEveryMin,
      cases: s.casesEveryMin,
      tracking: s.trackingEveryMin,
      sync: s.syncEveryMin,
      finance: s.financeEveryMin,
      research: s.researchEveryMin,
    }[job];
    return Math.max(5, min) * 60_000;
  }

  async run(job: JobName): Promise<void> {
    const st = this.state[job];
    st.running = true;
    try {
      await this.engine.exclusive<unknown>(job, (): Promise<unknown> => {
        switch (job) {
          case "orders":
            return this.engine.processOrders();
          case "tracking":
            return this.engine.updateTracking();
          case "sync":
            return this.engine.syncListings();
          case "research":
            return this.engine.runResearch();
          case "messages":
            return this.ops.syncMessages();
          case "cases":
            return this.ops.syncCases();
          case "finance":
            return this.ops.syncFinances();
        }
      });
    } finally {
      st.running = false;
      st.lastRun = new Date();
      st.nextRun = new Date(Date.now() + this.interval(job));
    }
  }

  private async tick(): Promise<void> {
    if (!this.engine.settings().automationEnabled) return;
    // Orders first: they are time-critical.
    for (const job of JOBS) {
      const st = this.state[job];
      if (st.running) continue;
      if (!st.nextRun || st.nextRun.getTime() <= Date.now()) await this.run(job);
    }
  }

  start(): void {
    // Stagger the first runs so startup is quick.
    const now = Date.now();
    const firstRun: Record<JobName, number> = { orders: 10, messages: 30, cases: 60, tracking: 90, finance: 180, sync: 300, research: 600 };
    for (const j of JOBS) this.state[j].nextRun = new Date(now + firstRun[j] * 1000);
    this.timer = setInterval(() => void this.tick(), 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
