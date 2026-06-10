'use strict';

/* ─── State ─────────────────────────────────────── */
const DB_KEY = 'habit-tracker-v1';
let state = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(DB_KEY)) || fresh();
  } catch { return fresh(); }
}
function fresh() { return { habits: [], stacks: [] }; }
function save() { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function today() { return new Date().toISOString().slice(0, 10); }
function showModal(id) { document.getElementById(id).classList.remove('modal-hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('modal-hidden'); }

/* ─── Date navigation ───────────────────────────── */
const MIN_DATE = '2026-06-01';
let selectedDate = today();

function dateToDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dt.toISOString().slice(0, 10);
}

function updateDateUI() {
  document.getElementById('today-date').textContent = dateToDisplay(selectedDate);
  const isToday = selectedDate === today();
  const isMin   = selectedDate <= MIN_DATE;
  document.getElementById('next-day-btn').disabled = isToday;
  document.getElementById('prev-day-btn').disabled = isMin;
  document.getElementById('today-heading').textContent =
    isToday ? "Today's Habits" : dateToDisplay(selectedDate).split(',').slice(0,1).join('') + "'s Habits";
}

document.getElementById('prev-day-btn').addEventListener('click', () => {
  if (selectedDate <= MIN_DATE) return;
  selectedDate = shiftDate(selectedDate, -1);
  updateDateUI();
  renderToday();
});
document.getElementById('next-day-btn').addEventListener('click', () => {
  if (selectedDate >= today()) return;
  selectedDate = shiftDate(selectedDate, 1);
  updateDateUI();
  renderToday();
});

/* ─── Tab routing ───────────────────────────────── */
const tabs = ['today', 'habits', 'stacks', 'progress'];

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(t => {
      document.getElementById('tab-' + t).hidden = true;
      document.querySelector(`[data-tab="${t}"]`).classList.remove('active');
    });
    const t = btn.dataset.tab;
    document.getElementById('tab-' + t).hidden = false;
    btn.classList.add('active');
    renderTab(t);
  });
});

function renderTab(t) {
  if (t === 'today')    renderToday();
  if (t === 'habits')   renderHabits();
  if (t === 'stacks')   renderStacks();
  if (t === 'progress') renderProgress();
}

/* ─── TODAY ─────────────────────────────────────── */
function isScheduledToday(habit) {
  const [y, m, d] = selectedDate.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  if (habit.frequency === 'weekdays') return day >= 1 && day <= 5;
  if (habit.frequency === 'weekends') return day === 0 || day === 6;
  return true;
}

function isDone(habit) {
  return !!(habit.completions && habit.completions[selectedDate]);
}

function toggleDone(id) {
  const h = state.habits.find(x => x.id === id);
  if (!h) return;
  if (!h.completions) h.completions = {};
  if (h.completions[selectedDate]) {
    delete h.completions[selectedDate];
    h.streak = calcStreak(h);
  } else {
    h.completions[selectedDate] = true;
    h.streak = calcStreak(h);
    if (h.streak > (h.longestStreak || 0)) h.longestStreak = h.streak;
  }
  save();
  renderToday();
  if (document.getElementById('tab-progress').hidden === false) renderProgress();
}

function calcStreak(h) {
  const comps = h.completions || {};
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (comps[key]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function habitCheckRow(h) {
  const done = isDone(h);
  const cueText = h.cueValue ? `${cueLabel(h.cueType)}: ${h.cueValue}` : '';

  const row = document.createElement('div');
  row.className = 'habit-check-row' + (done ? ' done' : '');
  row.innerHTML = `
    <div class="check-circle" data-id="${h.id}"></div>
    <div class="check-info">
      <div class="check-name">${esc(h.name)}</div>
      ${cueText ? `<div class="check-cue">🔔 ${esc(cueText)}</div>` : ''}
      ${h.reward ? `<div class="check-cue">🎁 ${esc(h.reward)}</div>` : ''}
    </div>
    ${(h.streak || 0) > 0 ? `<span class="streak-badge">🔥 ${h.streak}d</span>` : ''}
  `;
  row.querySelector('.check-circle').addEventListener('click', () => toggleDone(h.id));
  return row;
}

function renderToday() {
  const stacksEl   = document.getElementById('stacks-today');
  const habitsEl   = document.getElementById('habits-today');
  const emptyEl    = document.getElementById('empty-today');
  const progressLb = document.getElementById('today-progress-label');
  const progressBr = document.getElementById('today-progress-bar');

  stacksEl.innerHTML = '';
  habitsEl.innerHTML = '';

  const scheduled = state.habits.filter(isScheduledToday);

  if (scheduled.length === 0) {
    emptyEl.hidden = false;
    progressLb.textContent = '0 / 0 done';
    progressBr.style.width = '0%';
    return;
  }
  emptyEl.hidden = true;

  const done  = scheduled.filter(isDone).length;
  const pct   = Math.round((done / scheduled.length) * 100);
  progressLb.textContent = `${done} / ${scheduled.length} done`;
  progressBr.style.width = pct + '%';

  // Render stacks first
  const stackedIds = new Set();
  state.stacks.forEach(stack => {
    const stackHabits = stack.habitIds
      .map(id => state.habits.find(h => h.id === id))
      .filter(h => h && isScheduledToday(h));
    if (stackHabits.length === 0) return;

    stackHabits.forEach(h => stackedIds.add(h.id));

    const card = document.createElement('div');
    card.className = 'stack-today-card';
    card.innerHTML = `
      <div class="stack-today-header">
        <span class="stack-icon">⛓</span>
        <h3>${esc(stack.name)}</h3>
      </div>
      <div class="stack-today-habits"></div>
    `;
    const inner = card.querySelector('.stack-today-habits');
    stackHabits.forEach((h, i) => {
      if (i > 0) {
        const conn = document.createElement('div');
        conn.className = 'stack-connector';
        inner.appendChild(conn);
      }
      inner.appendChild(habitCheckRow(h));
    });
    stacksEl.appendChild(card);
  });

  // Standalone habits not in any stack
  const standalone = scheduled.filter(h => !stackedIds.has(h.id));
  if (standalone.length > 0) {
    if (stacksEl.children.length > 0) {
      const lbl = document.createElement('div');
      lbl.className = 'section-label';
      lbl.textContent = 'Individual Habits';
      habitsEl.appendChild(lbl);
    }
    standalone.forEach(h => habitsEl.appendChild(habitCheckRow(h)));
  }
}

/* ─── HABITS ────────────────────────────────────── */
function renderHabits() {
  const listEl   = document.getElementById('habits-list');
  const emptyEl  = document.getElementById('empty-habits');
  listEl.innerHTML = '';

  if (state.habits.length === 0) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  state.habits.forEach(h => {
    const card = document.createElement('div');
    card.className = 'habit-card';
    card.innerHTML = `
      <div class="habit-card-top">
        <div class="habit-card-name">${esc(h.name)}</div>
        <div class="habit-card-actions">
          <button class="btn-icon edit-btn" data-id="${h.id}">Edit</button>
          <button class="btn-icon danger del-btn" data-id="${h.id}">Delete</button>
        </div>
      </div>
      ${h.routine ? `<div style="font-size:.85rem;margin-top:6px;color:var(--text)">${esc(h.routine)}</div>` : ''}
      <div>
        ${h.cueValue ? `<span class="habit-pill pill-cue">🔔 ${esc(cueLabel(h.cueType))}: ${esc(h.cueValue)}</span>` : ''}
        ${h.reward   ? `<span class="habit-pill pill-reward">🎁 ${esc(h.reward)}</span>` : ''}
        <span class="habit-pill pill-freq">${freqLabel(h.frequency)}</span>
      </div>
    `;
    card.querySelector('.edit-btn').addEventListener('click', () => openHabitModal(h.id));
    card.querySelector('.del-btn').addEventListener('click', () =>
      confirmDelete(`Delete "${h.name}"?`, 'This will remove all tracking data.', () => {
        state.habits = state.habits.filter(x => x.id !== h.id);
        state.stacks.forEach(s => {
          s.habitIds = s.habitIds.filter(id => id !== h.id);
        });
        save(); renderHabits();
      })
    );
    listEl.appendChild(card);
  });
}

function cueLabel(type) {
  return { time: 'Time', location: 'Location', emotion: 'Emotion',
           action: 'After', person: 'Person', other: 'Cue' }[type] || 'Cue';
}
function freqLabel(f) {
  return { daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends' }[f] || f;
}

/* Habit modal */
document.getElementById('add-habit-btn').addEventListener('click', () => openHabitModal(null));
document.getElementById('cancel-habit-btn').addEventListener('click', closeHabitModal);

function openHabitModal(id) {
  const modal = document.getElementById('habit-modal');
  const h = id ? state.habits.find(x => x.id === id) : null;
  document.getElementById('habit-modal-title').textContent = h ? 'Edit Habit' : 'Add Habit';
  document.getElementById('habit-id').value       = h ? h.id : '';
  document.getElementById('habit-name').value     = h ? h.name : '';
  document.getElementById('cue-type').value       = h ? (h.cueType || 'time') : 'time';
  document.getElementById('cue-value').value      = h ? (h.cueValue || '') : '';
  document.getElementById('habit-routine').value  = h ? (h.routine || '') : '';
  document.getElementById('habit-reward').value   = h ? (h.reward || '') : '';
  document.getElementById('habit-frequency').value= h ? (h.frequency || 'daily') : 'daily';
  showModal('habit-modal');
}
function closeHabitModal() { hideModal('habit-modal'); }

document.getElementById('habit-form').addEventListener('submit', e => {
  e.preventDefault();
  const id       = document.getElementById('habit-id').value;
  const name     = document.getElementById('habit-name').value.trim();
  const cueType  = document.getElementById('cue-type').value;
  const cueValue = document.getElementById('cue-value').value.trim();
  const routine  = document.getElementById('habit-routine').value.trim();
  const reward   = document.getElementById('habit-reward').value.trim();
  const frequency= document.getElementById('habit-frequency').value;

  if (!name) return;

  if (id) {
    const h = state.habits.find(x => x.id === id);
    Object.assign(h, { name, cueType, cueValue, routine, reward, frequency });
  } else {
    state.habits.push({
      id: uid(), name, cueType, cueValue, routine, reward, frequency,
      streak: 0, longestStreak: 0, completions: {}
    });
  }
  save(); closeHabitModal(); renderHabits();
});

/* ─── STACKS ────────────────────────────────────── */
function renderStacks() {
  const listEl  = document.getElementById('stacks-list');
  const emptyEl = document.getElementById('empty-stacks');
  listEl.innerHTML = '';

  if (state.stacks.length === 0) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  state.stacks.forEach(stack => {
    const habits = stack.habitIds
      .map(id => state.habits.find(h => h.id === id))
      .filter(Boolean);

    const card = document.createElement('div');
    card.className = 'stack-card';

    const chain = habits.map((h, i) =>
      `<div class="chain-item">
        ${i > 0 ? '<span class="chain-arrow">→</span>' : ''}
        <span class="chain-badge">${esc(h.name)}</span>
       </div>`
    ).join('');

    card.innerHTML = `
      <div class="stack-card-top">
        <div class="stack-card-name">⛓ ${esc(stack.name)}</div>
        <div style="display:flex;gap:6px">
          <button class="btn-icon edit-btn" data-id="${stack.id}">Edit</button>
          <button class="btn-icon danger del-btn" data-id="${stack.id}">Delete</button>
        </div>
      </div>
      <div class="stack-chain">${chain || '<span style="color:var(--muted);font-size:.85rem">No habits in stack</span>'}</div>
    `;
    card.querySelector('.edit-btn').addEventListener('click', () => openStackModal(stack.id));
    card.querySelector('.del-btn').addEventListener('click', () =>
      confirmDelete(`Delete stack "${stack.name}"?`, 'The habits themselves are not deleted.', () => {
        state.stacks = state.stacks.filter(s => s.id !== stack.id);
        save(); renderStacks();
      })
    );
    listEl.appendChild(card);
  });
}

document.getElementById('add-stack-btn').addEventListener('click', () => openStackModal(null));
document.getElementById('cancel-stack-btn').addEventListener('click', closeStackModal);

let dragSrc = null;

function openStackModal(id) {
  const stack = id ? state.stacks.find(s => s.id === id) : null;
  document.getElementById('stack-modal-title').textContent = stack ? 'Edit Stack' : 'Add Stack';
  document.getElementById('stack-id').value   = stack ? stack.id : '';
  document.getElementById('stack-name').value = stack ? stack.name : '';

  const orderedIds  = stack ? stack.habitIds : [];
  const orderedHabits  = orderedIds.map(i => state.habits.find(h => h.id === i)).filter(Boolean);
  const poolHabits  = state.habits.filter(h => !orderedIds.includes(h.id));

  buildDragList(document.getElementById('stack-pool'),  poolHabits);
  buildDragList(document.getElementById('stack-order'), orderedHabits);

  showModal('stack-modal');
}
function closeStackModal() { hideModal('stack-modal'); }

function buildDragList(ul, habits) {
  ul.innerHTML = '';
  habits.forEach(h => {
    const li = document.createElement('li');
    li.className = 'drag-item';
    li.draggable = true;
    li.dataset.id = h.id;
    li.innerHTML = `<span class="drag-handle">⠿</span>${esc(h.name)}`;

    li.addEventListener('dragstart', e => {
      dragSrc = li;
      li.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.querySelectorAll('.drag-list').forEach(l => l.classList.remove('drag-over'));
    });
    ul.appendChild(li);
  });

  ul.addEventListener('dragover', e => {
    e.preventDefault();
    ul.classList.add('drag-over');
    const after = getDragAfter(ul, e.clientY);
    if (after) ul.insertBefore(dragSrc, after);
    else ul.appendChild(dragSrc);
  });
  ul.addEventListener('dragleave', () => ul.classList.remove('drag-over'));
  ul.addEventListener('drop', e => {
    e.preventDefault();
    ul.classList.remove('drag-over');
  });
}

function getDragAfter(ul, y) {
  const items = [...ul.querySelectorAll('.drag-item:not(.dragging)')];
  return items.find(el => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
}

document.getElementById('stack-form').addEventListener('submit', e => {
  e.preventDefault();
  const id   = document.getElementById('stack-id').value;
  const name = document.getElementById('stack-name').value.trim();
  if (!name) return;
  const habitIds = [...document.getElementById('stack-order').querySelectorAll('.drag-item')]
    .map(li => li.dataset.id);

  if (id) {
    const s = state.stacks.find(x => x.id === id);
    Object.assign(s, { name, habitIds });
  } else {
    state.stacks.push({ id: uid(), name, habitIds });
  }
  save(); closeStackModal(); renderStacks();
});

/* ─── PROGRESS ──────────────────────────────────── */
function renderProgress() {
  const gridEl  = document.getElementById('progress-grid');
  const emptyEl = document.getElementById('empty-progress');
  gridEl.innerHTML = '';

  if (state.habits.length === 0) { emptyEl.hidden = false; return; }
  emptyEl.hidden = true;

  state.habits.forEach(h => {
    const card = document.createElement('div');
    card.className = 'progress-card';

    const streak = calcStreak(h);
    const longest = h.longestStreak || 0;
    const totalDone = Object.keys(h.completions || {}).length;

    card.innerHTML = `
      <div class="progress-card-header">
        <div class="progress-card-name">${esc(h.name)}</div>
        <div class="streak-info">
          🔥 <strong>${streak}</strong>d streak &nbsp;|&nbsp;
          Best <strong>${longest}</strong>d &nbsp;|&nbsp;
          Total <strong>${totalDone}</strong>
        </div>
      </div>
      <div class="cue-reward-row">
        ${h.cueValue ? `<div class="cue-block">🔔 <strong>Cue:</strong> ${esc(cueLabel(h.cueType))}: ${esc(h.cueValue)}</div>` : ''}
        ${h.reward   ? `<div class="cue-block">🎁 <strong>Reward:</strong> ${esc(h.reward)}</div>` : ''}
      </div>
      <div class="heatmap" id="hm-${h.id}"></div>
    `;
    gridEl.appendChild(card);

    const hm = card.querySelector(`#hm-${h.id}`);
    const comps = h.completions || {};
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell' + (comps[key] ? ' done' : '');
      cell.title = key;
      hm.appendChild(cell);
    }
  });
}

/* ─── Confirm modal ─────────────────────────────── */
let confirmCb = null;
function confirmDelete(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  confirmCb = cb;
  showModal('confirm-modal');
}
document.getElementById('confirm-cancel').addEventListener('click', () => {
  hideModal('confirm-modal');
});
document.getElementById('confirm-ok').addEventListener('click', () => {
  hideModal('confirm-modal');
  if (confirmCb) { confirmCb(); confirmCb = null; }
});

/* Close modals on overlay click */
['habit-modal', 'stack-modal', 'confirm-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) hideModal(id);
  });
});

/* ─── Escape helper ─────────────────────────────── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Init ──────────────────────────────────────── */
updateDateUI();
renderToday();
