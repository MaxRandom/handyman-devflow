import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ticketDir } from './state.js';

export interface JournalEntry {
  phase: string;
  step: string;
  status: 'ok' | 'fail' | 'skip';
  details?: string;
  ts?: string;
}

export function journalPath(root: string, ticket: string): string {
  return join(ticketDir(root, ticket), '.journal.jsonl');
}

export function append(root: string, ticket: string, entry: JournalEntry): void {
  const path = journalPath(root, ticket);
  mkdirSync(dirname(path), { recursive: true });
  const enriched = { ...entry, ts: entry.ts ?? new Date().toISOString() };
  appendFileSync(path, JSON.stringify(enriched) + '\n');
}

export function read(root: string, ticket: string): JournalEntry[] {
  const path = journalPath(root, ticket);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry);
}
