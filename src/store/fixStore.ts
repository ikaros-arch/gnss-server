import { EventEmitter } from "node:events";
import type { Fix } from "./fix.js";

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
}
