import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATES, addDays, createCase, setTaskDone, progress, overdueTasks, caseStatus, csvCell, auditCsv, sortCases,
} from '../src/checklist.js';

const NOW = '2026-10-11T09:00:00.000Z';
const leaver = () => createCase(
  { type: 'leaver', name: '  Sam Test ', role: 'Finance assistant', manager: 'Alex', keyDate: '2026-10-30' },
  { id: 'c1', now: NOW }
);

test('addDays handles month and year boundaries', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('addDays rejects an invalid date', () => {
  assert.throws(() => addDays('not-a-date', 1), /Invalid date/);
});

test('createCase builds every template task with a due date from the key date', () => {
  const c = leaver();
  assert.equal(c.name, 'Sam Test');
  assert.equal(c.tasks.length, TEMPLATES.leaver.length);
  assert.equal(c.tasks.find((t) => t.id === 'disable').due, '2026-10-30');
  assert.equal(c.tasks.find((t) => t.id === 'files').due, '2026-10-27');
  assert.equal(c.tasks.find((t) => t.id === 'licence').due, '2026-11-29');
  assert.equal(c.log.length, 1);
  assert.match(c.log[0].action, /Leaver case opened for Sam Test/);
});

test('createCase validates its input', () => {
  assert.throws(() => createCase({ type: 'contractor', name: 'A', keyDate: '2026-10-30' }, { id: 'x', now: NOW }), /Unknown case type/);
  assert.throws(() => createCase({ type: 'starter', name: '  ', keyDate: '2026-10-30' }, { id: 'x', now: NOW }), /name is required/);
  assert.throws(() => createCase({ type: 'starter', name: 'A', keyDate: '30/10/2026' }, { id: 'x', now: NOW }), /valid date/);
});

test('completing a task records who and when, and adds to the audit log', () => {
  const c = setTaskDone(leaver(), 'disable', true, 'VB', '2026-10-30T17:05:00.000Z');
  const task = c.tasks.find((t) => t.id === 'disable');
  assert.equal(task.doneBy, 'VB');
  assert.equal(task.doneAt, '2026-10-30T17:05:00.000Z');
  assert.equal(c.log.at(-1).action, `Completed: ${task.title}`);
});

test('setTaskDone does not change the original case', () => {
  const original = leaver();
  setTaskDone(original, 'disable', true, 'VB', NOW);
  assert.equal(original.tasks.find((t) => t.id === 'disable').doneAt, null);
});

test('reopening a task clears it and is logged', () => {
  let c = setTaskDone(leaver(), 'device', true, 'VB', NOW);
  c = setTaskDone(c, 'device', false, 'VB', NOW);
  assert.equal(c.tasks.find((t) => t.id === 'device').doneAt, null);
  assert.match(c.log.at(-1).action, /^Reopened/);
});

test('initials are required to sign off a task, and unknown tasks are rejected', () => {
  assert.throws(() => setTaskDone(leaver(), 'disable', true, ' ', NOW), /Initials/);
  assert.throws(() => setTaskDone(leaver(), 'nope', true, 'VB', NOW), /Unknown task/);
});

test('progress counts completed tasks', () => {
  let c = leaver();
  assert.deepEqual(progress(c), { done: 0, total: 7, percent: 0 });
  c = setTaskDone(c, 'disable', true, 'VB', NOW);
  c = setTaskDone(c, 'sessions', true, 'VB', NOW);
  assert.deepEqual(progress(c), { done: 2, total: 7, percent: 29 });
});

test('overdue means not done and due before today', () => {
  const c = setTaskDone(leaver(), 'files', true, 'VB', NOW);
  // On 31 Oct: files (27 Oct) is done; disable/sessions/device (30 Oct) are overdue.
  const ids = overdueTasks(c, '2026-10-31').map((t) => t.id);
  assert.deepEqual(ids, ['disable', 'sessions', 'device']);
  assert.equal(overdueTasks(c, '2026-10-30').length, 0);
});

test('case status', () => {
  let c = leaver();
  assert.equal(caseStatus(c, '2026-10-01'), 'In progress');
  assert.equal(caseStatus(c, '2026-12-31'), 'Overdue');
  for (const t of c.tasks) c = setTaskDone(c, t.id, true, 'VB', NOW);
  assert.equal(caseStatus(c, '2026-12-31'), 'Complete');
});

test('csvCell escapes quotes, commas and new lines', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell(null), '');
});

test('auditCsv has a header and one row per log entry', () => {
  const c = setTaskDone(leaver(), 'disable', true, 'VB', NOW);
  const lines = auditCsv([c]).split('\n');
  assert.equal(lines[0], 'Case,Type,Person,When,By,Action');
  assert.equal(lines.length, 1 + c.log.length);
  assert.match(lines[2], /^c1,Leaver,Sam Test,/);
});

test('sortCases puts overdue first, then in progress, then complete', () => {
  const today = '2026-11-15';
  const overdue = leaver();
  const later = createCase({ type: 'starter', name: 'B', keyDate: '2026-12-01' }, { id: 'c2', now: NOW });
  let done = createCase({ type: 'starter', name: 'C', keyDate: '2026-10-01' }, { id: 'c3', now: NOW });
  for (const t of done.tasks) done = setTaskDone(done, t.id, true, 'VB', NOW);
  assert.deepEqual(sortCases([done, later, overdue], today).map((c) => c.id), ['c1', 'c2', 'c3']);
});
