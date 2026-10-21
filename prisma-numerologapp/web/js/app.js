import {
  COLOR_HEX,
  NUMBER_PLANET,
  buildGlobalDayMap,
  calculateProfile,
  dayStatus,
  reduceNumber,
} from './numerology.js';

const STORAGE_DRAFT = 'numerologapp.draft.v1';
const STORAGE_HISTORY = 'numerologapp.history.v1';
const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
const WEEKDAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const WEEK_PLANETS = Object.freeze({
  1: 'Sole', 2: 'Luna', 3: 'Giove', 4: 'Urano/Rahu', 5: 'Mercurio',
  6: 'Venere', 7: 'Nettuno/Ketu', 8: 'Saturno', 9: 'Marte',
});

const state = {
  markdown: '',
  dayMap: {},
  profile: null,
  calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  weekStart: mondayFor(new Date()),
  installPrompt: null,
};

const byId = (id) => document.getElementById(id);
const form = byId('profile-form');
const formError = byId('form-error');
const calculateButton = byId('calculate-button');

function localDateKey(date) {
  const two = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

function mondayFor(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = result.getDay() || 7;
  result.setDate(result.getDate() - weekday + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function isoWeekFor(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - weekday);
  const year = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return { year, week };
}

function clear(element) {
  element.replaceChildren();
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function readInputs() {
  return {
    firstName: byId('first-name').value,
    middleName: byId('middle-name').value,
    lastName: byId('last-name').value,
    birthDate: byId('birth-date').value,
  };
}

function writeInputs(values) {
  byId('first-name').value = values.firstName ?? '';
  byId('middle-name').value = values.middleName ?? '';
  byId('last-name').value = values.lastName ?? '';
  byId('birth-date').value = values.birthDate ?? '';
}

function storageRead(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function storageWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function saveDraftIfRequested(values) {
  if (byId('remember-data').checked) {
    storageWrite(STORAGE_DRAFT, values);
  } else {
    try { localStorage.removeItem(STORAGE_DRAFT); } catch { /* storage unavailable */ }
  }
}

function renderNumberCards(profile) {
  const grid = byId('number-grid');
  clear(grid);
  const cards = [
    ['Firma', profile.signature],
    ['Karma', profile.karma],
    ['N. psichico', profile.psychic],
    ['Freq. nome', profile.nameFrequency],
  ];
  for (const [label, value] of cards) {
    const card = makeElement('article', 'number-card');
    card.append(
      makeElement('div', 'number-label', label),
      makeElement('div', 'number-value', String(value.number)),
      makeElement('div', 'number-planet', value.planet),
      makeElement('div', 'number-energy', value.energy),
    );
    grid.append(card);
  }
}

function renderPills(id, values) {
  const container = byId(id);
  clear(container);
  for (const value of values) container.append(makeElement('span', 'pill', String(value)));
}

function renderColors(id, colors) {
  const container = byId(id);
  clear(container);
  if (!colors.length || (colors.length === 1 && colors[0] === 'nessuno')) {
    container.append(makeElement('span', 'muted', 'Nessuno'));
    return;
  }
  for (const color of colors) {
    const chip = makeElement('span', 'color-chip');
    const swatch = makeElement('i', 'color-swatch');
    swatch.style.backgroundColor = COLOR_HEX[color] ?? '#555568';
    chip.append(swatch, document.createTextNode(color.charAt(0).toUpperCase() + color.slice(1)));
    container.append(chip);
  }
}

function renderFamousPeople(people) {
  const body = byId('famous-people');
  clear(body);
  for (const person of people) {
    const row = document.createElement('tr');
    row.append(makeElement('td', '', person.name), makeElement('td', 'muted', person.note));
    body.append(row);
  }
}

function selectProfileTab(tabName, focus = false) {
  const tabs = [...document.querySelectorAll('[data-profile-tab]')];
  const panels = [...document.querySelectorAll('[data-profile-panel]')];
  const selectedTab = tabs.find((tab) => tab.dataset.profileTab === tabName) ?? tabs[0];
  if (!selectedTab) return;

  for (const tab of tabs) {
    const selected = tab === selectedTab;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of panels) {
    const selected = panel.dataset.profilePanel === selectedTab.dataset.profileTab;
    panel.hidden = !selected;
    panel.classList.toggle('is-active', selected);
  }
  selectedTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  if (focus) selectedTab.focus({ preventScroll: true });
}

function profileDayStatus(day) {
  const reduced = reduceNumber(day);
  if (state.profile.goodDays.includes(day) || state.profile.goodDays.includes(reduced)) return 'good';
  if (state.profile.badDays.includes(day) || state.profile.badDays.includes(reduced)) return 'bad';
  return 'neutral';
}

function renderCalendar() {
  if (!state.profile) return;
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  byId('calendar-title').textContent = `${MONTHS[month]} ${year}`;
  const grid = byId('calendar-grid');
  clear(grid);
  const firstWeekday = new Date(year, month, 1).getDay() || 7;
  const numberOfDays = new Date(year, month + 1, 0).getDate();
  const todayKey = localDateKey(new Date());

  for (let index = 1; index < firstWeekday; index += 1) {
    grid.append(makeElement('span', 'calendar-day blank'));
  }
  for (let day = 1; day <= numberOfDays; day += 1) {
    const date = new Date(year, month, day);
    const classes = ['calendar-day', profileDayStatus(day)];
    if (localDateKey(date) === todayKey) classes.push('today');
    const item = makeElement('span', classes.join(' '), String(day));
    item.title = profileDayStatus(day) === 'good' ? 'Favorevole' : profileDayStatus(day) === 'bad' ? 'Da evitare' : 'Neutro';
    grid.append(item);
  }
}

function renderWeek() {
  const table = byId('week-table');
  clear(table);
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const last = days[6];
  const { year, week } = isoWeekFor(state.weekStart);
  byId('week-label').textContent = `Sett. ${week} — ${days[0].getDate()} ${MONTHS_SHORT[days[0].getMonth()]} / ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${year}`;

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(makeElement('th', '', 'Giorno'));
  for (let number = 1; number <= 9; number += 1) {
    const heading = document.createElement('th');
    heading.append(
      makeElement('span', 'week-number', String(number)),
      makeElement('span', 'week-planet', WEEK_PLANETS[number]),
    );
    heading.title = `${number} · ${WEEK_PLANETS[number]}`;
    headRow.append(heading);
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  const todayKey = localDateKey(new Date());
  days.forEach((date, index) => {
    const row = document.createElement('tr');
    if (localDateKey(date) === todayKey) row.className = 'week-today-row';
    row.append(makeElement('td', '', `${WEEKDAYS[index]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`));
    for (let number = 1; number <= 9; number += 1) {
      const status = dayStatus(date.getDate(), number, state.dayMap);
      const cell = document.createElement('td');
      const dot = makeElement('span', `week-dot ${status}`);
      const statusLabel = status === 'good' ? 'Favorevole' : status === 'bad' ? 'Da evitare' : 'Neutro';
      dot.title = `${WEEK_PLANETS[number]}: ${statusLabel}`;
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', `${WEEK_PLANETS[number]}: ${statusLabel}`);
      cell.append(dot);
      row.append(cell);
    }
    body.append(row);
  });
  table.append(body);
}

function weekAsText() {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekStart, index));
  const { year, week } = isoWeekFor(state.weekStart);
  const lines = [
    `Numerologia della Settimana ${week} (${year})`,
    `${days[0].getDate()} ${MONTHS_SHORT[days[0].getMonth()]} – ${days[6].getDate()} ${MONTHS_SHORT[days[6].getMonth()]} ${year}`,
    '',
    ['Giorno', ...Object.entries(WEEK_PLANETS).map(([number, planet]) => `${number} ${planet}`)].join('\t'),
  ];

  days.forEach((date, index) => {
    const values = [];
    for (let number = 1; number <= 9; number += 1) {
      const status = dayStatus(date.getDate(), number, state.dayMap);
      values.push(status === 'good' ? 'Favorevole' : status === 'bad' ? 'Da evitare' : 'Neutro');
    }
    lines.push([`${WEEKDAYS[index]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`, ...values].join('\t'));
  });
  return { text: lines.join('\n'), year, week };
}

function saveWeek() {
  const { text, year, week } = weekAsText();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Settimana-${year}-W${String(week).padStart(2, '0')}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderProfile(profile, scroll = true) {
  state.profile = profile;
  byId('person-name').textContent = profile.person.fullName;
  byId('person-date').textContent = `Nascita: ${profile.person.birthDate} · Nome ${profile.firstNameNumber} · Cognome ${profile.lastNameNumber}`;
  byId('ideal-signature').textContent = profile.idealSignature || '—';
  byId('signature-text').textContent = profile.signatureText;
  byId('karma-text').textContent = profile.karmaText;
  renderNumberCards(profile);
  renderPills('good-days', profile.goodDays);
  renderPills('bad-days', profile.badDays);
  renderColors('good-colors', profile.goodColors);
  renderColors('bad-colors', profile.badColors);
  renderFamousPeople(profile.famousPeople);
  state.calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.weekStart = mondayFor(new Date());
  renderCalendar();
  renderWeek();
  selectProfileTab('summary');
  byId('results').hidden = false;
  if (scroll) byId('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function calculate(values, scroll = true) {
  const profile = calculateProfile(values, state.markdown);
  renderProfile(profile, scroll);
  saveDraftIfRequested(values);
  return profile;
}

function resultAsText(profile) {
  return [
    'NUMEROLOGAPP',
    `${profile.person.fullName} — ${profile.person.birthDate}`,
    '',
    `Firma: ${profile.signature.number} · ${profile.signature.planet} · ${profile.signature.energy}`,
    `Karma: ${profile.karma.number} · ${profile.karma.planet} · ${profile.karma.energy}`,
    `Numero psichico: ${profile.psychic.number} · ${profile.psychic.planet} · ${profile.psychic.energy}`,
    `Frequenza nome: ${profile.nameFrequency.number} · ${profile.nameFrequency.planet} · ${profile.nameFrequency.energy}`,
    `Firma ideale: ${profile.idealSignature}`,
    `Giorni favorevoli: ${profile.goodDays.join(', ')}`,
    `Giorni da evitare: ${profile.badDays.join(', ')}`,
    '',
    profile.signatureText,
    '',
    profile.karmaText,
  ].join('\n');
}

async function shareResult() {
  if (!state.profile) return;
  const text = resultAsText(state.profile);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Profilo di ${state.profile.person.fullName}`, text });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `NumerologApp-${state.profile.person.fullName.replace(/\s+/g, '-')}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function historyRead() {
  const history = storageRead(STORAGE_HISTORY, []);
  return Array.isArray(history) ? history.slice(0, 20) : [];
}

function renderHistory() {
  const history = historyRead();
  const list = byId('history-list');
  clear(list);
  byId('empty-history').hidden = history.length > 0;
  byId('clear-history').hidden = history.length === 0;

  for (const item of history) {
    const row = makeElement('div', 'history-item');
    const open = makeElement('button', 'history-main');
    open.type = 'button';
    open.append(
      makeElement('strong', '', [item.firstName, item.middleName, item.lastName].filter(Boolean).join(' ')),
      makeElement('span', '', item.birthDateLabel),
    );
    open.addEventListener('click', () => {
      writeInputs(item);
      try {
        calculate(item);
        formError.textContent = '';
      } catch (error) {
        formError.textContent = error.message;
      }
    });
    const remove = makeElement('button', 'history-delete', 'Elimina');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      storageWrite(STORAGE_HISTORY, history.filter((candidate) => candidate.id !== item.id));
      renderHistory();
    });
    row.append(open, remove);
    list.append(row);
  }
}

function saveCurrentConsultation() {
  if (!state.profile) return;
  const history = historyRead();
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    firstName: state.profile.person.firstName,
    middleName: state.profile.person.middleName,
    lastName: state.profile.person.lastName,
    birthDate: state.profile.person.birthDateIso,
    birthDateLabel: state.profile.person.birthDate,
  };
  const duplicateKey = `${item.firstName}|${item.middleName}|${item.lastName}|${item.birthDate}`.toLocaleLowerCase('it');
  const withoutDuplicate = history.filter((entry) =>
    `${entry.firstName}|${entry.middleName}|${entry.lastName}|${entry.birthDate}`.toLocaleLowerCase('it') !== duplicateKey,
  );
  storageWrite(STORAGE_HISTORY, [item, ...withoutDuplicate].slice(0, 20));
  renderHistory();
  byId('save-button').textContent = 'Salvato ✓';
  window.setTimeout(() => { byId('save-button').textContent = 'Salva consulto'; }, 1600);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  formError.textContent = '';
  try {
    calculate(readInputs());
  } catch (error) {
    formError.textContent = error.message || 'Non è stato possibile eseguire il calcolo.';
  }
});

byId('share-button').addEventListener('click', shareResult);
byId('save-button').addEventListener('click', saveCurrentConsultation);
for (const tab of document.querySelectorAll('[data-profile-tab]')) {
  tab.addEventListener('click', () => selectProfileTab(tab.dataset.profileTab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-profile-tab]')];
    const current = tabs.indexOf(tab);
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectProfileTab(tabs[next].dataset.profileTab, true);
  });
}
byId('clear-form').addEventListener('click', () => {
  form.reset();
  writeInputs({});
  formError.textContent = '';
  byId('results').hidden = true;
  try { localStorage.removeItem(STORAGE_DRAFT); } catch { /* storage unavailable */ }
  byId('first-name').focus();
});
byId('calendar-prev').addEventListener('click', () => {
  state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
  renderCalendar();
});
byId('calendar-next').addEventListener('click', () => {
  state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
  renderCalendar();
});
byId('calendar-today').addEventListener('click', () => {
  state.calendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  renderCalendar();
});
byId('week-prev').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, -7); renderWeek(); });
byId('week-next').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, 7); renderWeek(); });
byId('week-today').addEventListener('click', () => { state.weekStart = mondayFor(new Date()); renderWeek(); });
byId('save-week').addEventListener('click', saveWeek);
byId('clear-history').addEventListener('click', () => {
  if (!window.confirm('Vuoi cancellare tutte le consultazioni salvate su questo dispositivo?')) return;
  storageWrite(STORAGE_HISTORY, []);
  renderHistory();
});

function updateConnectionStatus() {
  const badge = byId('connection-status');
  badge.textContent = navigator.onLine ? 'Online · offline pronta' : 'Modalità offline';
  badge.classList.toggle('is-offline', !navigator.onLine);
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installPrompt = event;
  byId('install-button').hidden = false;
});
byId('install-button').addEventListener('click', async () => {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  byId('install-button').hidden = true;
});
window.addEventListener('appinstalled', () => { byId('install-button').hidden = true; });

async function initialize() {
  byId('birth-date').max = localDateKey(new Date());
  updateConnectionStatus();
  renderHistory();
  const draft = storageRead(STORAGE_DRAFT, null);
  if (draft) {
    writeInputs(draft);
    byId('remember-data').checked = true;
  }

  try {
    const dataUrl = new URL('../data/numerologia.md', import.meta.url);
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`Dati non disponibili (${response.status})`);
    state.markdown = await response.text();
    state.dayMap = buildGlobalDayMap(state.markdown);
    renderWeek();
    calculateButton.disabled = false;
    calculateButton.textContent = 'Calcola il profilo';
  } catch (error) {
    formError.textContent = `Impossibile caricare l’archivio numerologico: ${error.message}`;
    calculateButton.textContent = 'Archivio non disponibile';
  }

  if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

initialize();
