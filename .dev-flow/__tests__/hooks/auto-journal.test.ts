import { describe, expect, it } from 'vitest';
import { deriveJournalAction } from '../../hooks/auto-journal.js';

describe('auto-journal: deriveJournalAction', () => {
  it('returns null when tool is not Write', () => {
    expect(deriveJournalAction({ tool_name: 'Read', tool_input: { file_path: 'tickets/PROJ-1/x.md' } })).toBeNull();
  });

  it('returns null when no file_path', () => {
    expect(deriveJournalAction({ tool_name: 'Write', tool_input: {} })).toBeNull();
  });

  it('returns null when path is outside tickets/', () => {
    expect(deriveJournalAction({ tool_name: 'Write', tool_input: { file_path: 'src/foo.ts' } })).toBeNull();
  });

  it('extracts ticket + filename from a tickets/* relative path', () => {
    expect(deriveJournalAction({
      tool_name: 'Write',
      tool_input: { file_path: 'tickets/PROJ-123/01-INTAKE.md' },
    })).toEqual({ ticket: 'PROJ-123', filename: '01-INTAKE.md' });
  });

  it('extracts ticket + filename from a tickets/* absolute path under cwd', () => {
    expect(deriveJournalAction({
      tool_name: 'Write',
      cwd: '/repo',
      tool_input: { file_path: '/repo/tickets/PROJ-9/04-IMPLEMENTATION.md' },
    })).toEqual({ ticket: 'PROJ-9', filename: '04-IMPLEMENTATION.md' });
  });

  it('uses basename for nested paths under tickets/<TICKET>/', () => {
    expect(deriveJournalAction({
      tool_name: 'Write',
      tool_input: { file_path: 'tickets/PROJ-1/evidence/2026-05-15/trace.zip' },
    })).toEqual({ ticket: 'PROJ-1', filename: 'trace.zip' });
  });
});
