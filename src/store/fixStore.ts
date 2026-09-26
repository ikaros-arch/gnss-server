import { EventEmitter } from "node:events";
import type { Fix } from "@ikaros-arch/gnss-core";

export class FixStore extends EventEmitter {
  private latest = new Map<string, Fix>();

  set(fix: Fix): void {
    this.latest.set(fix.antennaId, fix);
    this.emit("fix", fix);
  }

  get(antennaId: string): Fix | undefined {
    return this.latest.get(antennaId);
  }

  all(): Fix[] {
    return [...this.latest.values()];
  }

  ids(): string[] {
    return [...this.latest.keys()];
  }

  /** Remove all antennas whose last fix is older than `maxAgeMs` milliseconds.
   *  Returns the IDs that were removed. */
  purge(maxAgeMs: number): string[] {
    const cutoff = Date.now() - maxAgeMs;
    const removed: string[] = [];
    for (const [id, fix] of this.latest) {
      if (new Date(fix.conn.lastByteAt).getTime() < cutoff) {
        this.latest.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}
