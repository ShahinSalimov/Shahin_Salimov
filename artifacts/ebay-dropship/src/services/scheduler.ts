import type { Engine } from "./engine.ts";

type JobName = "orders" | "tracking" | "sync" | "research";

export type JobState = { lastRun: Date | null; nextRun: Date | null; running: boolean };

export class Scheduler {
  private engine: Engine;
  private timer: NodeJS.Timeout | null = null;
  state: Record<JobName, JobState> = {
    orders: { lastRun: null, nextRun: null, running: false },
    tracking: { lastRun: null, nextRun: null, running: false },
    sync: { lastRun: null, nextRun: null, running: false },
    research: { lastRun: null, nextRun: null, running: false },
  };

  constructor(engine: Engine) {
    this.engine = engine;
  }

  private interval(job: JobName): number {
    const s = this.engine.settings();
    const min = { orders: s.ordersEveryMin, tracking: s.trackingEveryMin, sync: s.syncEveryMin, research: s.researchEveryMin }[job];
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
    for (const job of ["orders", "tracking", "sync", "research"] as JobName[]) {
      const st = this.state[job];
      if (st.running) continue;
      if (!st.nextRun || st.nextRun.getTime() <= Date.now()) await this.run(job);
    }
  }

  start(): void {
    // Stagger the first runs so startup is quick.
    const now = Date.now();
    this.state.orders.nextRun = new Date(now + 10_000);
    this.state.tracking.nextRun = new Date(now + 60_000);
    this.state.sync.nextRun = new Date(now + 5 * 60_000);
    this.state.research.nextRun = new Date(now + 10 * 60_000);
    this.timer = setInterval(() => void this.tick(), 15_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
