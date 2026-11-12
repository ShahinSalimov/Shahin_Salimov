/** A scan problem whose message is safe and useful to show to the user. */
export class ScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanError";
  }
}
