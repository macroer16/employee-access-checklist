// Browser UI for the tracker. All rules live in checklist.js (tested separately).
import {
  TYPE_LABELS, createCase, setTaskDone, progress, overdueTasks, caseStatus, auditCsv, sortCases, addDays,
} from './checklist.js';

const STORE_KEY = 'access-tracker-cases-v2';
const INITIALS_KEY = 'access-tracker-initials';

const $ = (id) => document.getElementById(id);
let cases = load();
let selectedId = null;

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const newId = () => `case-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const fmtDate = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cases)); } catch { /* storage unavailable */ }
}

// Initials are remembered so sign-off is quick.
const initialsInput = $('initials');
try { initialsInput.value = localStorage.getItem(INITIALS_KEY) || ''; } catch { /* ignore */ }
initialsInput.addEventListener('input', () => {
  initialsInput.value = initialsInput.value.toUpperCase();
  try { localStorage.setItem(INITIALS_KEY, initialsInput.value); } catch { /* ignore */ }
});

function renderList() {
  const t = today();
  const list = $('case-list');
  list.innerHTML = sortCases(cases, t).map((c) => {
    const p = progress(c);
    const status = caseStatus(c, t);
    return `<li>
      <button type="button" class="case-item${c.id === selectedId ? ' selected' : ''}" data-id="${c.id}" aria-current="${c.id === selectedId}">
        <span class="case-name">${esc(c.name)}</span>
        <span class="case-meta">${TYPE_LABELS[c.type]}, ${c.type === 'starter' ? 'starts' : 'leaves'} ${fmtDate(c.keyDate)}</span>
        <span class="case-foot"><span class="status status-${status.replace(' ', '-').toLowerCase()}">${status}</span><span>${p.done}/${p.total}</span></span>
      </button></li>`;
  }).join('');
  $('empty-list').hidden = cases.length > 0;
}

function renderCase() {
  const view = $('case-view');
  const c = cases.find((x) => x.id === selectedId);
  if (!c) { view.hidden = true; return; }
  const t = today();
  const p = progress(c);
  const overdueIds = new Set(overdueTasks(c, t).map((x) => x.id));

  view.innerHTML = `
    <div class="case-head">
      <div>
        <p class="case-type">${TYPE_LABELS[c.type]}</p>
        <h2>${esc(c.name)}</h2>
        <p class="case-sub">${[c.role, c.manager && `Manager: ${c.manager}`].filter(Boolean).map(esc).join('. ')}${c.role || c.manager ? '. ' : ''}${c.type === 'starter' ? 'Starts' : 'Last day'} ${fmtDate(c.keyDate)}.</p>
      </div>
      <button type="button" class="danger-link" id="delete-case">Delete case</button>
    </div>
    <div class="progress" aria-label="${p.done} of ${p.total} tasks done">
      <div class="progress-bar"><span style="width:${p.percent}%"></span></div>
      <span>${p.done} of ${p.total} done${overdueIds.size ? `, <strong class="overdue-text">${overdueIds.size} overdue</strong>` : ''}</span>
    </div>
    <ol class="tasks">
      ${c.tasks.map((task) => `
        <li class="task${task.doneAt ? ' done' : ''}${overdueIds.has(task.id) ? ' overdue' : ''}">
          <input type="checkbox" id="t-${task.id}" data-task="${task.id}" ${task.doneAt ? 'checked' : ''}>
          <div class="task-body">
            <label for="t-${task.id}" class="task-title">${esc(task.title)}</label>
            <p class="task-meta">
              <span class="owner owner-${task.owner.toLowerCase()}">${task.owner}</span>
              <span>Due ${fmtDate(task.due)}${overdueIds.has(task.id) ? ' (overdue)' : ''}</span>
              ${task.doneAt ? `<span>Signed off by ${esc(task.doneBy)}, ${fmtTime(task.doneAt)}</span>` : ''}
            </p>
            <details><summary>Why this matters</summary><p>${esc(task.why)}</p></details>
          </div>
        </li>`).join('')}
    </ol>
    <p id="sign-error" class="error" role="alert" hidden>Enter your initials at the top before signing off a task.</p>
    <section class="audit">
      <div class="audit-head">
        <h3>Audit log</h3>
        <button type="button" id="export-case" class="link">Export this case (CSV)</button>
      </div>
      <table>
        <thead><tr><th scope="col">When</th><th scope="col">By</th><th scope="col">What happened</th></tr></thead>
        <tbody>${[...c.log].reverse().map((e) => `<tr><td>${fmtTime(e.at)}</td><td>${esc(e.by)}</td><td>${esc(e.action)}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
  view.hidden = false;
  $('welcome').hidden = true;
  $('case-form').hidden = true;
}

function select(id) {
  selectedId = id;
  renderList();
  renderCase();
}

function download(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Case list clicks
$('case-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.case-item');
  if (btn) { select(btn.dataset.id); $('detail').focus(); }
});

// New case form
const form = $('case-form');
$('new-case').addEventListener('click', () => {
  selectedId = null;
  renderList();
  form.reset();
  form.keyDate.value = today();
  $('date-label').textContent = 'Start date';
  $('form-error').hidden = true;
  $('welcome').hidden = true;
  $('case-view').hidden = true;
  form.hidden = false;
  form.name.focus();
});
form.addEventListener('change', (e) => {
  if (e.target.name === 'type') $('date-label').textContent = e.target.value === 'starter' ? 'Start date' : 'Last working day';
});
$('cancel-case').addEventListener('click', () => {
  form.hidden = true;
  $('welcome').hidden = false;
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    const c = createCase(data, { id: newId(), now: nowIso() });
    cases.push(c);
    save();
    form.hidden = true;
    select(c.id);
  } catch (err) {
    $('form-error').textContent = err.message === 'A name is required' ? 'Enter the person\'s full name.'
      : err.message === 'A valid date is required' ? 'Choose a date.' : err.message;
    $('form-error').hidden = false;
  }
});

// Task sign-off, delete and export inside the case view
$('case-view').addEventListener('change', (e) => {
  const box = e.target.closest('[data-task]');
  if (!box) return;
  const initials = initialsInput.value.trim();
  if (box.checked && !initials) {
    box.checked = false;
    $('sign-error').hidden = false;
    initialsInput.focus();
    return;
  }
  const i = cases.findIndex((c) => c.id === selectedId);
  cases[i] = setTaskDone(cases[i], box.dataset.task, box.checked, initials, nowIso());
  save();
  renderList();
  renderCase();
  document.getElementById(`t-${box.dataset.task}`)?.focus();
});
$('case-view').addEventListener('click', (e) => {
  const c = cases.find((x) => x.id === selectedId);
  if (!c) return;
  if (e.target.id === 'export-case') {
    download(`audit-${c.name.replace(/\W+/g, '-').toLowerCase()}.csv`, auditCsv([c]), 'text/csv');
  }
  if (e.target.id === 'delete-case' && confirm(`Delete the case for ${c.name}? This can't be undone.`)) {
    cases = cases.filter((x) => x.id !== c.id);
    save();
    selectedId = null;
    renderList();
    $('case-view').hidden = true;
    $('welcome').hidden = false;
  }
});

// Sidebar tools
$('export-all').addEventListener('click', () => {
  if (!cases.length) return;
  download(`audit-log-${today()}.csv`, auditCsv(cases), 'text/csv');
});
$('backup').addEventListener('click', () => {
  download(`access-tracker-backup-${today()}.json`, JSON.stringify(cases, null, 2), 'application/json');
});
$('restore').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data) || !data.every((c) => c.id && c.type && Array.isArray(c.tasks) && Array.isArray(c.log))) {
      throw new Error('bad file');
    }
    if (confirm(`Replace your ${cases.length} case(s) with the ${data.length} in this backup?`)) {
      cases = data;
      save();
      select(null);
      $('welcome').hidden = false;
    }
  } catch {
    alert('That file isn\'t a backup from this tracker. Choose a .json file you downloaded with "Download backup".');
  }
  e.target.value = '';
});

// Example data so visitors can see how it works (fake names).
$('load-examples').addEventListener('click', () => {
  const t = today();
  const make = (input, offsets) => {
    let c = createCase(input, { id: newId(), now: nowIso() });
    for (const id of offsets) c = setTaskDone(c, id, true, 'VB', nowIso());
    return c;
  };
  cases = [
    make({ type: 'leaver', name: 'Jordan Example', role: 'Finance assistant', manager: 'Priya Example', keyDate: addDays(t, -2) }, ['files']),
    make({ type: 'starter', name: 'Casey Sample', role: 'Sales', manager: 'Sam Sample', keyDate: addDays(t, 6) }, ['approve']),
    make({ type: 'starter', name: 'Riley Demo', role: 'Customer support', manager: 'Alex Demo', keyDate: addDays(t, -20) },
      ['approve', 'account', 'licence', 'groups', 'device', 'mfa', 'training']),
  ];
  save();
  select(cases[0].id);
});

renderList();
