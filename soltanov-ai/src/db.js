import fs from "node:fs";
import path from "node:path";

// Small JSON-file store. One client per deployment => a document store on disk is
// enough, easy to back up (copy one file) and needs no database server.
// Writes are atomic (tmp file + rename) and serialized.

const EMPTY = () => ({
  version: 1,
  accounts: {}, // id -> { id, kind: 'trial'|'full', label, tokenHash|keyHash, status, createdAt, activatedAt, expiresAt, maxDevices, devices:{}, profile, usage, telegramChatId }
  sessions: {}, // sid -> { sid, accountId, deviceId, createdAt, lastSeen, revoked }
  ideas: {}, // accountId -> [idea]
  ads: {}, // accountId -> [adRequest]
  events: [], // audit log (bounded)
});

export class Store {
  constructor(dir, file = "db.json") {
    this.dir = dir;
    this.file = path.join(dir, file);
    fs.mkdirSync(dir, { recursive: true });
    this.data = fs.existsSync(this.file) ? { ...EMPTY(), ...JSON.parse(fs.readFileSync(this.file, "utf8")) } : EMPTY();
    this._timer = null;
    this._writing = Promise.resolve();
  }

  save() {
    // Coalesce bursts of writes into one disk write.
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, 50);
  }

  flush() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  log(type, payload = {}) {
    this.data.events.push({ at: new Date().toISOString(), type, ...payload });
    if (this.data.events.length > 2000) this.data.events.splice(0, this.data.events.length - 2000);
    this.save();
  }

  account(id) {
    return this.data.accounts[id] || null;
  }

  ideasOf(id) {
    return (this.data.ideas[id] ||= []);
  }

  adsOf(id) {
    return (this.data.ads[id] ||= []);
  }
}
