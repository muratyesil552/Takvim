'use strict';
/* =========================================================
   Öğrenci Takvimi — tüm uygulama mantığı
   Veriler telefonun içinde (localStorage) saklanır.
   ========================================================= */

const KEY = 'ogrenci-takvim-v1';

// Kağıttaki 4 sınıflandırma
const CATS = {
  sinav:    { name: 'Sınav / Quiz',       short: 'Sınav',    icon: '📝', color: '#EF5B5B' },
  odev:     { name: 'Ödev / Proje',       short: 'Ödev',     icon: '📚', color: '#F2994A' },
  arkadas:  { name: 'Arkadaş etkinliği',  short: 'Etkinlik', icon: '🎉', color: '#9B6BFF' },
  bireysel: { name: 'Bireysel çalışma',   short: 'Çalışma',  icon: '🎯', color: '#2BB673' },
};
const COLORS = ['#4F7CFF', '#F2994A', '#2BB673', '#EF5B5B', '#9B6BFF', '#1DB5C9', '#E8B019', '#E9559B', '#00A88A', '#8D6E63'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAYS_S = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
// Kağıttaki dönem planından ders önerileri (tek tıkla isim doldurmak için)
const PAPER_COURSES = ['Fundamentals of Nuclear Eng.', 'Nuclear Fuel and Material', 'Olasılık ve İstatistik', 'Dinamik I',
  'CFD', 'Data Analysis', 'Uzaktan Algılama', 'Bulut Yağış Fiziği'];

/* ---------------- Tarih yardımcıları ---------------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diff = (a, b) => { // b - a (gün)
  const A = parse(a), B = parse(b);
  return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 864e5);
};
const todayStr = () => ymd(new Date());
const dow = s => (parse(s).getDay() + 6) % 7; // 0 = Pazartesi
const monday = s => addDays(s, -dow(s));
const fmtShort = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const fmtMid = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtLong = s => `${fmtMid(s)} ${parse(s).getFullYear()}, ${DAYS[dow(s)]}`;
const monthEnd = s => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

/* ---------------- Durum ---------------- */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.semesters)) return migrate(s); } catch (e) { /* bozuk veri */ }
  return { semesters: [], activeId: null, tasks: [], reminders: [] };
}
// "Unutma" notları görev değildir: ayrı bir listede tutulur (fatura yatır, kartı yenile gibi).
// Eski sürümde tarihsiz görev olarak girilenleri bu listeye taşı.
function migrate(s) {
  if (!Array.isArray(s.tasks)) s.tasks = [];
  if (!Array.isArray(s.reminders)) s.reminders = [];
  s.tasks.filter(t => !t.start).forEach(t => s.reminders.push({ id: t.id, text: t.title, date: '', repeat: '', done: !!t.done, created: t.created || Date.now() }));
  s.tasks = s.tasks.filter(t => t.start);
  return s;
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

let S = load();
const UI = {
  screen: null,          // 'setup' | 'courses' | 'main'
  editSem: false,        // dönem bilgilerini düzenleme modu
  tab: 'today',
  day: todayStr(),
  weekStart: monday(todayStr()),
  month: todayStr().slice(0, 7),
};
const sem = () => S.semesters.find(x => x.id === S.activeId);
UI.screen = sem() ? 'main' : 'setup';
if (['today', 'week', 'month', 'sem', 'forget'].includes(location.hash.slice(1))) UI.tab = location.hash.slice(1);

/* ---------------- Dönem / hafta hesapları ---------------- */
const semWeek = (s, d) => Math.floor(diff(monday(s.start), d) / 7) + 1;   // hafta 1 = dönem başlangıcının haftası
const semTotal = s => semWeek(s, s.end);
const weekStartOf = (s, w) => addDays(monday(s.start), (w - 1) * 7);
const inSem = (s, d) => d >= s.start && d <= s.end;

function coursesOnDay(s, d) {
  if (!s || !inSem(s, d)) return [];
  const wd = dow(d), out = [];
  s.courses.forEach(c => c.slots.forEach(sl => { if (+sl.day === wd) out.push({ c, sl }); }));
  return out.sort((a, b) => (a.sl.start || '').localeCompare(b.sl.start || ''));
}
const isDone = (s, cid, w) => !!(s.progress && s.progress[cid] && s.progress[cid][w]);

/* ---------------- Görev hesapları ----------------
   Görevin süresi hangi seviyede olduğunu belirler:
   1 gün = günlük, 2–7 gün = haftalık, 7+ gün = aylık/dönemlik.
   Görev, tarih aralığına giren HER panelde otomatik görünür. */
const tEnd = t => (t.end && t.end >= t.start ? t.end : t.start);
const tDur = t => diff(t.start, tEnd(t)) + 1;
const level = t => { const d = tDur(t); return d <= 1 ? 'day' : d <= 7 ? 'week' : 'long'; };
const overlaps = (t, a, b) => !!t.start && t.start <= b && tEnd(t) >= a;
const byWhen = (a, b) => (a.done - b.done) || (a.start || '9').localeCompare(b.start || '9') || (a.time || '99').localeCompare(b.time || '99');
/* ---------------- Unutma notları ----------------
   Görev değil, gündelik hatırlatma. Tarih isteğe bağlı; "her ay" tekrar edebilir (faturalar gibi).
   Tarihi olmayan ya da günü gelmiş/geçmiş olanlar yanıp söner ve Bugün ekranının üstünde görünür. */
const remDue = r => !r.done && (!r.date || r.date <= todayStr());
const dueReminders = () => S.reminders.filter(remDue);
const REPEATS = { '': 'Tekrar yok', week: 'Her hafta', month: 'Her ay' };
function nextDate(d, rep) {
  if (rep === 'week') return addDays(d, 7);
  const x = parse(d), day = x.getDate();
  const n = new Date(x.getFullYear(), x.getMonth() + 1, 1);
  n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
  return ymd(n);
}
function remRow(r) {
  const today = todayStr();
  let when = '';
  if (r.date) {
    const left = diff(today, r.date);
    when = `${fmtShort(r.date)} · ${r.done ? '' : left < 0 ? `${-left} gün geçti` : left === 0 ? 'bugün' : `${left} gün sonra`}`;
  }
  const meta = [when, r.repeat ? '🔁 ' + REPEATS[r.repeat] : ''].filter(Boolean).join(' · ');
  return `<div class="rem ${r.done ? 'done' : ''} ${remDue(r) ? 'blink' : ''}">
    <button class="rcheck ${r.done ? 'on' : ''}" data-act="remDone" data-id="${r.id}" aria-label="Hallettim"></button>
    <div class="rem-body" data-act="remEdit" data-id="${r.id}"><div>${esc(r.text)}</div>${meta ? `<small>${meta}</small>` : ''}</div>
  </div>`;
}
const remSort = (a, b) => (a.done - b.done) || (a.date || '0').localeCompare(b.date || '0') || a.created - b.created;
const overdueList = () => { const t = todayStr(); return S.tasks.filter(x => x.start && !x.done && tEnd(x) < t); };

/* ---------------- Ortak parçalar ---------------- */
function section(title, inner, empty, extra = '') {
  return `<section class="card"><h3>${title}${extra}</h3>${inner || `<p class="empty">${empty}</p>`}</section>`;
}
const countBadge = n => n ? ` <span class="count">${n}</span>` : '';

function progBtn(s, c, w, opts = {}) {
  const on = isDone(s, c.id, w);
  const cls = ['pbox'];
  if (on) cls.push('on');
  if (opts.label) cls.push('labeled');
  if (opts.missed && !on) cls.push('missed');
  if (opts.cur) cls.push('cur');
  const text = opts.label ? (on ? '✓ H' + w : 'H' + w) : (on ? '✓' : '');
  return `<button class="${cls.join(' ')}" style="--cc:${c.color}" data-act="prog" data-c="${c.id}" data-w="${w}" title="${esc(c.name)} · ${w}. hafta">${text}</button>`;
}

function taskRow(t) {
  const c = CATS[t.cat] || CATS.bireysel;
  const s = sem();
  const course = t.courseId && s ? s.courses.find(x => x.id === t.courseId) : null;
  const today = todayStr();
  const late = t.start && !t.done && tEnd(t) < today;
  const noDate = !t.start && !t.done;
  let when = 'Tarihsiz';
  let bar = '';
  if (t.start) {
    when = tDur(t) > 1 ? `${fmtShort(t.start)} → ${fmtShort(tEnd(t))}` : fmtShort(t.start);
    if (!t.done) {
      const left = diff(today, tEnd(t));
      when += left < 0 ? ` · ${-left} gün gecikti` : left === 0 ? (tDur(t) > 1 ? ' · son gün bugün!' : ' · bugün') : ` · ${left} gün kaldı`;
    }
    if (tDur(t) > 1) {
      const p = Math.max(0, Math.min(100, (diff(t.start, today) + 1) / tDur(t) * 100));
      bar = `<div class="progress-line"><i style="width:${t.done ? 100 : p}%"></i></div>`;
    }
  }
  return `<div class="task ${t.done ? 'done' : ''} ${late || noDate ? 'blink' : ''}" style="--c:${c.color}">
    <button class="check ${t.done ? 'on' : ''}" data-act="done" data-id="${t.id}" aria-label="Tamamlandı"></button>
    <div class="task-body" data-act="edit" data-id="${t.id}">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta"><span class="tag">${c.icon} ${c.short}</span>${t.time ? `<span>🕒 ${t.time}</span>` : ''}<span>${when}</span>${course ? `<span class="cdot" style="--cc:${course.color}">${esc(course.name)}</span>` : ''}</div>
      ${t.note ? `<div class="task-note">${esc(t.note)}</div>` : ''}${bar}
    </div></div>`;
}
const taskList = arr => arr.sort(byWhen).map(taskRow).join('');

/* =========================================================
   EKRAN 1: Dönem kurulumu
   ========================================================= */
function renderSetup() {
  const s = UI.editSem ? sem() : null;
  // Kağıttaki dönem tarihleri varsayılan olarak geliyor
  const def = s || { name: '2026-2027 Güz Dönemi', start: '2026-11-04', end: '2027-01-17' };
  return `<div class="setup">
    <div class="hero"><div class="emoji">🗓️</div>
      <h2>${s ? 'Dönemi düzenle' : 'Yeni dönem'}</h2>
      <p>${s ? 'Bilgileri güncelle ve Enter\'a bas.' : 'Dönem adını ve tarih aralığını gir, Enter\'a bas.'}</p></div>
    <form id="semForm" class="card" autocomplete="off">
      <label>Dönem adı<input name="name" required value="${esc(def.name)}" placeholder="ör. 2026-2027 Güz"></label>
      <div class="row2">
        <label>Başlangıç<input type="date" name="start" required value="${def.start}"></label>
        <label>Bitiş<input type="date" name="end" required value="${def.end}"></label>
      </div>
      <button class="btn primary block">${s ? 'Kaydet ↵' : 'Devam et — dersleri ekle ↵'}</button>
      ${S.semesters.length ? `<button type="button" class="btn ghost block" data-act="cancelSetup">Vazgeç</button>` : ''}
    </form>
    <p class="hint">İpucu: Hafta numaraları dönemin başladığı haftanın pazartesisinden itibaren sayılır (1. hafta, 2. hafta…).</p>
  </div>`;
}

/* =========================================================
   EKRAN 2: Ders ekleme
   ========================================================= */
function slotRow(sl = { day: 0, start: '08:30', end: '11:30', room: '' }) {
  return `<div class="slot">
    <select name="day">${DAYS.map((d, i) => `<option value="${i}" ${+sl.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <input type="time" name="ts" value="${sl.start || ''}" aria-label="Başlangıç saati">
    <input type="time" name="te" value="${sl.end || ''}" aria-label="Bitiş saati">
    <input name="room" value="${esc(sl.room || '')}" placeholder="Sınıf">
    <button type="button" class="rm" data-act="rmSlot" aria-label="Sil">×</button>
  </div>`;
}

function renderCourses() {
  const s = sem();
  const editing = UI.editCourse ? s.courses.find(c => c.id === UI.editCourse) : null;
  const color = editing ? editing.color : COLORS[s.courses.length % COLORS.length];
  const used = s.courses.map(c => c.name.toLowerCase());
  const sugg = PAPER_COURSES.filter(n => !used.includes(n.toLowerCase()));
  const list = s.courses.map(c => `<div class="course-item" style="--cc:${c.color}">
      <span class="dot"></span>
      <div class="info"><b>${esc(c.name)}</b>
        <small>${c.slots.length ? c.slots.map(sl => `${DAYS_S[sl.day]} ${sl.start}–${sl.end}${sl.room ? ' · ' + esc(sl.room) : ''}`).join('  |  ') : 'Saat girilmedi'}</small></div>
      <button class="btn ghost small" data-act="editCourse" data-id="${c.id}">Düzenle</button>
      <button class="btn danger small" data-act="delCourse" data-id="${c.id}">Sil</button>
    </div>`).join('');

  return `<div class="setup">
    <div class="hero"><div class="emoji">📚</div>
      <h2>Bu dönem için ders ekle</h2>
      <p>${esc(s.name)} · ${fmtMid(s.start)} – ${fmtMid(s.end)} (${semTotal(s)} hafta)</p></div>
    <form id="courseForm" class="card" autocomplete="off">
      <label>Ders adı<input name="name" required value="${esc(editing ? editing.name : '')}" placeholder="ör. Dinamik I" ${editing ? '' : 'autofocus'}></label>
      ${!editing && sugg.length ? `<div class="suggest">${sugg.map(n => `<button type="button" data-act="suggest" data-name="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="label">Renk</div>
      <div class="swatches">${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="--cc:${c}"></span></label>`).join('')}</div>
      <div class="label">Ders saatleri <span style="font-weight:400;color:var(--muted)">(gün · başlangıç · bitiş · sınıf)</span></div>
      <div id="slots">${(editing ? editing.slots : [undefined]).map(sl => slotRow(sl)).join('')}</div>
      <button type="button" class="btn ghost small" style="margin-top:8px" data-act="addSlot">+ Başka gün / saat ekle</button>
      <div class="actions">
        ${editing ? `<button type="button" class="btn ghost" data-act="cancelCourse">Vazgeç</button>` : ''}
        <button class="btn primary">${editing ? 'Kaydet ↵' : 'Dersi ekle ↵'}</button>
      </div>
    </form>
    ${section('Eklenen dersler' + countBadge(s.courses.length), list, 'Henüz ders eklenmedi.')}
    <button class="btn primary block" data-act="finishCourses">Bitti, takvime geç →</button>
  </div>`;
}

/* =========================================================
   ANA EKRAN
   ========================================================= */
function renderMain() {
  const s = sem(), t = todayStr(), w = semWeek(s, t), tot = semTotal(s);
  const pill = w < 1 ? 'Dönem başlamadı' : w > tot ? 'Dönem bitti' : `${w}. hafta / ${tot}`;
  const views = { today: viewToday, week: viewWeek, month: viewMonth, sem: viewSem, forget: viewForget };
  const und = dueReminders().length;
  const tabs = [['today', '☀️', 'Bugün'], ['week', '🗂️', 'Hafta'], ['month', '📅', 'Ay'], ['sem', '🎓', 'Dönem'], ['forget', '🔔', 'Unutma']];
  return `
    <header class="topbar">
      <div><h1>${esc(s.name)}</h1><div class="sub">${fmtLong(t)}</div></div>
      <div style="display:flex;gap:8px;align-items:center"><span class="week-pill">${pill}</span>
      <button class="icon-btn" data-act="settings" aria-label="Ayarlar">⚙️</button></div>
    </header>
    ${views[UI.tab]()}
    <button class="fab" data-act="newTask" aria-label="Görev ekle">+</button>
    <nav class="bottom-nav"><div class="inner">
      ${tabs.map(([k, ic, n]) => `<button class="${UI.tab === k ? 'active' : ''}" data-act="tab" data-tab="${k}"><span class="ic">${ic}</span>${n}${k === 'forget' && und ? `<span class="badge">${und}</span>` : ''}</button>`).join('')}
    </div></nav>`;
}

/* ---------- PANEL 1: Günlük ---------- */
function viewToday() {
  const s = sem(), d = UI.day, isToday = d === todayStr(), w = semWeek(s, d);
  const courses = coursesOnDay(s, d);
  const active = S.tasks.filter(t => overlaps(t, d, d));
  const dayT = active.filter(t => level(t) === 'day');
  const weekT = active.filter(t => level(t) === 'week');
  const longT = active.filter(t => level(t) === 'long');
  const late = isToday ? overdueList().filter(t => !overlaps(t, d, d)) : [];
  const und = dueReminders().length;

  const courseHtml = courses.map(({ c, sl }) => `<div class="course-row" style="--cc:${c.color}">
      <span class="bar"></span><span class="time">${sl.start}–${sl.end}</span>
      <div class="info"><div class="name">${esc(c.name)}</div>${sl.room ? `<div class="room">📍 ${esc(sl.room)}</div>` : ''}</div>
      ${progBtn(s, c, w, { label: true })}
    </div>`).join('');

  return `
    <div class="nav-row">
      <button class="nav-btn" data-act="dayNav" data-n="-1">‹</button>
      <div class="title">${isToday ? 'Bugün' : DAYS[dow(d)]}<small>${fmtLong(d)}${inSem(s, d) ? ` · ${w}. hafta` : ''}</small></div>
      ${isToday ? '' : `<button class="today-btn" data-act="dayToday">Bugün</button>`}
      <button class="nav-btn" data-act="dayNav" data-n="1">›</button>
    </div>
    ${isToday && dueReminders().length ? `<section class="card sticky-note"><h3>🔔 Unutma!${countBadge(dueReminders().length)}<button class="right linkish" data-act="tab" data-tab="forget">tümü →</button></h3>${dueReminders().sort(remSort).map(remRow).join('')}</section>` : ''}
    ${late.length ? section('⏰ Gecikenler' + countBadge(late.length), taskList(late), '') : ''}
    <div class="level-title">Günlük</div>
    ${section('📖 Günün dersleri' + countBadge(courses.length), courseHtml, inSem(s, d) ? 'Bugün ders yok 🎉' : 'Bu tarih dönem aralığının dışında.',
      courses.length ? '<span class="right">kutucuk = bu hafta dersi hallettim</span>' : '')}
    ${section('✅ Bugün yapılacaklar' + countBadge(dayT.length), taskList(dayT), 'Bugün için görev yok. + ile ekleyebilirsin.')}
    <div class="level-title">Haftalık planlar</div>
    ${section('🗂️ Bu haftaya yayılan işler' + countBadge(weekT.length), taskList(weekT), 'Bugünü kapsayan haftalık plan yok.')}
    <div class="level-title">Aylık / dönemlik planlar</div>
    ${section('🎯 Uzun vadeli işler' + countBadge(longT.length), taskList(longT), 'Bugünü kapsayan uzun plan yok.')}
  `;
}

/* ---------- PANEL 2: Haftalık ---------- */
function viewWeek() {
  const s = sem(), ws = UI.weekStart, we = addDays(ws, 6), today = todayStr();
  const w = semWeek(s, ws);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const inWeek = S.tasks.filter(t => overlaps(t, ws, we));
  const dayT = inWeek.filter(t => level(t) === 'day');
  const weekT = inWeek.filter(t => level(t) === 'week');
  const longT = inWeek.filter(t => level(t) === 'long');
  const semActive = ws <= s.end && we >= s.start;

  const grid = `<div class="tt-wrap"><div class="tt">${days.map(d => {
    const tasks = dayT.filter(t => t.start === d).sort(byWhen);
    return `<div class="tt-col ${d === today ? 'today' : ''}">
      <div class="tt-head">${DAYS_S[dow(d)]}<b>${parse(d).getDate()}</b></div>
      ${coursesOnDay(s, d).map(({ c, sl }) => `<div class="tt-item" style="--cc:${c.color}"><b>${esc(c.name)}</b><small>${sl.start}–${sl.end}</small>${sl.room ? `<small>${esc(sl.room)}</small>` : ''}</div>`).join('')}
      ${tasks.map(t => `<div class="tt-task ${t.done ? 'done' : ''}" style="--c:${(CATS[t.cat] || CATS.bireysel).color}" data-act="edit" data-id="${t.id}">${CATS[t.cat]?.icon || ''} ${esc(t.title)}</div>`).join('')}
    </div>`;
  }).join('')}</div></div>`;

  const progress = semActive && s.courses.length ? `<div class="prog-chips">${s.courses.map(c =>
    `<div class="prog-chip">${esc(c.name)} ${progBtn(s, c, w, { label: true })}</div>`).join('')}</div>` : '';

  let dayGroups = '';
  days.forEach(d => {
    const list = dayT.filter(t => t.start === d);
    if (list.length) dayGroups += `<div class="day-group">${DAYS[dow(d)]} · ${fmtMid(d)}</div>${taskList(list)}`;
  });

  const tot = semTotal(s);
  const wBadge = semActive && w >= 1 && w <= tot ? `📌 Dönemin ${w}. Haftası <span class="w-sub">(${w} / ${tot})</span>`
    : w < 1 ? `📌 Dönem öncesi (${1 - w} hafta var)` : `📌 Dönem sonrası`;

  return `
    <div class="nav-row">
      <button class="nav-btn" data-act="weekNav" data-n="-1">‹</button>
      <div class="title"><span class="week-banner">${wBadge}</span><small>${fmtMid(ws)} – ${fmtMid(we)} ${parse(we).getFullYear()} (${w >= 1 && w <= tot ? `${w}. Hafta` : 'Dönem dışı'})</small></div>
      ${ws === monday(today) ? '' : `<button class="today-btn" data-act="weekToday">Bu hafta</button>`}
      <button class="nav-btn" data-act="weekNav" data-n="1">›</button>
    </div>
    ${section(`📖 Haftalık ders programı ${semActive ? `<span class="count">${w}. Hafta</span>` : ''}`, grid, '')}
    ${progress ? section(`☑️ ${w}. Hafta ders takibi`, progress, '', '<span class="right">dersi hallettiysen işaretle</span>') : ''}
    <div class="level-title">Günlük görevler</div>
    ${section('✅ Bu haftanın günlük işleri' + countBadge(dayT.length), dayGroups, 'Bu hafta tek günlük görev yok.')}
    <div class="level-title">Haftalık planlar</div>
    ${section('🗂️ Haftalık ödev / proje / planlar' + countBadge(weekT.length), taskList(weekT), 'Bu haftaya ait haftalık plan yok.')}
    <div class="level-title">Aylık / dönemlik planlar</div>
    ${section('🎯 Bu haftayı kapsayan uzun işler' + countBadge(longT.length), taskList(longT), 'Uzun vadeli plan yok.')}
  `;
}

/* ---------- PANEL 4: Aylık takvim ---------- */
function viewMonth() {
  const s = sem(), today = todayStr();
  const [y, m] = UI.month.split('-').map(Number);
  const first = `${UI.month}-01`, last = monthEnd(first);
  const start = monday(first), end = addDays(monday(last), 6);
  const catOrder = { sinav: 0, odev: 1, arkadas: 2, bireysel: 3 };
  let cells = '';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const all = S.tasks.filter(t => overlaps(t, d, d));
    const chips = all.filter(t => level(t) !== 'long').sort((a, b) => (a.done - b.done) || catOrder[a.cat] - catOrder[b.cat]);
    const longs = all.filter(t => level(t) === 'long');
    const w = semWeek(s, d);
    cells += `<button class="mcell ${d.slice(0, 7) !== UI.month ? 'other' : ''} ${d === today ? 'today' : ''}" data-act="gotoDay" data-d="${d}">
      <div class="num">${parse(d).getDate()}${dow(d) === 0 && inSem(s, d) ? `<span class="wk">H${w}</span>` : ''}</div>
      ${chips.slice(0, 3).map(t => `<div class="mchip ${t.done ? 'done' : ''}" style="--c:${CATS[t.cat].color}">${esc(t.title)}</div>`).join('')}
      ${chips.length > 3 ? `<div class="mmore">+${chips.length - 3} daha</div>` : ''}
      ${longs.length ? `<div class="mdots">${longs.slice(0, 4).map(t => `<i style="--c:${CATS[t.cat].color}"></i>`).join('')}</div>` : ''}
    </button>`;
  }
  const monthLong = S.tasks.filter(t => overlaps(t, first, last) && level(t) === 'long');
  const monthExams = S.tasks.filter(t => overlaps(t, first, last) && t.cat === 'sinav');
  return `
    <div class="nav-row">
      <button class="nav-btn" data-act="monthNav" data-n="-1">‹</button>
      <div class="title">${MONTHS[m - 1]} ${y}<small>Güne dokun → o günün planı</small></div>
      ${UI.month === today.slice(0, 7) ? '' : `<button class="today-btn" data-act="monthToday">Bu ay</button>`}
      <button class="nav-btn" data-act="monthNav" data-n="1">›</button>
    </div>
    <section class="card">
      <div class="month">${DAYS_S.map(d => `<div class="dname">${d}</div>`).join('')}${cells}</div>
      <div class="legend">${Object.values(CATS).map(c => `<span><i style="--c:${c.color}"></i>${c.short}</span>`).join('')}<span>alttaki ince çizgiler = uzun planlar</span></div>
    </section>
    ${section('📝 Bu ayın sınavları' + countBadge(monthExams.length), taskList(monthExams), 'Bu ay sınav yok.')}
    ${section('🎯 Bu aya yayılan uzun planlar' + countBadge(monthLong.length), taskList(monthLong), 'Uzun plan yok.')}
  `;
}

/* ---------- PANEL 3: Dönemlik plan ve gidişat ---------- */
function viewSem() {
  const s = sem(), today = todayStr(), cur = semWeek(s, today), tot = semTotal(s);
  const weeks = [...Array(tot)].map((_, i) => i + 1);
  const head = `<tr><th></th>${weeks.map(w => `<th class="${w === cur ? 'cur' : ''}" title="${fmtShort(weekStartOf(s, w))}">${w}<span class="mark ${w < cur ? 'past' : w === cur ? 'cur' : ''}"></span></th>`).join('')}<th>%</th></tr>`;
  const rows = s.courses.map(c => {
    const upto = Math.min(Math.max(cur, 0), tot);
    let done = 0; for (let w = 1; w <= upto; w++) if (isDone(s, c.id, w)) done++;
    const pct = upto ? Math.round(done / upto * 100) + '%' : '—';
    return `<tr><td class="cname" style="--cc:${c.color}"><span></span>${esc(c.name)}</td>${weeks.map(w => `<td>${progBtn(s, c, w, { missed: w < cur, cur: w === cur })}</td>`).join('')}<td class="pct">${pct}</td></tr>`;
  }).join('');
  const semTasks = S.tasks.filter(t => t.start);
  const exams = semTasks.filter(t => t.cat === 'sinav');
  const hw = semTasks.filter(t => t.cat === 'odev');
  const longOther = semTasks.filter(t => level(t) === 'long' && t.cat !== 'sinav' && t.cat !== 'odev');
  return `
    <section class="card">
      <h3>🎓 Dönem planı <span class="right">${fmtMid(s.start)} ${parse(s.start).getFullYear()} / ${fmtMid(s.end)} ${parse(s.end).getFullYear()}</span></h3>
      ${s.courses.length ? `<div class="sem-wrap"><table class="sem">${head}${rows}</table></div>
      <p class="hint">Sarı = içinde bulunduğun hafta · Siyah kare = geçen haftalar · Pembe kutu = o hafta hallemediğin ders. Kutucuğa dokunarak işaretle.</p>`
      : '<p class="empty">Ders eklenmedi. ⚙️ → Dersleri düzenle.</p>'}
    </section>
    ${section('📝 Sınav tarihleri' + countBadge(exams.length), taskList(exams), 'Sınav eklenmedi. + → Sınav / Quiz.')}
    ${section('📚 Ödevler / Projeler' + countBadge(hw.length), taskList(hw), 'Ödev veya proje eklenmedi.')}
    ${section('🎯 Diğer dönemlik planlar' + countBadge(longOther.length), taskList(longOther), 'Uzun vadeli başka plan yok.')}
  `;
}

/* ---------- PANEL 5: Unutmaman gerekenler (görev değil, gündelik notlar) ---------- */
function viewForget() {
  const open = S.reminders.filter(r => !r.done).sort(remSort);
  const closed = S.reminders.filter(r => r.done);
  return `
    <section class="card sticky-note">
      <h3>🔔 Unutmaman gerekenler</h3>
      <form id="forgetForm" autocomplete="off">
        <div style="display:flex;gap:8px">
          <input name="text" required placeholder="ör. Faturayı yatır, Enter…" style="margin:0">
          <button class="btn primary" style="flex:none">Ekle</button>
        </div>
        <div class="row2" style="margin-top:2px">
          <label>Tarih (isteğe bağlı)<input type="date" name="date"></label>
          <label>Tekrar<select name="repeat">${Object.entries(REPEATS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
        </div>
      </form>
      <p class="hint">Bunlar ders görevi değil; gündelik hayatta aklından çıkabilecek şeyler. Tarihsiz olanlar ve günü gelenler <b>yanıp söner</b> ve Bugün ekranının en üstünde durur. “Her ay” seçersen (fatura gibi) hallettim deyince bir sonraki aya kendiliğinden kurulur.</p>
      ${open.length ? open.map(remRow).join('') : '<p class="empty">Aklında tutman gereken bir şey yok 👌</p>'}
    </section>
    ${closed.length ? section('Hallettiklerim', closed.map(remRow).join('') + `<button class="btn danger small" style="margin-top:8px" data-act="clearDone">Temizle</button>`, '') : ''}
  `;
}

function openReminderModal(r) {
  document.getElementById('modal-root').innerHTML = `<div class="modal-bg" data-act="closeModalBg"><div class="modal">
    <h2>🔔 Hatırlatma</h2>
    <form id="remForm" autocomplete="off">
      <input type="hidden" name="id" value="${r.id}">
      <label>Ne?<input name="text" required value="${esc(r.text)}"></label>
      <div class="row2">
        <label>Tarih (isteğe bağlı)<input type="date" name="date" value="${r.date || ''}"></label>
        <label>Tekrar<select name="repeat">${Object.entries(REPEATS).map(([k, n]) => `<option value="${k}" ${r.repeat === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="actions">
        <button type="button" class="btn danger" data-act="remDel" data-id="${r.id}">Sil</button>
        <button class="btn primary">Kaydet</button>
      </div>
    </form></div></div>`;
}

/* =========================================================
   Görev ekleme / düzenleme penceresi
   ========================================================= */
function openTaskModal(task) {
  const s = sem();
  const isNew = !task;
  const defStart = UI.tab === 'today' ? UI.day : todayStr();
  const t = task || { title: '', cat: 'odev', start: defStart, end: '', time: '', courseId: '', note: '' };
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg" data-act="closeModalBg">
    <div class="modal" role="dialog">
      <h2>${isNew ? 'Yeni görev' : 'Görevi düzenle'}</h2>
      <p class="hint" style="margin:0">Tarih aralığını gir; görev o aralıktaki bütün panellerde kendiliğinden görünür.</p>
      <form id="taskForm" autocomplete="off">
        <input type="hidden" name="id" value="${t.id || ''}">
        <input type="hidden" name="cat" value="${t.cat}">
        <label>Başlık<input name="title" required value="${esc(t.title)}" placeholder="ör. Dinamik vizesi" ${isNew ? 'autofocus' : ''}></label>
        <div class="label">Tür</div>
        <div class="chips" id="catChips">${Object.entries(CATS).map(([k, c]) => `<button type="button" class="chip ${t.cat === k ? 'sel' : ''}" style="--c:${c.color}" data-act="pickCat" data-cat="${k}">${c.icon} ${c.name}</button>`).join('')}</div>
        <label>Ders (isteğe bağlı)<select name="courseId"><option value="">—</option>${s.courses.map(c => `<option value="${c.id}" ${t.courseId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <div class="label">Hızlı süre</div>
        <div class="chips">
          <button type="button" class="chip q" data-act="quick" data-q="today">Bugün</button>
          <button type="button" class="chip q" data-act="quick" data-q="week">Bu hafta</button>
          <button type="button" class="chip q" data-act="quick" data-q="month">Bu ay</button>
          <button type="button" class="chip q" data-act="quick" data-q="sem">Dönem sonuna kadar</button>
        </div>
        <div class="row2">
          <label>Başlangıç<input type="date" name="start" value="${t.start || ''}"></label>
          <label>Bitiş / teslim<input type="date" name="end" value="${t.end || ''}"></label>
        </div>
        <label>Saat (isteğe bağlı)<input type="time" name="time" value="${t.time || ''}"></label>
        <label>Not<textarea name="note" placeholder="Detaylar…">${esc(t.note || '')}</textarea></label>
        <div class="actions">
          ${isNew ? `<button type="button" class="btn ghost" data-act="closeModal">Vazgeç</button>` : `<button type="button" class="btn danger" data-act="delTask" data-id="${t.id}">Sil</button>`}
          <button class="btn primary">Kaydet</button>
        </div>
      </form>
    </div></div>`;
  const f = root.querySelector('input[name=title]');
  if (isNew) setTimeout(() => f.focus(), 50);
}

function openSettings() {
  const s = sem();
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-bg" data-act="closeModalBg"><div class="modal">
    <h2>⚙️ Ayarlar</h2>
    <p class="hint">${esc(s.name)} · ${fmtMid(s.start)} – ${fmtMid(s.end)} · ${s.courses.length} ders</p>
    <button class="btn ghost block" data-act="editSem">✏️ Dönem adı / tarihlerini düzenle</button>
    <button class="btn ghost block" data-act="editCourses">📚 Dersleri düzenle</button>
    <button class="btn ghost block" data-act="newSem">➕ Yeni dönem başlat</button>
    ${S.semesters.length > 1 ? `<label>Aktif dönem<select id="semSwitch">${S.semesters.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    <div class="label" style="margin-top:18px">Yedekleme (telefon değiştirirsen veya laptoptan aktarmak için)</div>
    <div class="actions" style="margin-top:8px">
      <button class="btn ghost" data-act="export">⬇️ Yedeği indir</button>
      <button class="btn ghost" data-act="import">⬆️ Yedek yükle</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
    <button class="btn danger block" data-act="reset">Tüm verileri sil</button>
    <button class="btn primary block" data-act="closeModal">Kapat</button>
  </div></div>`;
}
const closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

/* =========================================================
   Çizim ve olaylar
   ========================================================= */
function render() {
  const app = document.getElementById('app');
  if (!sem() && UI.screen !== 'setup') UI.screen = 'setup';
  app.innerHTML = UI.screen === 'setup' ? renderSetup() : UI.screen === 'courses' ? renderCourses() : renderMain();
  if (UI.screen === 'courses') { const i = app.querySelector('input[name=name]'); if (i && !UI.editCourse) i.focus(); }
}

document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  const fd = new FormData(f);
  const v = k => (fd.get(k) || '').toString().trim();

  if (f.id === 'semForm') {
    let start = v('start'), end = v('end');
    if (end < start) [start, end] = [end, start];
    if (UI.editSem && sem()) {
      Object.assign(sem(), { name: v('name'), start, end });
      UI.editSem = false; UI.screen = 'main';
    } else {
      const s = { id: uid(), name: v('name'), start, end, courses: [], progress: {} };
      S.semesters.push(s); S.activeId = s.id; UI.screen = 'courses';
    }
    save(); render();
  }

  if (f.id === 'courseForm') {
    const s = sem();
    const slots = [...f.querySelectorAll('.slot')].map(r => ({
      day: +r.querySelector('[name=day]').value,
      start: r.querySelector('[name=ts]').value,
      end: r.querySelector('[name=te]').value,
      room: r.querySelector('[name=room]').value.trim(),
    })).filter(x => x.start);
    const data = { name: v('name'), color: v('color') || COLORS[0], slots };
    if (UI.editCourse) Object.assign(s.courses.find(c => c.id === UI.editCourse), data);
    else s.courses.push({ id: uid(), ...data });
    toast(UI.editCourse ? 'Ders güncellendi' : `“${data.name}” eklendi`);
    UI.editCourse = null; save(); render();
  }

  if (f.id === 'taskForm') {
    let start = v('start'), end = v('end');
    if (!start && end) start = end;              // sadece teslim tarihi girildiyse
    if (!start) start = todayStr();              // görevlerin her zaman bir tarihi olur
    if (end && end < start) end = start;
    if (end === start) end = '';
    const data = { title: v('title'), cat: v('cat'), courseId: v('courseId'), start, end, time: v('time'), note: v('note') };
    const id = v('id');
    if (id) Object.assign(S.tasks.find(t => t.id === id), data);
    else S.tasks.push({ id: uid(), done: false, created: Date.now(), ...data });
    save(); closeModal(); render();
    toast('Kaydedildi — ilgili tüm panellerde görünüyor');
  }

  if (f.id === 'forgetForm') {
    S.reminders.push({ id: uid(), text: v('text'), date: v('date'), repeat: v('date') ? v('repeat') : '', done: false, created: Date.now() });
    save(); render();
    const i = document.querySelector('#forgetForm input[name=text]'); if (i) i.focus();
  }

  if (f.id === 'remForm') {
    const r = S.reminders.find(x => x.id === v('id'));
    Object.assign(r, { text: v('text'), date: v('date'), repeat: v('date') ? v('repeat') : '' });
    save(); closeModal(); render();
  }
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, s = sem();
  switch (a) {
    case 'tab': UI.tab = el.dataset.tab; if (UI.tab === 'today') UI.day = todayStr(); render(); window.scrollTo(0, 0); break;
    case 'dayNav': UI.day = addDays(UI.day, +el.dataset.n); render(); break;
    case 'dayToday': UI.day = todayStr(); render(); break;
    case 'weekNav': UI.weekStart = addDays(UI.weekStart, 7 * el.dataset.n); render(); break;
    case 'weekToday': UI.weekStart = monday(todayStr()); render(); break;
    case 'monthNav': { const [y, m] = UI.month.split('-').map(Number); const d = new Date(y, m - 1 + +el.dataset.n, 1); UI.month = ymd(d).slice(0, 7); render(); break; }
    case 'monthToday': UI.month = todayStr().slice(0, 7); render(); break;
    case 'gotoDay': UI.day = el.dataset.d; UI.tab = 'today'; render(); window.scrollTo(0, 0); break;

    case 'prog': {
      const { c, w } = el.dataset;
      s.progress = s.progress || {}; s.progress[c] = s.progress[c] || {};
      if (s.progress[c][w]) delete s.progress[c][w]; else s.progress[c][w] = true;
      save(); render(); break;
    }
    case 'done': { const t = S.tasks.find(x => x.id === el.dataset.id); t.done = !t.done; save(); render(); break; }
    case 'edit': openTaskModal(S.tasks.find(x => x.id === el.dataset.id)); break;
    case 'newTask': openTaskModal(); break;
    case 'delTask': if (confirm('Bu görev silinsin mi?')) { S.tasks = S.tasks.filter(x => x.id !== el.dataset.id); save(); closeModal(); render(); } break;
    case 'clearDone': S.reminders = S.reminders.filter(x => !x.done); save(); render(); break;
    case 'remDone': {
      const r = S.reminders.find(x => x.id === el.dataset.id);
      if (!r.done && r.repeat && r.date) {       // tekrarlayan: bir sonraki tarihe kur
        r.date = nextDate(r.date, r.repeat);
        while (r.date < todayStr()) r.date = nextDate(r.date, r.repeat);
        toast(`👍 Sonraki hatırlatma: ${fmtMid(r.date)}`);
      } else r.done = !r.done;
      save(); render(); break;
    }
    case 'remEdit': openReminderModal(S.reminders.find(x => x.id === el.dataset.id)); break;
    case 'remDel': S.reminders = S.reminders.filter(x => x.id !== el.dataset.id); save(); closeModal(); render(); break;
    case 'closeModal': closeModal(); break;
    case 'closeModalBg': if (e.target === el) closeModal(); break;
    case 'pickCat': {
      const f = el.closest('form');
      f.querySelectorAll('#catChips .chip').forEach(c => c.classList.toggle('sel', c === el));
      f.cat.value = el.dataset.cat; break;
    }
    case 'quick': {
      const f = el.closest('form'), t = todayStr(), q = el.dataset.q;
      const map = { today: [t, ''], week: [t, addDays(monday(t), 6)], month: [t, monthEnd(t)], sem: [t, s.end] };
      [f.start.value, f.end.value] = map[q]; break;
    }

    // Kurulum ekranları
    case 'addSlot': {
      const box = document.getElementById('slots');
      const rows = box.querySelectorAll('.slot');
      const lastRow = rows[rows.length - 1];
      const prev = lastRow ? { day: (+lastRow.querySelector('[name=day]').value + 1) % 7, start: lastRow.querySelector('[name=ts]').value, end: lastRow.querySelector('[name=te]').value, room: lastRow.querySelector('[name=room]').value } : undefined;
      box.insertAdjacentHTML('beforeend', slotRow(prev)); break;
    }
    case 'rmSlot': el.closest('.slot').remove(); break;
    case 'suggest': { const i = document.querySelector('#courseForm input[name=name]'); i.value = el.dataset.name; i.focus(); break; }
    case 'editCourse': UI.editCourse = el.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'cancelCourse': UI.editCourse = null; render(); break;
    case 'delCourse':
      if (confirm('Ders silinsin mi? (Bu derse bağlı görevler kalır.)')) {
        s.courses = s.courses.filter(c => c.id !== el.dataset.id);
        if (s.progress) delete s.progress[el.dataset.id];
        S.tasks.forEach(t => { if (t.courseId === el.dataset.id) t.courseId = ''; });
        save(); render();
      } break;
    case 'finishCourses': UI.screen = 'main'; UI.editCourse = null; render(); window.scrollTo(0, 0); break;
    case 'cancelSetup': UI.screen = 'main'; UI.editSem = false; render(); break;

    // Ayarlar
    case 'settings': openSettings(); break;
    case 'editSem': closeModal(); UI.editSem = true; UI.screen = 'setup'; render(); break;
    case 'editCourses': closeModal(); UI.screen = 'courses'; render(); break;
    case 'newSem': closeModal(); UI.editSem = false; UI.screen = 'setup'; render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = `takvim-yedek-${todayStr()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000); break;
    }
    case 'import': document.getElementById('importFile').click(); break;
    case 'reset':
      if (confirm('Bütün dönemler, dersler ve görevler silinecek. Emin misin?')) {
        S = { semesters: [], activeId: null, tasks: [], reminders: [] }; save(); closeModal(); UI.screen = 'setup'; render();
      } break;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'semSwitch') { S.activeId = e.target.value; save(); closeModal(); render(); }
  if (e.target.id === 'importFile' && e.target.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.semesters) || !Array.isArray(d.tasks)) throw new Error();
        S = migrate(d); save(); closeModal(); UI.screen = sem() ? 'main' : 'setup'; render(); toast('Yedek yüklendi ✔');
      } catch (err) { alert('Bu dosya geçerli bir takvim yedeği değil.'); }
    };
    r.readAsText(e.target.files[0]);
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Gün değişince (uygulama açık kalırsa) ekranı tazele
let lastDay = todayStr();
setInterval(() => { if (todayStr() !== lastDay) { lastDay = todayStr(); UI.day = lastDay; UI.weekStart = monday(lastDay); render(); } }, 60000);

// Test / tanıtım verisi: adres sonuna ?demo yazılırsa ve veri yoksa örnek yükler
if (location.search.includes('demo') && !S.semesters.length) {
  const id = uid();
  const cs = PAPER_COURSES.map((n, i) => ({ id: uid(), name: n, color: COLORS[i % COLORS.length], slots: [{ day: i % 5, start: ['08:30', '11:30', '14:30'][i % 3], end: ['11:30', '14:30', '17:30'][i % 3], room: '' }] }));
  S = { semesters: [{ id, name: '2026-2027 Güz Dönemi', start: '2026-11-04', end: '2027-01-17', courses: cs, progress: { [cs[0].id]: { 1: true } } }], activeId: id, tasks: [
    { id: uid(), title: 'Nükleer Fundamentals vizesi', cat: 'sinav', start: '2026-11-23', end: '', time: '09:00', courseId: cs[0].id, note: '', done: false },
    { id: uid(), title: 'Dinamik vizesi', cat: 'sinav', start: '2026-11-24', end: '', time: '', courseId: cs[3].id, note: '', done: false },
    { id: uid(), title: 'Data vizesi', cat: 'sinav', start: '2026-11-25', end: '2026-11-26', time: '', courseId: cs[5].id, note: '', done: false },
    { id: uid(), title: 'CFD dönem projesi', cat: 'odev', start: '2026-11-08', end: '2026-12-08', time: '', courseId: cs[4].id, note: '', done: false },
    { id: uid(), title: 'Olasılık ödev 2', cat: 'odev', start: '2026-11-06', end: '2026-11-12', time: '', courseId: cs[2].id, note: '', done: false },
    { id: uid(), title: 'Kütüphanede tekrar', cat: 'bireysel', start: todayStr(), end: '', time: '19:00', courseId: '', note: '', done: false },
    { id: uid(), title: 'Ayşe ile kahve', cat: 'arkadas', start: addDays(todayStr(), 2), end: '', time: '16:00', courseId: '', note: '', done: false },
  ], reminders: [
    { id: uid(), text: 'İnternet ve yurt faturasını yatır', date: todayStr(), repeat: 'month', done: false, created: Date.now() },
    { id: uid(), text: 'Öğrenci kartını yenile', date: '', repeat: '', done: false, created: Date.now() },
  ] };
  save(); UI.screen = 'main';
}

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
