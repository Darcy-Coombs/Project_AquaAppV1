import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventDag } from '../protocol/dag.ts';
import { type AquaEvent } from '../protocol/event.ts';
import { validateBaseEvent } from '../protocol/validation.ts';
import { exportBundle, readBundle } from '../gossip/bundles.ts';
import { validateModuleEvent } from './module-validation.ts';

export class NodeStorage {
  dir: string;
  eventsPath: string;
  dag = new EventDag();

  constructor(dir: string) {
    this.dir = dir;
    this.eventsPath = join(dir, 'events.jsonl');
    mkdirSync(dir, { recursive: true });
    this.load();
  }

  load() {
    if (!existsSync(this.eventsPath)) return;
    const lines = readFileSync(this.eventsPath, 'utf8').split(/\r?\n/).filter(Boolean);
    for (const line of lines) this.dag.add(JSON.parse(line));
  }

  addEvent(event: AquaEvent): boolean {
    const check = validateBaseEvent(event);
    if (!check.ok) return false;
    const moduleCheck = validateModuleEvent(event, this.appliedEvents());
    if (!moduleCheck.ok) return false;
    if (this.dag.get(event.id)) return false;
    this.dag.add(event);
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`);
    return true;
  }

  allEvents() {
    return this.dag.all();
  }

  appliedEvents() {
    return this.dag.validApplied();
  }

  ids() {
    return this.dag.ids();
  }

  exportBundle() {
    return exportBundle(this.allEvents());
  }

  importBundle(input: any): number {
    let count = 0;
    for (const event of readBundle(input)) {
      if (this.addEvent(event)) count++;
    }
    return count;
  }

  snapshot(path = join(this.dir, 'snapshot.json')) {
    writeFileSync(path, JSON.stringify(this.exportBundle(), null, 2));
    return path;
  }
}
