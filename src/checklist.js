// Logic for the starters-and-leavers access tracker.
// Pure functions only (no DOM, no storage), so everything here is unit-tested.
//
// Each case is one person joining (starter) or leaving (leaver). Tasks come from a template.
// Each task has an owner and a due date worked out from the key date (start date or last day).

export const TEMPLATES = Object.freeze({
  starter: [
    { id: 'approve', title: 'Manager confirms the role and the access needed', owner: 'Manager', dueOffset: -5,
      why: 'Access should match the job. Getting it agreed in writing first avoids giving too much.' },
    { id: 'account', title: 'Create the Microsoft 365 account and email address', owner: 'IT', dueOffset: -2,
      why: 'The account needs to exist before day one so the person can sign in.' },
    { id: 'licence', title: 'Assign only the licence the role needs', owner: 'IT', dueOffset: -2,
      why: 'Extra licences cost money and give access to apps the person may not need.' },
    { id: 'groups', title: 'Add to the groups, Teams and shared folders agreed by the manager', owner: 'IT', dueOffset: -1,
      why: 'Least privilege: only the access needed to do the job.' },
    { id: 'device', title: 'Prepare the laptop: updates, encryption and anti-malware on, then record its serial number', owner: 'IT', dueOffset: -1,
      why: 'A device that is secure from day one, and recorded so it can be collected later.' },
    { id: 'mfa', title: 'Set up multi-factor authentication with the person', owner: 'IT', dueOffset: 0,
      why: 'MFA stops a stolen password alone being enough to get in.' },
    { id: 'training', title: 'Complete security and phishing awareness induction', owner: 'Manager', dueOffset: 5,
      why: 'Most attacks start with an email. New staff need to know how to spot and report one.' },
  ],
  leaver: [
    { id: 'files', title: 'Agree who takes over files, mailbox and shared items', owner: 'Manager', dueOffset: -3,
      why: 'Work must not be lost when the account is closed.' },
    { id: 'disable', title: 'Block sign-in to the Microsoft 365 account at the end of the last day', owner: 'IT', dueOffset: 0,
      why: 'Old accounts are a common way in for attackers and a risk of misuse.' },
    { id: 'sessions', title: 'Sign out all sessions and remove MFA methods', owner: 'IT', dueOffset: 0,
      why: 'Blocking sign-in does not always end sessions that are already open.' },
    { id: 'device', title: 'Collect the laptop, phone and access cards, and update the asset record', owner: 'Manager', dueOffset: 0,
      why: 'Company devices hold company data and must be wiped before re-use.' },
    { id: 'groups', title: 'Remove from groups, shared folders and third-party apps', owner: 'IT', dueOffset: 1,
      why: 'Some apps keep access even after the main account is blocked.' },
    { id: 'mailbox', title: 'Set up email forwarding or an auto-reply, as company policy says', owner: 'IT', dueOffset: 1,
      why: 'Customers and colleagues still need to reach someone.' },
    { id: 'licence', title: 'Remove the licence once the mailbox is handled', owner: 'IT', dueOffset: 30,
      why: 'Saves cost. Wait until data is kept or moved, as removing a licence can delete data.' },
  ],
});

export const TYPE_LABELS = Object.freeze({ starter: 'Starter', leaver: 'Leaver' });

/** Add days to a YYYY-MM-DD date and return YYYY-MM-DD (UTC, so no timezone drift). */
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${isoDate}`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Create a new case from a template.
 * @param {{type:'starter'|'leaver', name:string, role?:string, manager?:string, keyDate:string}} input
 * @param {{id:string, now:string}} meta id and ISO timestamp (passed in so tests are predictable)
 */
export function createCase(input, meta) {
  const type = input.type;
  if (!(type in TEMPLATES)) throw new Error(`Unknown case type: ${type}`);
  const name = (input.name || '').trim();
  if (!name) throw new Error('A name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.keyDate || '')) throw new Error('A valid date is required');

  return {
    id: meta.id,
    type,
    name,
    role: (input.role || '').trim(),
    manager: (input.manager || '').trim(),
    keyDate: input.keyDate,
    createdAt: meta.now,
    tasks: TEMPLATES[type].map((t) => ({
      id: t.id,
      title: t.title,
      owner: t.owner,
      why: t.why,
      due: addDays(input.keyDate, t.dueOffset),
      doneAt: null,
      doneBy: null,
    })),
    log: [{ at: meta.now, by: 'system', action: `${TYPE_LABELS[type]} case opened for ${name}` }],
  };
}

/**
 * Mark a task done or not done. Returns a NEW case (does not change the original),
 * and adds an entry to the audit log.
 */
export function setTaskDone(caseItem, taskId, done, by, now) {
  const task = caseItem.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  const who = (by || '').trim();
  if (done && !who) throw new Error('Initials are needed to sign off a task');

  const tasks = caseItem.tasks.map((t) =>
    t.id === taskId ? { ...t, doneAt: done ? now : null, doneBy: done ? who : null } : t
  );
  const action = done ? `Completed: ${task.title}` : `Reopened: ${task.title}`;
  return { ...caseItem, tasks, log: [...caseItem.log, { at: now, by: who || 'unknown', action }] };
}

/** How far through a case is: done count, total and percent. */
export function progress(caseItem) {
  const done = caseItem.tasks.filter((t) => t.doneAt).length;
  const total = caseItem.tasks.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

/** Tasks not done whose due date is before today (YYYY-MM-DD). */
export function overdueTasks(caseItem, today) {
  return caseItem.tasks.filter((t) => !t.doneAt && t.due < today);
}

/** One-word status for the case list. */
export function caseStatus(caseItem, today) {
  if (progress(caseItem).percent === 100) return 'Complete';
  if (overdueTasks(caseItem, today).length) return 'Overdue';
  return 'In progress';
}

/** Escape one value for CSV (quotes, commas and new lines). */
export function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The audit log for one or more cases as CSV text. */
export function auditCsv(cases) {
  const rows = [['Case', 'Type', 'Person', 'When', 'By', 'Action']];
  for (const c of cases) {
    for (const entry of c.log) {
      rows.push([c.id, TYPE_LABELS[c.type], c.name, entry.at, entry.by, entry.action]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** Sort cases: overdue first, then in progress, then complete; each group by key date. */
export function sortCases(cases, today) {
  const rank = { Overdue: 0, 'In progress': 1, Complete: 2 };
  return [...cases].sort((a, b) =>
    rank[caseStatus(a, today)] - rank[caseStatus(b, today)] || a.keyDate.localeCompare(b.keyDate)
  );
}
