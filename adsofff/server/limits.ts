/** In-memory daily usage limiter (per client and global). Resets at UTC midnight. */
export class DailyLimiter {
  private day = '';
  private perClient = new Map<string, number>();
  private total = 0;

  constructor(
    private readonly limitPerClient: number,
    private readonly limitTotal: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private roll() {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.perClient.clear();
      this.total = 0;
    }
  }

  remaining(client: string): number {
    this.roll();
    return Math.max(0, Math.min(this.limitPerClient - (this.perClient.get(client) ?? 0), this.limitTotal - this.total));
  }

  /** Returns true and records usage if the request is allowed. */
  take(client: string): boolean {
    if (this.remaining(client) <= 0) return false;
    this.perClient.set(client, (this.perClient.get(client) ?? 0) + 1);
    this.total += 1;
    return true;
  }
}
