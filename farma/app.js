// Устный зачёт: темы → карточки по разделам / Микс / По лекции / Ошибки → опрос голосом → разбор.
const $ = id => document.getElementById(id);
const KIND = { def: 'определение', list: 'перечисли', short: 'вопрос' };

// ── Хранилище (на телефоне; если недоступно — работаем без сохранения) ──
function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function drop(key) { try { localStorage.removeItem(key); } catch {} }

const settings = Object.assign({ mode: 'train', voice: '', rate: 1, speak: true, marina: true, theme: 'system', seqPos: {}, blocksDone: {}, randSeen: {} },
  load('oz.settings', {}));
const progress = load('oz.progress', {}); // cardId → { box, seen, ok }
if (settings.blocksVer !== 4) {
  settings.blocksVer = 4; settings.blocksDone = {};
  const ss = load('oz.sessions', {}); for (const k of Object.keys(ss)) if (k.endsWith(':block')) delete ss[k];
  save('oz.sessions', ss); save('oz.settings', settings);
}
const saveSettings = () => save('oz.settings', settings);

// ── Темы, карточки, блоки ──
const TOPICS = [];
for (const subj of window.BANK) for (const t of subj.topics) TOPICS.push(t);
const TOPIC = Object.fromEntries(TOPICS.map(t => [t.id, t]));
// Тема пересобрана с новой нумерацией вопросов (ver) — прогресс этой темы начинаем заново, чтобы отметки не попали не туда
settings.topicVer = settings.topicVer || {};
for (const t of TOPICS) {
  const ver = t.ver || 1;
  if ((settings.topicVer[t.id] || 1) === ver) continue;
  for (const id of Object.keys(progress)) if (id.startsWith(t.id + '-')) delete progress[id];
  delete settings.seqPos[t.id]; delete settings.blocksDone[t.id];
  const ss = load('oz.sessions', {}); for (const k of Object.keys(ss)) if (k.startsWith(t.id + ':')) delete ss[k];
  save('oz.sessions', ss);
  settings.topicVer[t.id] = ver;
  save('oz.progress', progress); save('oz.settings', settings);
}
const shortName = t => t.name.replace(/^Тема\s+\d+\.\s*/, '').replace(/\s*\(диктант\)/, '');
const badge = t => (t.hidden ? '💊' : t.strict ? 'Д' : t.id.replace(/^t/, ''));
const CARD = {};
for (const t of TOPICS) for (const c of t.cards) CARD[c.id] = { ...c, tid: c.tid || t.id, topic: shortName(t), strict: !!t.strict };
const cardsOf = tid => TOPIC[tid].cards.map(c => CARD[c.id]);
// Раздел «Определения» проверяется всегда строго
const modeFor = c => (c && c.strict ? 'exam' : settings.mode);
const learnedIn = tid => TOPIC[tid].cards.filter(c => (progress[c.id]?.box || 0) >= 2).length;
const weakIn = tid => cardsOf(tid).filter(c => progress[c.id] && progress[c.id].seen > 0 && progress[c.id].box === 0);

// Разделы темы (смысловые группы) → блоки: раздел целиком; совсем маленькие (1–2 карточки) приклеиваются к соседнему
const BLOCKS = {};
function topicBlocks(tid) {
  if (BLOCKS[tid]) return BLOCKS[tid];
  const secs = [];
  for (const c of cardsOf(tid)) {
    const name = c.s || 'Вопросы';
    if (!secs.length || secs[secs.length - 1].name !== name) secs.push({ name, cards: [] });
    secs[secs.length - 1].cards.push(c);
  }
  const blocks = [];
  secs.forEach((s, si) => {
    const b = { names: [s.name], sis: [si], part: 1, parts: 1, cards: s.cards.slice() };
    const last = blocks[blocks.length - 1];
    if (last && (last.cards.length < 3 || b.cards.length < 3)) {
      last.names.push(...b.names); last.sis.push(...b.sis); last.cards = last.cards.concat(b.cards);
    } else blocks.push(b);
  });
  BLOCKS[tid] = blocks; BLOCKS[tid].secs = secs;
  return blocks;
}
const blockLabel = b => (b.parts > 1 ? `${b.names[0]} · ${b.part}/${b.parts}` : b.names.join(' · '));
const doneSet = tid => new Set(settings.blocksDone[tid] || []);
function firstNotDone(tid, from = 0) {
  const bl = topicBlocks(tid), d = doneSet(tid);
  for (let k = 0; k < bl.length; k++) { const i = (from + k) % bl.length; if (!d.has(i)) return i; }
  return -1;
}

// ── Экраны и тема оформления ──
let screenNow = 'home', screenBefore = 'home';
// Кнопка «Назад» телефона: внутри приложения держим одну «защитную» запись в истории.
// Нажали «Назад» → шаг назад по экранам; с главного экрана — обычный выход.
let hasGuard = false;
function show(screen) {
  if ((screen === 'settings' || screen === 'help') && screenNow !== 'settings' && screenNow !== 'help') screenBefore = screenNow;
  screenNow = screen;
  rememberScreen(screen);
  for (const s of ['home', 'topic', 'unfinished', 'drugsScr', 'ready', 'settings', 'help', 'study', 'quiz', 'results']) $(s).hidden = s !== screen;
  window.scrollTo(0, 0);
  if (screen !== 'home' && !hasGuard) { history.pushState({ oz: 1 }, ''); hasGuard = true; }
}
function armGuard() { if (screenNow !== 'home' && !hasGuard) { history.pushState({ oz: 1 }, ''); hasGuard = true; } }
document.addEventListener('pointerdown', armGuard, true);
window.addEventListener('popstate', () => {
  hasGuard = false;
  if (screenNow === 'home') return toast('Нажми «Назад» ещё раз, чтобы выйти');
  goBack();
});
let toastTimer = null;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
function goBack() {
  switch (screenNow) {
    case 'settings': return $('setBack').click();
    case 'help': return $('helpBack').click();
    case 'topic': case 'unfinished': renderHome(); return show('home');
    case 'ready': return $('readyBack').click();
    case 'study': return pauseToTopic();
    case 'quiz':
      if (!$('peek').hidden) { closePeek(); history.pushState({ oz: 1 }, ''); hasGuard = true; return; }
      return pauseToTopic();
    case 'results': return $('resBack').click();
    case 'drugsScr': return $('drugsBack').click();
  }
}
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && darkMQ && darkMQ.matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#070b1a' : '#eef2fc';
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applyTheme);

function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
}
const shortDate = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };

// ── Главный ──
function renderHome() {
  const box = $('topics'); box.innerHTML = '';
  for (const t of TOPICS) {
    if (t.hidden) continue;
    const n = t.cards.length, l = learnedIn(t.id);
    const b = document.createElement('button');
    b.className = 'glass topic';
    b.innerHTML = `<span class="num"></span><span class="tbody"><span class="tname"></span><span class="bar"><i style="width:${Math.round(l / n * 100)}%"></i></span></span><span class="cnt">${l}/${n}</span>`;
    b.querySelector('.num').textContent = badge(t);
    b.querySelector('.tname').textContent = shortName(t);
    b.onclick = () => openTopic(t.id);
    box.append(b);
  }
  if (TOPIC.drugs) {
    const b = document.createElement('button');
    b.className = 'glass topic drugs-entry';
    b.innerHTML = `<span class="num">💊</span><span class="tbody"><span class="tname">Препараты · все темы</span></span><span class="cnt">${drugNames('all').length}</span>`;
    b.onclick = () => openDrugs('all');
    box.append(b);
  }
  renderResume();
  $('noSpeech').hidden = !!Recognition;
  $('inApp').hidden = !IN_APP || load('oz.inAppHidden', false);
}
// Встроенный браузер (Телеграм, ВК, Инстаграм): «Назад» телефона закрывает его целиком
const IN_APP = /; wv\)|Telegram|Instagram|FBAN|FBAV|VKAndroidApp|vkclient/i.test(navigator.userAgent);
$('inAppClose').onclick = () => { save('oz.inAppHidden', true); $('inApp').hidden = true; };

// ── Тема ──
let curTid = null;
function openTopic(tid) { curTid = tid; renderTopic(); show('topic'); }
function renderTopic() {
  const t = TOPIC[curTid], n = t.cards.length, l = learnedIn(curTid);
  $('tName').textContent = shortName(t);
  $('tSub').textContent = `${l} из ${n} выучено`;
  $('tRing').style.setProperty('--p', `${Math.round(l / n * 100)}%`);
  $('tRingNum').textContent = l;
  const bl = topicBlocks(curTid), cur = firstNotDone(curTid);
  $('tCards').innerHTML = cur >= 0
    ? `▶ Карточки<small>${esc(blockLabel(bl[cur]))}</small>`
    : `↻ Карточки заново<small>все разделы пройдены</small>`;
  const pos = settings.seqPos[curTid] || 0;
  $('tSeq').textContent = pos > 0 && pos < n ? `По лекции · ${pos + 1}` : 'По лекции';
  const weak = weakIn(curTid).length;
  $('tErr').textContent = weak ? `Ошибки · ${weak}` : 'Ошибки';
  $('tErr').disabled = !weak;
  // разделы
  const d = doneSet(curTid), list = $('tSections'); list.innerHTML = '';
  const secs = bl.secs.map(x => ({ name: x.name, count: x.cards.length, idx: [] }));
  bl.forEach((b, i) => b.sis.forEach(si => secs[si].idx.push(i)));
  secs.forEach((s, k) => {
    const done = s.idx.every(i => d.has(i)), now = s.idx.includes(cur);
    const row = document.createElement('button');
    row.className = 'sec' + (done ? ' done' : '') + (now ? ' now' : '');
    row.innerHTML = `<span class="num">${done ? '✓' : k + 1}</span><span class="sname"></span><small>${s.count}</small>`;
    row.querySelector('.sname').textContent = s.name;
    row.onclick = () => { const i = s.idx.find(x => !d.has(x)); startBlock(curTid, i ?? s.idx[0]); };
    list.append(row);
  });
  const box = $('tResumes'); box.innerHTML = '';
  for (const s of allSessions().filter(x => x.tid === curTid || (x.kind === 'drugs' && x.scope === curTid))) box.append(resumeRow(s, 'topic', false));
  $('tDrugs').hidden = !drugNames(curTid).length;
  $('tRand').classList.toggle('wide', $('tDrugs').hidden);
  const pend = $('tPending');
  pend.hidden = !(t.pending && t.pending.length);
  if (!pend.hidden) {
    pend.querySelector('summary').textContent = `Ждут материала: ${t.pending.length}`;
    pend.querySelector('p').textContent = t.pending.join(' · ');
  }
}
$('topicBack').onclick = () => { renderHome(); show('home'); };
$('tCards').onclick = () => {
  let i = firstNotDone(curTid);
  if (i < 0) { settings.blocksDone[curTid] = []; saveSettings(); i = 0; }
  startBlock(curTid, i);
};
$('tMix').onclick = () => startRun(curTid, 'mix');
$('tRand').onclick = () => startRun(curTid, 'rand');
$('tSeq').onclick = () => startRun(curTid, 'seq');
$('tErr').onclick = () => startRun(curTid, 'errors');

// ── Настройки ──
function renderSettings() {
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === settings.mode));
  document.querySelectorAll('[data-rate]').forEach(b => b.setAttribute('aria-checked', +b.dataset.rate === settings.rate));
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', b.dataset.themeSet === settings.theme));
  $('optSpeak').checked = settings.speak;
  $('optMarina').checked = settings.marina;
  $('helpAndroid').hidden = IS_IOS; $('helpIos').hidden = !IS_IOS;
  renderVoices();
}
document.querySelectorAll('[data-settings]').forEach(b => b.onclick = () => { renderSettings(); show('settings'); });
document.querySelectorAll('[data-help]').forEach(b => b.onclick = () => {
  helpFrom = screenNow;
  document.querySelectorAll('#help details').forEach(d => { d.open = false; });
  show('help');
});
let helpFrom = 'home';
$('helpBack').onclick = () => { if (helpFrom === 'settings') { renderSettings(); return show('settings'); } $('setBack').click(); };
$('setBack').onclick = () => {
  if (screenBefore === 'topic') renderTopic(); else if (screenBefore === 'home') renderHome();
  show(screenBefore);
};
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { settings.mode = b.dataset.mode; saveSettings(); renderSettings(); });
document.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => { settings.rate = +b.dataset.rate; saveSettings(); renderSettings(); testVoice(); });
document.querySelectorAll('[data-theme-set]').forEach(b => b.onclick = () => { settings.theme = b.dataset.themeSet; saveSettings(); applyTheme(); renderSettings(); });
$('optSpeak').onchange = e => { settings.speak = e.target.checked; saveSettings(); };
$('optMarina').onchange = e => { settings.marina = e.target.checked; saveSettings(); testVoice(); };

// ── Озвучка: голоса — те, что установлены на телефоне ──
let ruVoices = [], ruVoice = null;
function pickVoice() {
  ruVoices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('ru'))
    .sort((a, b) => voiceQuality(b) - voiceQuality(a));
  ruVoice = ruVoices.find(v => v.voiceURI === settings.voice)
    || ruVoices.find(v => voiceQuality(v) > 0)
    || ruVoices.find(v => /google|милена|milena|svetlana|irina|dariya/i.test(v.name)) || ruVoices[0] || null;
}
// На iPhone у обычной и улучшенной версии одно имя — различаем по voiceURI
function voiceQuality(v) {
  const id = (v.voiceURI + ' ' + v.name).toLowerCase();
  return /premium|премиум/.test(id) ? 2 : /enhanced|улучш/.test(id) ? 1 : 0;
}
function voiceLabel(v) {
  const q = voiceQuality(v);
  const twins = ruVoices.filter(x => x.name === v.name).length > 1;
  return v.name + (q === 2 ? ' — премиум' : q === 1 ? ' — улучшенный' : twins ? ' — обычный' : '');
}
function renderVoices() {
  if (!('speechSynthesis' in window)) { $('voice').disabled = true; return; }
  const sel = $('voice'); sel.innerHTML = '';
  if (!ruVoices.length) { sel.append(new Option('Русских голосов не найдено', '')); sel.disabled = true; return; }
  sel.disabled = false;
  for (const v of ruVoices) sel.append(new Option(voiceLabel(v), v.voiceURI));
  sel.value = ruVoice ? ruVoice.voiceURI : '';
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = () => { pickVoice(); if (screenNow === 'settings') renderVoices(); };
}
$('voice').onchange = e => { settings.voice = e.target.value; saveSettings(); pickVoice(); testVoice(); };

// Записи голоса Марины (Яндекс): audio/<ключ>.mp3, список — window.AUDIO. Нет записи или не играет — голос телефона.
// Один и тот же элемент <audio>: на iPhone после первого касания он может играть и дальше без нового касания.
const player = new Audio();
let playerDone = null;
function speakSystem(text) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    u.lang = 'ru-RU'; if (ruVoice) u.voice = ruVoice; u.rate = settings.rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
function speak(text) {
  hush();
  const key = audioKey(text);
  if (!settings.marina || !(window.AUDIO && window.AUDIO[key])) return speakSystem(text);
  return new Promise(resolve => {
    let over = false;
    const done = ok => { if (over) return; over = true; playerDone = null; player.onended = player.onerror = null; ok ? resolve() : speakSystem(text).then(resolve); };
    playerDone = () => { over = true; resolve(); };
    player.onended = () => done(true);
    player.onerror = () => done(false);
    player.src = 'audio/' + key + '.mp3';
    player.playbackRate = settings.rate;
    const p = player.play();
    if (p && p.catch) p.catch(() => done(false));
  });
}
function say(text) { return settings.speak ? speak(text) : Promise.resolve(); }
function hush() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (!player.paused) player.pause();
  if (playerDone) { const f = playerDone; playerDone = null; f(); }
}
function testVoice() { speak('Что такое антибиотики? Назови определение.'); }
$('voiceTest').onclick = testVoice;

// ── Распознавание речи: держишь кнопку — пишет, отпустила — остановилось ──
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// Chrome на Android в непрерывном режиме дублирует фразы — там пишем по фразе и перезапускаем, пока кнопка зажата
const IS_ANDROID = /android/i.test(navigator.userAgent);
const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let rec = null, holding = false, baseText = '';
let finishing = null;   // запись, которая уже остановлена, но ещё отдаёт последние слова

function startListening() {
  if (!Recognition || rec) return;
  hush();
  baseText = $('answer').value.trim();
  const r = new Recognition();
  rec = r;
  r.lang = 'ru-RU'; r.continuous = true; r.interimResults = true;
  // Пишем только в своём «нажатии»: поздние результаты старой записи игнорируются
  r.onresult = e => {
    if (r !== rec && r !== finishing) return;
    const heard = mergeResults(e.results);
    $('answer').value = (baseText ? baseText + ' ' : '') + heard;
  };
  r.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
      showFeedback('bad', 'Нет доступа к микрофону', '<p>Разреши микрофон для этой страницы в настройках браузера или отвечай текстом.</p>');
    else if (e.error === 'network')
      showFeedback('bad', 'Распознавание недоступно', '<p>Нет связи с сервисом распознавания речи. Пока можно отвечать текстом.</p>');
    else if (e.error === 'audio-capture')
      showFeedback('bad', 'Микрофон не найден', '<p>Проверь, что микрофон подключён и разрешён.</p>');
  };
  r.onend = () => {
    // Телефон может оборвать запись на паузе — если кнопку ещё держат, продолжаем
    if (r === rec && holding) { baseText = $('answer').value.trim(); try { r.start(); return; } catch {} }
    if (r === rec) rec = null;
    if (r === finishing) finishing = null;
    // Исправляем ослышки терминов по словарю лекций
    $('answer').value = Checker.correctTerms($('answer').value, window.VOCAB);
    updateMic();
  };
  try { r.start(); } catch { rec = null; }
  updateMic();
}
// Chrome на Android в непрерывном режиме иногда повторяет уже сказанное в следующих результатах — склеиваем без повторов
function mergeResults(results) {
  let out = '';
  for (const r of Array.from(results)) {
    const t = (r[0] && r[0].transcript || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const lo = out.toLowerCase(), tl = t.toLowerCase();
    if (!out) out = t;
    else if (tl.startsWith(lo)) out = t;          // новый кусок уже содержит всё прежнее
    else if (lo.endsWith(tl)) continue;            // повтор хвоста
    else out += ' ' + t;
  }
  return out;
}
function stopListening() {
  holding = false;
  if (!rec) return updateMic();
  finishing = rec; rec = null;
  try { finishing.stop(); } catch {}
  updateMic();
}
function abortListening() {
  holding = false;
  for (const r of [rec, finishing]) if (r) { try { r.abort(); } catch {} }
  rec = finishing = null;
  updateMic();
}
function updateMic() {
  const on = !!rec;
  $('mic').classList.toggle('on', on);
  $('micLabel').textContent = !Recognition ? 'Голос недоступен — пиши' : on ? 'Говори… отпусти, чтобы остановить' : 'Удерживай и говори';
}
const mic = $('mic');
// На телефоне — сенсорные события: долгое касание не превращается в «меню» и не обрывает запись
function micDown(e) {
  if (!Recognition) { $('answer').focus(); return; }
  if (e.cancelable) e.preventDefault();
  if (holding) return;
  holding = true; startListening();
}
function micUp() { if (holding) stopListening(); }
if ('ontouchstart' in window) {
  mic.addEventListener('touchstart', micDown, { passive: false });
  mic.addEventListener('touchend', micUp);
  mic.addEventListener('touchcancel', micUp);
} else {
  mic.addEventListener('pointerdown', e => { try { mic.setPointerCapture(e.pointerId); } catch {} micDown(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) mic.addEventListener(ev, micUp);
}
mic.addEventListener('contextmenu', e => e.preventDefault());
$('clear').onclick = () => { abortListening(); $('answer').value = ''; baseText = ''; $('answer').focus(); };

// ── Занятие: что и в каком порядке спрашиваем ──
let run = { tid: null, kind: 'mix' };          // kind: mix | seq | block | errors | rand
let queue = [], current = null, lastId = null, session = { asked: 0, ok: 0, missed: new Map() };
let retryList = null;                            // «Повторить ошибки» и режим «Ошибки»
let block = null;                                // { idx, cards, phase: study|quiz, studyIdx, quizLeft, done }
let seqIndex = 0, seqDone = false;
const WEIGHT = [8, 5, 3, 1.5, 1];
const isSeq = () => run.kind === 'seq' && !retryList;

function pickCard() {
  if (retryList) return retryList.shift() || null;
  if (run.kind === 'drugs') return (drugList || []).shift() || null;
  if (run.kind === 'rand') return (randList || []).shift() || null;
  if (block) return block.quizLeft.shift() || null;
  if (run.kind === 'seq') {
    seqIndex = settings.seqPos[run.tid] || 0;
    if (seqIndex >= queue.length) { seqDone = true; return null; }
    return queue[seqIndex];
  }
  const pool = queue.filter(c => c.id !== lastId);
  const list = pool.length ? pool : queue;
  const w = list.map(c => WEIGHT[Math.min(progress[c.id]?.box || 0, 4)]);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) if ((r -= w[i]) <= 0) return list[i];
  return list[list.length - 1];
}

function resetRun(tid, kind) {
  run = { tid, kind }; curTid = tid;
  queue = cardsOf(tid);
  session = { asked: 0, ok: 0, missed: new Map() };
  retryList = null; block = null; seqDone = false; current = null; randList = null;
  cheerState = { last: 0, streak: 0, misses: 0, recent: cheerState.recent, seqMark: 0 };
}
// ── Препараты: вопросы только про отдельный препарат (группа + то, что о нём в лекции) ──
let drugList = null, drugMode = null;
const drugCards = scope => (TOPIC.drugs ? cardsOf('drugs').filter(c => scope === 'all' || c.tid === scope) : []);
const drugNames = scope => [...new Set(drugCards(scope).map(c => c.drug))];
function drugGroups(scope) {
  const out = [];
  for (const c of drugCards(scope)) {
    // все темы — по лекциям (тогда «к какой группе относится» имеет смысл); в теме — по группам
    const key = scope === 'all' ? c.tid : c.tid + '|' + c.s;
    let g = out.find(x => x.key === key);
    if (!g) out.push(g = { key, tid: c.tid, name: scope === 'all' ? shortName(TOPIC[c.tid]) : c.s, cards: [], drugs: new Set() });
    g.cards.push(c); g.drugs.add(c.drug);
  }
  return out;
}
let drugScope = 'all', drugsFromAll = false;
function openDrugs(scope) {
  drugScope = scope;
  const names = drugNames(scope);
  $('dTitle').textContent = scope === 'all' ? 'Препараты · все темы' : `Препараты · ${shortName(TOPIC[scope])}`;
  $('dSub').textContent = `${names.length} препаратов · ${drugCards(scope).length} вопросов`;
  const box = $('dGroups'); box.innerHTML = '';
  $('dGroupsLabel').hidden = box.hidden = scope !== 'all';      // в теме — только три режима
  if (scope === 'all') drugGroups(scope).forEach((g, k) => {
    const row = document.createElement('button');
    row.className = 'sec';
    row.innerHTML = `<span class="num">${k + 1}</span><span class="sname"></span>${scope === 'all' ? `<span class="tb">${esc(badge(TOPIC[g.tid]))}</span>` : ''}<small>${g.drugs.size}</small>`;
    row.querySelector('.sname').textContent = g.name;
    row.onclick = () => { drugsFromAll = true; openDrugs(g.tid); };   // лекция → три режима: случайный, микс, по порядку
    box.append(row);
  });
  show('drugsScr');
}
function startDrugs(scope, mode, g, direct) {
  resetRun('drugs', 'drugs');
  run.scope = scope; drugMode = mode;
  let list, title, sub;
  if (mode === 'random') {
    const names = drugNames(scope), d = names[Math.floor(Math.random() * names.length)];
    list = drugCards(scope).filter(c => c.drug === d);              // сначала «к какой группе», потом факты
    title = '🎲 Случайный препарат'; sub = `${list.length} ${plural(list.length, 'вопрос', 'вопроса', 'вопросов')} об одном препарате`;
  } else if (mode === 'group') {
    list = shuffle(g.cards); title = g.name; sub = `${g.drugs.size} препаратов · ${list.length} вопросов вперемешку`;
  } else if (mode === 'seq') {
    list = drugCards(scope); title = 'По порядку'; sub = `${drugNames(scope).length} препаратов · ${list.length} вопросов по лекции`;
  } else {
    list = shuffle(drugCards(scope)); title = 'Микс'; sub = `${list.length} вопросов вперемешку`;
  }
  drugList = list; queue = list.slice();
  const go = () => { dropSession(sessKey()); show('quiz'); nextCard(); };
  if (direct) return go();
  showReady(scope === 'all' ? 'drugs' : scope, title, sub, go, 'drugs');
}
$('tDrugs').onclick = () => { drugsFromAll = false; openDrugs(curTid); };
$('dRandom').onclick = () => startDrugs(drugScope, 'random');
$('dAll').onclick = () => startDrugs(drugScope, 'all');
$('dSeq').onclick = () => startDrugs(drugScope, 'seq');
$('drugsBack').onclick = () => {
  if (drugScope === 'all') { drugsFromAll = false; renderHome(); show('home'); }
  else if (drugsFromAll) openDrugs('all');
  else openTopic(drugScope);
};

// «10 наугад»: каждый раз новые вопросы, пока не пройдёт вся тема по кругу
const RAND_N = 10;
let randList = null;
function pickRandom(tid) {
  const all = cardsOf(tid), ids = new Set(all.map(c => c.id));
  let seen = (settings.randSeen[tid] || []).filter(id => ids.has(id));
  let fresh = shuffle(all.filter(c => !seen.includes(c.id)));
  if (fresh.length < RAND_N) {                     // круг закончился — добираем из уже бывших, начинаем новый
    const take = shuffle(all.filter(c => !fresh.includes(c))).slice(0, RAND_N - fresh.length);
    fresh = fresh.concat(take); seen = take.map(c => c.id);
  } else { fresh = fresh.slice(0, RAND_N); seen = seen.concat(fresh.map(c => c.id)); }
  settings.randSeen[tid] = seen; saveSettings();
  return fresh;
}
function startRun(tid, kind) {
  resetRun(tid, kind);
  if (kind === 'rand') {
    return showReady(tid, KIND_LABEL.rand, `${RAND_N} случайных вопросов`, () => {
      dropSession(`${tid}:rand`);
      randList = pickRandom(tid); queue = randList.slice();
      show('quiz'); nextCard();
    }, 'topic');
  }
  if (kind === 'seq' && (settings.seqPos[tid] || 0) >= queue.length) { settings.seqPos[tid] = 0; saveSettings(); }
  if (kind === 'errors') retryList = weakIn(tid);
  const n = queue.length, pos = settings.seqPos[tid] || 0;
  const sub = kind === 'seq' ? (pos ? `С вопроса ${pos + 1} из ${n}` : `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')} по порядку`)
    : kind === 'errors' ? `${retryList.length} ${plural(retryList.length, 'вопрос', 'вопроса', 'вопросов')} с ошибками`
    : `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')} вперемешку`;
  showReady(tid, KIND_LABEL[kind], sub, () => { dropSession(`${tid}:${kind}`); show('quiz'); nextCard(); }, 'topic');
}

// ── «Готова?» — вопрос читается только после нажатия ──
let readyStart = null, readyBackTo = 'topic';
function showReady(tid, title, sub, start, backTo) {
  abortListening(); hush();
  readyStart = start; readyBackTo = backTo;
  const t = TOPIC[tid];
  $('rdBadge').textContent = badge(t);
  $('rdTopic').textContent = shortName(t);
  $('rdTitle').textContent = title;
  $('rdSub').textContent = sub;
  $('rdSpeak').checked = settings.speak;
  show('ready');
}
$('readyGo').onclick = () => { if (readyStart) readyStart(); };
$('readyBack').onclick = () => {
  if (readyBackTo === 'drugs') return openDrugs(run.scope || 'all');
  if (readyBackTo === 'study' && block) { block.studyIdx = block.cards.length - 1; return showStudy(); }
  if (readyBackTo === 'unfinished') { renderUnfinished(); show('unfinished'); }
  else if (readyBackTo === 'home') { renderHome(); show('home'); }
  else openTopic(run.tid);
};
$('rdSpeak').onchange = e => { settings.speak = e.target.checked; saveSettings(); };
function pauseToTopic() {
  abortListening(); hush();
  saveSession();
  if (run.kind === 'drugs') return openDrugs(run.scope || 'all');
  openTopic(run.tid);
}

// ── Карточки блока ──
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function startBlock(tid, idx) {
  dropSession(`${tid}:block`);
  resetRun(tid, 'block');
  const b = topicBlocks(tid)[idx];
  block = { idx, cards: b.cards, phase: 'study', studyIdx: 0, quizLeft: [] };
  showStudy();
}
const curBlockLabel = () => blockLabel(topicBlocks(run.tid)[block.idx]);
function showStudy() {
  abortListening(); hush();
  block.phase = 'study';
  const i = block.studyIdx, c = block.cards[i];
  $('studyScore').textContent = `${i + 1} / ${block.cards.length}`;
  $('sTopic').textContent = curBlockLabel();
  $('sKind').textContent = c.strict ? 'строго' : KIND[c.t];
  $('sKind').classList.toggle('strict', !!c.strict);
  $('sQ').textContent = c.q;
  $('sA').innerHTML = c.t === 'list' || !c.a ? `<ul>${c.items.map(x => `<li>${esc(x.t)}</li>`).join('')}</ul>` : markKeys(c);
  $('sDots').innerHTML = block.cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('sPrev').disabled = i === 0;
  const last = i === block.cards.length - 1;
  $('sNext').textContent = last ? 'К опросу ▶' : 'Дальше →';
  $('sSkip').hidden = last;
  show('study');
  saveSession();
}
function studyMove(d) {
  const n = block.studyIdx + d;
  if (n < 0) return;
  if (n >= block.cards.length) return startBlockQuiz();
  block.studyIdx = n; showStudy();
}
function startBlockQuiz() {
  hush();
  block.phase = 'quiz';
  block.quizLeft = shuffle(block.cards);
  const lastRead = block.cards[block.cards.length - 1], q = block.quizLeft;
  if (q.length > 1 && q[0] === lastRead) { const j = 1 + Math.floor(Math.random() * (q.length - 1)); [q[0], q[j]] = [q[j], q[0]]; }
  session = { asked: 0, ok: 0, missed: new Map() };
  const n = block.quizLeft.length;
  showReady(run.tid, curBlockLabel(), `Опрос: ${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')} по карточкам`, () => { show('quiz'); nextCard(); }, 'study');
}
$('sPrev').onclick = () => studyMove(-1);
$('sNext').onclick = () => studyMove(1);
$('sSkip').onclick = startBlockQuiz;
$('studyBack').onclick = () => pauseToTopic();
(() => {   // после ответа: свайп влево по вопросу — следующий
  let x0 = null;
  const card = document.querySelector('#quiz .card');
  card.addEventListener('pointerdown', e => { x0 = e.clientX; });
  card.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (dx < -60 && finished && !$('after').hidden) $('next').click();
  });
})();
(() => {   // листание карточек пальцем
  let x0 = null;
  const card = $('studyCard');
  card.addEventListener('pointerdown', e => { x0 = e.clientX; });
  card.addEventListener('pointerup', e => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    // с последней карточки в опрос — только кнопкой, не свайпом
    if (Math.abs(dx) > 60 && !(dx < 0 && block.studyIdx === block.cards.length - 1)) studyMove(dx < 0 ? 1 : -1);
  });
})();

// ── Сохранение занятия: можно прерваться и вернуться ──
// Незаконченные занятия: отдельно для каждой пары «тема:режим»
const sessKey = () => (run.kind === 'drugs' ? `drugs:drugs@${run.scope}` : `${run.tid}:${run.kind}`);
function loadSessions() {
  const all = load('oz.sessions', {});
  const old = load('oz.session', null);                 // перенос из прежней версии (одно занятие)
  if (old) { if (old.v === 2 && TOPIC[old.tid]) all[`${old.tid}:${old.kind}`] = old; drop('oz.session'); save('oz.sessions', all); }
  return all;
}
function dropSession(key) { const all = loadSessions(); if (all[key]) { delete all[key]; save('oz.sessions', all); } }
function saveSession() {
  if (!run.tid || (!current && !block)) return;
  const all = loadSessions();
  all[sessKey()] = {
    v: 2, tid: run.tid, kind: run.kind,
    currentId: current && !finished && !(block && block.phase === 'study') ? current.id : null,
    asked: session.asked, ok: session.ok, missed: [...session.missed.keys()],
    retry: retryList ? retryList.map(c => c.id) : null,
    block: block ? { idx: block.idx, phase: block.phase, studyIdx: block.studyIdx, quizLeft: block.quizLeft.map(c => c.id) } : null,
    ...(run.kind === 'drugs' ? { scope: run.scope, drugMode, drugs: (drugList || []).map(c => c.id), total: queue.length } : {}),
    ...(run.kind === 'rand' ? { rand: (randList || []).map(c => c.id), total: queue.length } : {}),
    savedAt: Date.now(),
  };
  save('oz.sessions', all);
}
const KIND_LABEL = { mix: 'Микс', seq: 'По лекции', block: 'Карточки', errors: 'Ошибки', drugs: 'Препараты', rand: '10 наугад' };
function allSessions() {
  return Object.entries(loadSessions())
    .filter(([, s]) => s && s.v === 2 && TOPIC[s.tid])
    .map(([key, s]) => sessionInfo(key, s))
    .sort((a, b) => b.savedAt - a.savedAt);
}
function sessionInfo(key, s) {
  const t = TOPIC[s.tid];
  let detail = `вопрос ${Math.max(s.asked, 1)} · ✓ ${s.ok}`;
  if (s.kind === 'drugs') detail = `${s.scope === 'all' ? 'все темы' : shortName(TOPIC[s.scope] || t)} · ${Math.max(s.asked, 1)} из ${s.total || '?'}`;
  if (s.kind === 'rand') detail = `${Math.max(s.asked, 1)} из ${s.total || RAND_N} · ✓ ${s.ok}`;
  if (s.kind === 'seq') detail = `${Math.min((settings.seqPos[s.tid] || 0) + (s.currentId ? 1 : 0), t.cards.length)} из ${t.cards.length}`;
  if (s.block) { const b = topicBlocks(s.tid)[s.block.idx]; if (b) detail = blockLabel(b) + (s.block.phase === 'study' ? '' : ' · опрос'); }
  return { ...s, key, detail, what: `${KIND_LABEL[s.kind]} · ${detail}` };
}
// Строка «Продолжить»: ▶ — продолжить, ✕ — забыть
function resumeRow(s, from, withTopic) {
  const t = TOPIC[s.tid];
  const row = document.createElement('div');
  row.className = 'glass resume';
  row.innerHTML = `<span class="num"></span><span class="resume-txt"><b></b><span></span></span>
    <button class="icon-btn sm" aria-label="Удалить незаконченное">✕</button><button class="go" aria-label="Продолжить">▶</button>`;
  row.querySelector('.num').textContent = badge(t);
  row.querySelector('b').textContent = withTopic ? shortName(t) : `Продолжить · ${KIND_LABEL[s.kind]}`;
  row.querySelector('.resume-txt span').textContent = `${withTopic ? s.what : s.detail} · ${shortDate(s.savedAt)}`;
  row.querySelector('.icon-btn').onclick = () => {
    dropSession(s.key);
    if (screenNow === 'topic') renderTopic(); else { renderUnfinished(); if (!allSessions().length) { renderHome(); show('home'); } }
  };
  row.querySelector('.go').onclick = () => resumeSession(s.key, from);
  return row;
}
function renderResume() {
  const list = allSessions();
  $('resumeBox').hidden = !list.length;
  if (!list.length) return;
  const last = list[0], t = TOPIC[last.tid];
  $('resumeTitle').textContent = `Незаконченные · ${list.length}`;
  $('resumeSub').textContent = `последнее: ${badge(t)} · ${last.what} · ${shortDate(last.savedAt)}`;
}
function renderUnfinished() {
  const box = $('unfList'); box.innerHTML = '';
  for (const s of allSessions()) box.append(resumeRow(s, 'unfinished', true));
}
$('resumeBox').onclick = () => { renderUnfinished(); show('unfinished'); };
$('unfBack').onclick = () => { renderHome(); show('home'); };
function resumeSession(key, from, direct) {
  const raw = loadSessions()[key];
  if (!raw || !TOPIC[raw.tid]) return;
  const s = sessionInfo(key, raw);
  resetRun(s.tid, s.kind);
  const ids = a => (a || []).filter(id => CARD[id]).map(id => CARD[id]);
  session = { asked: s.asked, ok: s.ok, missed: new Map(ids(s.missed).map(c => [c.id, c])) };
  retryList = s.retry ? ids(s.retry) : null;
  const bl = s.block && topicBlocks(s.tid)[s.block.idx];
  if (bl) block = { idx: s.block.idx, cards: bl.cards, phase: s.block.phase, studyIdx: s.block.studyIdx || 0, quizLeft: ids(s.block.quizLeft) };
  if (block && block.phase === 'study') return showStudy();
  if (s.kind === 'rand') { randList = ids(s.rand); queue = new Array(s.total || RAND_N); }
  if (s.kind === 'drugs') { run.scope = s.scope; drugMode = s.drugMode; drugList = ids(s.drugs); queue = new Array(s.total || drugList.length); }
  const go = () => {
    show('quiz');
    if (s.currentId && CARD[s.currentId]) {
      if (isSeq()) seqIndex = settings.seqPos[s.tid] || 0;
      showCard(CARD[s.currentId]);
    } else nextCard();
  };
  if (direct) return go();
  showReady(s.kind === 'drugs' && s.scope !== 'all' ? s.scope : s.tid, 'Продолжение', s.what, go, from);
}

// ── Ход опроса ──
let attempt = 1, found = new Set(), finished = false, hintLevel = 0, usedHint = false;

function nextCard() {
  abortListening();
  const card = pickCard();
  if (!card) {
    const wasRetry = !!retryList;
    retryList = null;
    if (block && !block.quizLeft.length && !block.done) {
      const d = doneSet(run.tid); d.add(block.idx);
      settings.blocksDone[run.tid] = [...d]; saveSettings();
      block.done = true;
      if (firstNotDone(run.tid) < 0) seqDone = true;
    }
    // доведено до конца — незаконченное этого режима больше не нужно
    if (run.kind === 'drugs' && drugMode === 'random' && !wasRetry) return startDrugs(run.scope, 'random', null, true);
    if (seqDone || (block && block.done) || (run.kind === 'errors' && wasRetry) || (run.kind === 'drugs' && !wasRetry) || (run.kind === 'rand' && !wasRetry)) dropSession(sessKey());
    return showResults();
  }
  session.asked++;
  showCard(card);
}

function showCard(card) {
  abortListening();
  current = card; lastId = card.id;
  attempt = 1; found = new Set(); finished = false; hintLevel = 0; usedHint = false;
  updateScore();
  $('qtopic').textContent = block ? curBlockLabel() : current.drug ? current.s : current.topic;
  $('qkind').textContent = current.strict ? 'строго' : KIND[current.t];
  $('qkind').classList.toggle('strict', !!current.strict);
  $('qtext').textContent = current.q;
  $('answer').value = '';
  $('chips').innerHTML = '';
  $('feedback').hidden = true;
  $('hints').hidden = true; $('hints').innerHTML = '';
  $('hintBtn').disabled = false; $('hintLabel').textContent = 'Подсказка';
  $('answerBox').hidden = false; $('after').hidden = true;
  $('peekBtn').hidden = !hist().length; closePeek(); hideCheer(); renderSpeakTog();
  saveSession();
  say(current.q);
}
$('repeat').onclick = () => { abortListening(); speak(current.q); };
function renderSpeakTog() { $('speakTog').textContent = settings.speak ? '🔊 Вслух' : '🔇 Без звука'; }
$('speakTog').onclick = () => { settings.speak = !settings.speak; saveSettings(); if (!settings.speak) hush(); renderSpeakTog(); };

function updateScore() {
  let txt;
  if (run.kind === 'rand' && !retryList) txt = `${session.asked} / ${queue.length} · ✓ ${session.ok}`;
  else if (run.kind === 'drugs' && !retryList) txt = `${session.asked} / ${queue.length} · ✓ ${session.ok}`;
  else if (retryList || run.kind === 'errors') txt = `Ошибки · ${session.asked}`;
  else if (block) txt = `${session.asked} / ${block.cards.length} · ✓ ${session.ok}`;
  else if (isSeq()) txt = `${seqIndex + 1} / ${queue.length} · ✓ ${session.ok}`;
  else txt = `№ ${session.asked} · ✓ ${session.ok}`;
  $('score').textContent = txt;
}

function renderChips(missing, left = missing.length) {
  const c = $('chips'); c.innerHTML = '';
  const add = (text, cls) => { const s = document.createElement('span'); s.className = 'chip ' + (cls || ''); s.textContent = text; c.append(s); };
  for (const i of [...found].sort((a, b) => a - b)) add('✓ ' + current.items[i].t);
  if (finished) for (const i of missing) add(current.items[i].t, 'miss');
  else for (let i = 0; i < left; i++) add('?', 'hole');
}

function showFeedback(kind, title, html) {
  const f = $('feedback');
  f.className = 'feedback ' + kind; f.hidden = false;
  f.innerHTML = `<p class="fb-title"></p>${html || ''}`;
  f.querySelector('.fb-title').textContent = title;
}

// Подсветка в тексте ответа слов, которые проверяются (основы из строгого варианта каждого пункта)
function markKeys(c) {
  const stems = new Set();
  for (const it of c.items) for (const st of (it.e || it.k)[0].split(' ')) {
    const x = st.replace('=', '');
    if (x.length >= 3 && /[а-яё]/i.test(x)) stems.add(x);
  }
  return esc(c.a).replace(/[А-Яа-яЁё-]+/g, w => {
    const n = w.toLowerCase().replace(/ё/g, 'е');
    return [...stems].some(st => n.startsWith(st)) ? `<mark>${w}</mark>` : w;
  });
}
function refBlock() { return current.a ? `<div class="ref"><b>По лекции</b>${markKeys(current)}</div>` : ''; }

// ── Подсказки: переформулировка → начало ответа / первые буквы → по одному пункту ──
function firstWord(s) { return (s.match(/[A-Za-zА-Яа-яЁё0-9-]{2,}/) || [s])[0]; }
function stub(s, n) { const w = firstWord(s); return w.length <= n ? w : w.slice(0, n) + '…'; }
// Подсказки не раскрывают ответ: 1) первые буквы, 2) начало слов, 3) кусок другого слова из пункта, 4) наводящий вопрос
const HINT_SKIP = new Set(['и', 'в', 'во', 'на', 'при', 'с', 'со', 'по', 'для', 'не', 'от', 'до', 'из', 'к', 'или', 'а', 'то', 'что', 'как', 'же', 'это', 'том', 'числе']);
const hintWords = m => (m.match(/[A-Za-zА-Яа-яЁё0-9-]+/g) || []).filter(w => w.length > 2 && !HINT_SKIP.has(w.toLowerCase()));
const cut = (w, n) => (w.length <= n + 1 ? w.slice(0, Math.max(1, w.length - 2)) : w.slice(0, n)) + '…';
function hintList() {
  const st = Checker.status(current, found, modeFor(current));
  const miss = st.missing.map(i => current.items[i]);
  const out = [];
  // наводящий вопрос автора — только если в нём нет самих ключевых слов ответа
  const h = (current.h || '').toLowerCase().replace(/ё/g, 'е');
  const words = miss.map(it => hintWords(it.t));
  const n = miss.length;
  const lead = n > 1 ? `${n} ${plural(n, 'пункт', 'пункта', 'пунктов')}. ` : '';
  out.push(['Первые буквы', lead + words.map(ws => (ws[0] || '?')[0].toUpperCase() + '…').join(', ')]);
  out.push(['Начало', words.map(ws => ws[0] ? cut(ws[0], 4) : '?').join(', ')]);
  // третья ступень — половина другого слова из пункта (для фраз)
  const more = words.map(ws => {
    if (ws.length < 2) return null;
    const w = ws[1 + (audioKey(ws.join(' ')).length + ws.length) % (ws.length - 1)];
    return cut(w, Math.ceil(w.length / 2));
  }).filter(Boolean);
  if (more.length) out.push(['Ещё слово', more.join(', ')]);
  if (h && !miss.some(it => it.k.some(k => k.length > 3 && h.includes(k.split(' ')[0])))) out.push(['Наводка', current.h]);
  return out;
}
$('hintBtn').onclick = () => {
  if (finished) return;
  const list = hintList();
  hintLevel = Math.min(hintLevel + 1, list.length);
  usedHint = true;
  const box = $('hints'); box.hidden = false;
  box.innerHTML = list.slice(0, hintLevel).map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v)}</p>`).join('');
  const more = hintLevel < list.length;
  $('hintBtn').disabled = !more;
  $('hintLabel').textContent = more ? 'Ещё' : 'Всё';
  saveSession();
};

function submit() {
  if (!current || finished) return;
  const text = $('answer').value.trim();
  if (!text) return;
  if (Checker.saysDontKnow(text)) return reveal();

  Checker.check(current, Checker.correctTerms(text, window.VOCAB), modeFor(current)).found.forEach(i => found.add(i));
  Checker.check(current, text, modeFor(current)).found.forEach(i => found.add(i));
  const { missing, need, got, left, done } = Checker.status(current, found, modeFor(current));

  if (done) return finish(true, missing);

  if (attempt === 1) {
    attempt = 2;
    let title, speech;
    if (current.t === 'list') {
      title = got ? `Назвала ${got} из ${need}` : 'Пока не то';
      speech = got ? `Назвала ${got} из ${need}. Вспомни ещё ${left}.` : 'Подумай ещё.';
      showFeedback('warn', title, `<p>${got ? `Вспомни ещё ${left} ${plural(left, 'пункт', 'пункта', 'пунктов')}.` : 'Подумай ещё.'}</p>`);
    } else if (current.t === 'def') {
      title = got ? 'Не совсем точно' : 'Неверно';
      speech = 'Не совсем точно. Подумай ещё.';
      showFeedback('warn', title, `<p>Не хватает ${left} ${plural(left, 'элемента', 'элементов', 'элементов')} определения.</p>`);
    } else {
      title = got ? 'Почти' : 'Неверно';
      speech = got ? 'Почти. Подумай ещё.' : 'Неверно. Подумай ещё.';
      showFeedback('warn', title, '<p>Подумай ещё.</p>');
    }
    renderChips(missing, left);
    $('answer').value = '';
    keepAnswerVisible();
    say(speech);
    return;
  }
  finish(false, missing);
}
$('checkBtn').onclick = () => { stopListening(); setTimeout(submit, rec || finishing ? 600 : 0); };
$('answer').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });

function reveal() { if (!current || finished) return; finish(false, Checker.status(current, found, modeFor(current)).missing, true); }

const NOT_COUNTED = '<span class="tag-nc">Не засчитано — попадёт в ошибки</span>';

// ── Поддерживающие сообщения: по поводу, а не на каждом вопросе ──
let cheerState = { last: 0, streak: 0, misses: 0, recent: [], seqMark: 0 };
let cheerTimer = null;
function showCheer(text) {
  const box = $('cheer');
  const m = text.match(/^(\S+)\s+(.*)$/u);
  $('cheerEmoji').textContent = m ? m[1] : '✨';
  $('cheerText').textContent = m ? m[2] : text;
  box.classList.remove('out'); box.hidden = false;
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  clearTimeout(cheerTimer);
  cheerTimer = setTimeout(hideCheer, 4800);
}
function hideCheer() {
  const box = $('cheer'); if (box.hidden) return;
  box.classList.add('out'); clearTimeout(cheerTimer);
  setTimeout(() => { box.hidden = true; box.classList.remove('out'); }, 300);
}
$('cheer').onclick = hideCheer;
function pickCheer(kind, vars) {
  const pool = (window.CHEERS[kind] || []).filter(t => !cheerState.recent.includes(t));
  const list = pool.length ? pool : window.CHEERS[kind] || [];
  if (!list.length) return null;
  const t = list[Math.floor(Math.random() * list.length)];
  cheerState.recent = [t, ...cheerState.recent].slice(0, 12);
  return t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
function maybeCheer(ok, justLearned) {
  const cs = cheerState, n = session.asked;
  if (ok) { cs.streak++; cs.misses = 0; } else { cs.streak = 0; cs.misses++; }
  const gap = n - cs.last;
  const vars = { n: cs.streak, ok: session.ok, asked: n, learned: learnedIn(run.tid), total: TOPIC[run.tid].cards.length };
  let kind = null;
  if (ok && [3, 5, 8, 12, 16, 20, 30].includes(cs.streak) && gap >= 3) kind = 'streak';
  else if (!ok && cs.misses >= 2 && gap >= 2) kind = 'support';
  else if (gap >= 3) {
    if (block && !retryList && n === Math.ceil(block.cards.length / 2) && block.cards.length >= 4) kind = 'half';
    else if (isSeq()) {
      const pct = Math.floor((seqIndex + 1) / queue.length * 4) * 25;
      if (pct >= 25 && pct > cs.seqMark && pct < 100) { cs.seqMark = pct; vars.pct = pct; kind = 'seq'; }
    }
    if (!kind && ok && justLearned && Math.random() < 0.5) kind = 'learned';
    if (!kind && gap >= 5 && Math.random() < 0.55) kind = ok ? 'generic' : 'support';
  }
  if (!kind) return;
  const text = pickCheer(kind, vars);
  if (text) { cs.last = n; setTimeout(() => showCheer(text), 650); }
}

// ── Прошлые вопросы: только просмотр ──
let peekAt = 0;
function hist() { return session.hist || (session.hist = []); }
function openPeek() {
  const h = hist();
  if (!h.length) return;
  peekAt = h.length - 1; renderPeek();
  $('peek').hidden = false; hush();
}
function renderPeek() {
  const h = hist(), e = h[peekAt], c = CARD[e.id];
  $('peekPos').textContent = `Прошлый вопрос · ${peekAt + 1} из ${h.length}`;
  $('peekTopic').textContent = c.topic;
  $('peekRes').textContent = e.ok ? '✓ засчитано' : '✗ не засчитано';
  $('peekRes').className = 'tag ' + (e.ok ? 'ok' : 'bad');
  $('peekQ').textContent = c.q;
  const got = new Set(e.found);
  $('peekA').innerHTML = c.t === 'list' || !c.a
    ? `<ul>${c.items.map((x, i) => `<li class="${got.has(i) ? 'got' : 'lost'}">${esc(x.t)}</li>`).join('')}</ul>`
    : markKeys(c);
  $('peekOlder').disabled = peekAt === 0;
  $('peekNewer').disabled = peekAt === h.length - 1;
}
function closePeek() { $('peek').hidden = true; }
$('peekBtn').onclick = openPeek;
$('peekOlder').onclick = () => { if (peekAt > 0) { peekAt--; renderPeek(); } };
$('peekNewer').onclick = () => { if (peekAt < hist().length - 1) { peekAt++; renderPeek(); } };
$('peekBack').onclick = closePeek;
$('peekClose').onclick = closePeek;
$('peek').onclick = e => { if (e.target === $('peek')) closePeek(); };

function finish(ok, missing = [], gaveUp = false) {
  abortListening();
  finished = true;
  $('hints').hidden = true;
  const p = progress[current.id] || { box: 0, seen: 0, ok: 0 };
  p.seen++;
  const wasLearned = (p.box || 0) >= 2;
  if (ok) { p.ok++; session.ok++; if (attempt === 1 && !usedHint) p.box++; session.missed.delete(current.id); }
  else { p.box = 0; session.missed.set(current.id, current); }
  progress[current.id] = p; save('oz.progress', progress);
  if (isSeq()) { settings.seqPos[run.tid] = seqIndex + 1; saveSettings(); }
  updateScore();
  saveSession();

  hist().push({ id: current.id, ok, found: [...found] });
  maybeCheer(ok, ok && !wasLearned && p.box >= 2);
  renderChips(ok ? [] : missing);
  $('answerBox').hidden = true; $('after').hidden = false;
  $('accept').hidden = ok || gaveUp;
  const lastOfDrug = run.kind === 'drugs' && drugMode === 'random' && !retryList && !(drugList || []).length;
  $('next').textContent = lastOfDrug ? '🎲 Следующий препарат' : 'Дальше';

  if (ok) {
    const title = usedHint ? 'Верно, с подсказкой' : attempt === 1 ? 'Верно!' : 'Верно, со второй попытки';
    showFeedback('ok', title, current.a ? refBlock() : '');
    say('Верно!');
    return;
  }
  // Ответ не читаем вслух — его видно на экране
  if (current.t === 'list') {
    const names = missing.map(i => current.items[i].t);
    const st = Checker.status(current, found, modeFor(current));
    const head = !found.size ? 'Правильный ответ:' : `Не хватило ${missing.length} из ${st.need}:`;
    showFeedback('bad', head, `<ul>${names.map(n => `<li>${esc(n)}</li>`).join('')}</ul>${NOT_COUNTED}`);
  } else {
    showFeedback('bad', 'Правильный ответ', (refBlock() || `<p>${current.items.map(i => esc(i.t)).join('; ')}</p>`) + NOT_COUNTED);
  }
}

$('accept').onclick = () => {
  const p = progress[current.id];
  p.box = Math.max(p.box, 1); p.ok++; session.ok++;
  session.missed.delete(current.id);
  const last = hist()[hist().length - 1]; if (last && last.id === current.id) last.ok = true;
  save('oz.progress', progress);
  updateScore(); saveSession();
  $('accept').hidden = true;
  showFeedback('ok', 'Засчитано', current.a ? refBlock() : '');
};
$('next').onclick = nextCard;
$('dontKnow').onclick = () => { abortListening(); reveal(); };
function goHome() {
  abortListening(); hush();
  saveSession();
  renderHome(); show('home');
}
$('back').onclick = pauseToTopic;
$('resBack').onclick = () => { abortListening(); hush(); if (run.kind === 'drugs') openDrugs(run.scope || 'all'); else openTopic(run.tid); };

// ── Итоги ──
function answerHtml(c) { return c.a ? esc(c.a) : `<ul>${c.items.map(i => `<li>${esc(i.t)}</li>`).join('')}</ul>`; }
function showResults() {
  abortListening(); hush();
  // вопрос, на который ещё не ответили, не считаем заданным
  if (!finished && session.asked > 0) { session.asked--; finished = true; }
  const bl = topicBlocks(run.tid);
  const blockDone = block && block.done;
  const next = blockDone ? firstNotDone(run.tid, block.idx + 1) : -1;
  let title = 'Итоги', resumeTxt = 'Продолжить';
  if (blockDone) { title = seqDone ? 'Тема пройдена!' : `«${blockLabel(bl[block.idx])}» пройден`; resumeTxt = next >= 0 ? `Дальше: ${blockLabel(bl[next])}` : 'Пройти заново'; }
  else if (seqDone) { title = 'Лекция пройдена!'; resumeTxt = 'Пройти заново'; }
  else if (run.kind === 'errors') resumeTxt = 'К теме';
  else if (run.kind === 'rand') resumeTxt = (randList || []).length ? 'Продолжить' : '🎲 Ещё 10';
  else if (run.kind === 'drugs') resumeTxt = drugMode === 'random' ? '🎲 Следующий препарат' : 'К препаратам';
  $('resTitle').textContent = title;
  $('resume').textContent = resumeTxt;
  $('restudy').hidden = !blockDone;
  $('rAsked').textContent = session.asked;
  $('rOk').textContent = session.ok;
  $('rMiss').textContent = session.missed.size;
  const list = $('missList'); list.innerHTML = '';
  for (const c of session.missed.values()) {
    const li = document.createElement('li');
    li.innerHTML = `<details><summary></summary><div class="ans">${answerHtml(c)}</div></details>`;
    li.querySelector('summary').textContent = c.q;
    list.append(li);
  }
  const has = session.missed.size > 0;
  $('missBlock').hidden = !has; $('noMiss').hidden = has; $('retry').hidden = !has;
  $('retry').textContent = `Повторить ошибки (${session.missed.size})`;
  show('results');
}
$('toResults').onclick = showResults;
$('retry').onclick = () => { retryList = [...session.missed.values()]; show('quiz'); nextCard(); };
$('resume').onclick = () => {
  if (block && block.done) {
    let next = firstNotDone(run.tid, block.idx + 1);
    if (next < 0) { settings.blocksDone[run.tid] = []; saveSettings(); next = 0; }
    return startBlock(run.tid, next);
  }
  if (seqDone && run.kind === 'seq') { settings.seqPos[run.tid] = 0; saveSettings(); return startRun(run.tid, 'seq'); }
  if (run.kind === 'errors') return openTopic(run.tid);
  if (run.kind === 'rand' && !(randList || []).length) return startRun(run.tid, 'rand');
  if (run.kind === 'drugs') { if (drugMode === 'random' && !(drugList || []).length) return startDrugs(run.scope, 'random'); if (!(drugList || []).length) return openDrugs(run.scope); }
  retryList = null;
  show('quiz'); nextCard();
};
$('restudy').onclick = () => startBlock(run.tid, block.idx);

// ── Видимая часть экрана: при открытой клавиатуре (особенно на iPhone) опрос сжимается до неё ──
const VV = window.visualViewport;
function syncViewport() {
  if (!VV) return;
  const st = document.documentElement.style;
  st.setProperty('--vv-h', VV.height + 'px');
  st.setProperty('--vv-top', VV.offsetTop + 'px');
  keepAnswerVisible();
}
// пишешь с клавиатуры — поле ответа остаётся на виду под вопросом
function keepAnswerVisible() {
  if (screenNow === 'quiz' && document.activeElement === $('answer')) requestAnimationFrame(() => $('answer').scrollIntoView({ block: 'nearest' }));
}
if (VV) { VV.addEventListener('resize', syncViewport); VV.addEventListener('scroll', syncViewport); syncViewport(); }

// ── Обновление страницы: остаёмся на том же экране ──
// Запоминаем, где были; при перезагрузке (не при обычном открытии) возвращаемся туда.
function rememberScreen(screen) {
  let last = { screen };
  if (screen === 'topic') last.tid = curTid;
  else if (screen === 'drugsScr') last.scope = drugScope;
  else if (screen === 'quiz' || screen === 'study') last.key = sessKey();
  else if (screen === 'results' || screen === 'ready') last = run.kind === 'drugs' ? { screen: 'drugsScr', scope: run.scope || 'all' } : { screen: 'topic', tid: run.tid };
  else if (screen === 'settings' || screen === 'help') last = { screen, back: screenBefore, tid: curTid };
  save('oz.last', last);
}
function restoreScreen() {
  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (!nav || nav.type !== 'reload') return;
  const last = load('oz.last', null);
  if (!last) return;
  try {
    if ((last.screen === 'quiz' || last.screen === 'study') && loadSessions()[last.key]) {
      const tid = last.key.startsWith('drugs:') ? null : last.key.split(':')[0];
      if (tid && TOPIC[tid]) curTid = tid;
      return resumeSession(last.key, 'topic', true);
    }
    if (last.screen === 'topic' && TOPIC[last.tid]) return openTopic(last.tid);
    if (last.screen === 'drugsScr') return openDrugs(last.scope || 'all');
    if (last.screen === 'unfinished' && allSessions().length) { renderUnfinished(); return show('unfinished'); }
    if (last.screen === 'settings' || last.screen === 'help') {
      if (TOPIC[last.tid]) curTid = last.tid;
      screenNow = last.back || 'home';
      if (last.screen === 'settings') renderSettings();
      return show(last.screen);
    }
  } catch (e) { renderHome(); show('home'); }
}

applyTheme();
updateMic();
renderHome();
restoreScreen();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
