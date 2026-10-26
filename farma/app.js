// Устный зачёт: темы → карточки по разделам / Микс / По лекции / Ошибки → опрос голосом → разбор.
const $ = id => document.getElementById(id);
const KIND = { def: 'определение', list: 'перечисли', short: 'вопрос' };

// ── Хранилище (на телефоне; если недоступно — работаем без сохранения) ──
function load(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function drop(key) { try { localStorage.removeItem(key); } catch {} }

const settings = Object.assign({ mode: 'train', voice: '', rate: 1, speak: true, marina: true, theme: 'dark', seqPos: {}, blocksDone: {}, randSeen: {} },
  load('oz.settings', {}));
// тема по умолчанию — тёмная (2026-10-26); тем, у кого стояло «Авто», переключаем один раз
if (settings.themeVer !== 1) { settings.themeVer = 1; if (settings.theme === 'system') settings.theme = 'dark'; save('oz.settings', settings); }
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
const modeFor = () => settings.mode;   // определения: в «Тренировке» — по смыслу (часть пунктов opt), «Перед экзаменом» — строго
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
  for (const s of ['home', 'topic', 'unfinished', 'drugsScr', 'ready', 'settings', 'help', 'cardv', 'sheet', 'rep', 'repPick', 'sprav', 'drug', 'study', 'quiz', 'results']) $(s).hidden = s !== screen;
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
    case 'cardv': return $('cardvBack').click();
    case 'sheet': return $('shBack').click();
    case 'rep': return $('rpBack').click();
    case 'repPick': return $('rpkBack').click();
    case 'sprav': return $('spBack').click();
    case 'drug': return $('drBack').click();
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
// Главная: препараты и справочник — наверху, затем определения, темы — раскрывающимся списком (состояние запоминается)
let topicsOpen = load('oz.topicsOpen', false);
function topicRow(t) {
  const n = t.cards.length, l = learnedIn(t.id);
  const b = document.createElement('button');
  b.className = 'glass topic';
  b.innerHTML = `<span class="num"></span><span class="tbody"><span class="tname"></span><span class="bar"><i style="width:${Math.round(l / n * 100)}%"></i></span></span><span class="cnt">${l}/${n}</span>`;
  b.querySelector('.num').textContent = badge(t);
  b.querySelector('.tname').textContent = shortName(t);
  b.onclick = () => openTopic(t.id);
  return b;
}
function renderHome() {
  const box = $('topics'), def = $('hDef'); box.innerHTML = ''; def.innerHTML = '';
  const list = TOPICS.filter(t => !t.hidden);
  for (const t of list) (t.strict ? def : box).append(topicRow(t));
  $('topicsN').textContent = list.filter(t => !t.strict).length;
  box.hidden = !topicsOpen;
  $('topicsHead').setAttribute('aria-expanded', topicsOpen);
  $('hDrugs').parentNode.hidden = !TOPIC.drugs;
  if (TOPIC.drugs) $('hDrugsN').textContent = drugNames('all').length;
  renderResume();
  $('noSpeech').hidden = !!Recognition;
  $('inApp').hidden = !IN_APP || load('oz.inAppHidden', false);
}
// Встроенный браузер (Телеграм, ВК, Инстаграм): «Назад» телефона закрывает его целиком
const IN_APP = /; wv\)|Telegram|Instagram|FBAN|FBAV|VKAndroidApp|vkclient/i.test(navigator.userAgent);
$('topicsHead').onclick = () => { topicsOpen = !topicsOpen; save('oz.topicsOpen', topicsOpen); renderHome(); };
$('hDrugs').onclick = () => openDrugs('all');
$('hSprav').onclick = () => openSprav();
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
  $('tRep').hidden = curTid !== READ_TID;
  if (curTid === READ_TID) $('tCards').innerHTML = `▶ Все определения подряд<small>${loadSessions()[`${READ_TID}:read`] ? 'продолжить чтение' : `${n} карточек · без опроса`}</small>`;
  else $('tCards').innerHTML = cur >= 0
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
    row.onclick = () => { const i = s.idx.find(x => !d.has(x)); openBlock(curTid, i ?? s.idx[0]); };
    list.append(row);
  });
  const box = $('tResumes'); box.innerHTML = '';
  for (const s of allSessions().filter(x => x.tid === curTid || (x.kind === 'drugs' && x.scope === curTid))) box.append(resumeRow(s, 'topic', false));
  $('tDrugs').hidden = !drugNames(curTid).length;
  const shs = sheetsOf(curTid); $('tSheets').hidden = !shs.length; $('tSheets').textContent = `🖼 Шпаргалки · ${shs.length}`;
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
  if (curTid === READ_TID) return startRead(curTid);
  let i = firstNotDone(curTid);
  if (i < 0) { settings.blocksDone[curTid] = []; saveSettings(); i = 0; }
  openBlock(curTid, i);
};
$('tRep').onclick = () => openRepPick(curTid);
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
// Какое окошко заполняет микрофон: опрос (answer) или тренажёр определений (rpAnswer)
const MIC_QUIZ = { input: 'answer', btn: 'mic', label: 'micLabel' }, MIC_REP = { input: 'rpAnswer', btn: 'rpMic', label: 'rpLabel' };
let micUI = MIC_QUIZ;
// На компьютере распознавание есть не везде — подсказываем печатать, голосом удобнее с телефона
const IS_DESKTOP = !('ontouchstart' in window) && matchMedia('(hover: hover) and (pointer: fine)').matches;
const MIC_IDLE = !Recognition ? '⌨ Голос недоступен — печатай ответ' : IS_DESKTOP ? '⌨ На компьютере удобнее печатать · голосом — с телефона' : 'Удерживай и говори';
let finishing = null;   // запись, которая уже остановлена, но ещё отдаёт последние слова

function startListening() {
  if (!Recognition || rec) return;
  hush();
  const ui = micUI;
  baseText = $(ui.input).value.trim();
  const r = new Recognition();
  rec = r;
  // Android и iPhone в непрерывном режиме дублируют фразы — там пишем по фразе и перезапускаем, пока кнопку держат
  r.lang = 'ru-RU'; r.continuous = !(IS_ANDROID || IS_IOS); r.interimResults = true;
  // Пишем только в своём «нажатии»: поздние результаты старой записи игнорируются
  r.onresult = e => {
    if (r !== rec && r !== finishing) return;
    const heard = mergeResults(e.results);
    $(ui.input).value = (baseText ? baseText + ' ' : '') + heard;
    const box = $(ui.input); box.scrollTop = box.scrollHeight;   // видно то, что говоришь сейчас
  };
  r.onerror = e => {
    if (ui !== MIC_QUIZ) { $(ui.label).textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Нет доступа к микрофону — печатай ответ' : 'Распознавание недоступно — печатай ответ'; return; }
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
      showFeedback('bad', 'Нет доступа к микрофону', '<p>Разреши микрофон для этой страницы в настройках браузера или отвечай текстом.</p>');
    else if (e.error === 'network')
      showFeedback('bad', 'Распознавание недоступно', '<p>Нет связи с сервисом распознавания речи. Пока можно отвечать текстом.</p>');
    else if (e.error === 'audio-capture')
      showFeedback('bad', 'Микрофон не найден', '<p>Проверь, что микрофон подключён и разрешён.</p>');
  };
  r.onend = () => {
    // Телефон может оборвать запись на паузе — если кнопку ещё держат, продолжаем
    if (r === rec && holding) { baseText = $(ui.input).value.trim(); try { r.start(); return; } catch {} }
    if (r === rec) rec = null;
    if (r === finishing) finishing = null;
    // Исправляем ослышки терминов по словарю лекций
    $(ui.input).value = dropRepeats(Checker.correctTerms($(ui.input).value, window.VOCAB));
    $(ui.input).scrollTop = $(ui.input).scrollHeight;
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
// Подстраховка от дублей распознавания: «психотропные средства психотропные средства» → один раз (повтор 2+ слов подряд)
function dropRepeats(text) {
  let w = text.split(/\s+/).filter(Boolean), changed = true;
  const key = x => x.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
  while (changed) {
    changed = false;
    for (let n = Math.floor(w.length / 2); n >= 2 && !changed; n--)
      for (let i = 0; i + 2 * n <= w.length; i++)
        if (w.slice(i, i + n).every((x, k) => key(x) === key(w[i + n + k]))) { w.splice(i + n, n); changed = true; break; }
  }
  return w.join(' ');
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
  for (const ui of [MIC_QUIZ, MIC_REP]) $(ui.btn).classList.toggle('on', on && ui === micUI);
  $(MIC_QUIZ.label).textContent = on && micUI === MIC_QUIZ ? 'Говори… отпусти, чтобы остановить' : MIC_IDLE;
  if (micUI === MIC_REP && screenNow === 'rep') $(MIC_REP.label).textContent = on ? 'Говори… отпусти, чтобы остановить' : $('rpAnswer').value.trim() ? 'Нажми ✓ Проверить — или допиши' : MIC_IDLE;
}
// На телефоне — сенсорные события: долгое касание не превращается в «меню» и не обрывает запись
function micDown(e, ui) {
  micUI = ui;
  if (!Recognition) { $(ui.input).focus(); return; }
  if (e.cancelable) e.preventDefault();
  if (holding) return;
  holding = true; startListening();
}
function micUp() { if (holding) stopListening(); }
function bindMic(ui) {
  const el = $(ui.btn);
  if ('ontouchstart' in window) {
    el.addEventListener('touchstart', e => micDown(e, ui), { passive: false });
    el.addEventListener('touchend', micUp);
    el.addEventListener('touchcancel', micUp);
  } else {
    el.addEventListener('pointerdown', e => { try { el.setPointerCapture(e.pointerId); } catch {} micDown(e, ui); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, micUp);
  }
  el.addEventListener('contextmenu', e => e.preventDefault());
}
bindMic(MIC_QUIZ);
updateMic();   // подпись под микрофоном (на компьютере — «удобнее печатать»)
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
  return scope === 'all' ? out.sort((a, b) => a.tid.localeCompare(b.tid)) : out;   // лекции по номеру (02 добавлена позже)
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
// ── Справочник препаратов (данные — spravochnik.js, грузится при первом открытии) ──
let spMode = load('oz.spmode', 'abc'), spOrder = [], spCur = 0, spScroll = 0;
// Раскрытые буквы / темы: нажатие открывает или закрывает. В алфавите сначала всё открыто, в темах — закрыто.
const spOpen = { abc: null, topic: new Set() };
function spToggle(key) {
  const set = spOpen[spMode];
  if (set.has(key)) set.delete(key); else set.add(key);
  renderSprav();
}
function loadSprav(then) {
  if (window.SPRAV) return then();
  const sc = document.createElement('script');
  sc.src = 'spravochnik.js?v=' + (document.getElementById('verLine').textContent.replace(/\D/g, '') || '0');
  sc.onload = then; sc.onerror = () => toast('Не удалось загрузить справочник');
  document.head.append(sc);
}
const spNorm = s => s.toLowerCase().replace(/ё/g, 'е');
function openSprav(after) {
  loadSprav(() => {
    $('spCount').textContent = `${window.SPRAV.drugs.length} препаратов`;
    renderSprav();
    show('sprav');
    window.scrollTo(0, spScroll);
    if (after) after();
  });
}
function spItem(i) {
  const b = document.createElement('button');
  b.className = 'sp-item';
  b.textContent = window.SPRAV.drugs[i].n;
  b.onclick = () => { spScroll = window.scrollY; openDrug(i); };
  return b;
}
const spGrid = () => { const g = document.createElement('div'); g.className = 'sp-grid'; return g; };
const spLetter = n => /[a-zа-яё]/i.test(n[0]) ? n[0].toUpperCase() : '0–9';
function spHead(key, num, name, count, open) {
  const h = document.createElement('button');
  h.className = 'sp-topic' + (spMode === 'abc' ? ' sp-abc' : ''); h.setAttribute('aria-expanded', open);
  h.innerHTML = '<b></b><span></span><small></small>';
  h.children[0].textContent = num; h.children[1].textContent = name; h.children[2].textContent = count;
  h.onclick = () => spToggle(key);
  return h;
}
function renderSprav() {
  const S = window.SPRAV, box = $('spList'); box.innerHTML = '';
  document.querySelectorAll('[data-spmode]').forEach(b => b.setAttribute('aria-checked', b.dataset.spmode === spMode));
  // поиск по началу слова: «ин» → «индапамид», «кромогликат натрия (Интал)», но не «клиндамицин»
  const q = spNorm($('spSearch').value.trim());
  const ok = i => !q || spNorm(S.drugs[i].n).split(/[^a-zа-я0-9%]+/).some(w => w.startsWith(q));
  const groups = [], byKey = {};   // [{key, num, name, items}]
  const add = (key, num, name, i) => { if (!byKey[key]) groups.push(byKey[key] = { key, num, name, items: [] }); byKey[key].items.push(i); };
  const all = S.drugs.map((_, i) => i);
  if (spMode === 'abc') {
    spOrder = all.filter(ok).sort((a, b) => S.drugs[a].n.localeCompare(S.drugs[b].n, 'ru', { sensitivity: 'base' }));
    for (const i of spOrder) { const L = spLetter(S.drugs[i].n); add(L, L, '', i); }
    if (!spOpen.abc) spOpen.abc = new Set(groups.map(g => g.key));
  } else {
    spOrder = all.filter(ok).sort((a, b) => S.groups[S.drugs[a].g].tid.localeCompare(S.groups[S.drugs[b].g].tid));   // темы по номеру (02 добавлена позже)
    for (const i of spOrder) { const tid = S.groups[S.drugs[i].g].tid; add(tid, tid.slice(1), S.topics[tid], i); }
  }
  const set = spOpen[spMode];
  for (const g of groups) {
    const open = !!q || set.has(g.key);   // при поиске раскрыто всё найденное
    box.append(spHead(g.key, g.num, g.name, g.items.length, open));
    if (open) { const grid = spGrid(); g.items.forEach(i => grid.append(spItem(i))); box.append(grid); }
  }
  if (!spOrder.length) { const p = document.createElement('p'); p.className = 'sp-none'; p.textContent = 'Ничего не нашлось'; box.append(p); }
}
$('spAllOpen').onclick = () => { spOpen[spMode] = new Set(spMode === 'abc' ? window.SPRAV.drugs.map(d => spLetter(d.n)) : Object.keys(window.SPRAV.topics)); renderSprav(); };
$('spAllClose').onclick = () => { spOpen[spMode] = new Set(); renderSprav(); };
document.querySelectorAll('[data-spmode]').forEach(b => b.onclick = () => { spMode = b.dataset.spmode; save('oz.spmode', spMode); spScroll = 0; renderSprav(); });
$('spSearch').oninput = () => renderSprav();
$('spBack').onclick = () => { spScroll = 0; renderHome(); show('home'); };
const spUl = arr => arr.length ? `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
function openDrug(i) {
  const S = window.SPRAV, d = S.drugs[i], g = S.groups[d.g];
  spCur = i;
  if (!spOrder.includes(i)) spOrder = S.drugs.map((_, k) => k);
  const pos = spOrder.indexOf(i);
  $('drName').textContent = d.n[0].toUpperCase() + d.n.slice(1);
  $('drPos').textContent = `${pos + 1} / ${spOrder.length}`;
  $('drPath').innerHTML = `<span>Тема ${g.tid.slice(1)} · ${esc(S.topics[g.tid])}</span>`;
  const empty = [];   // пустые разделы — одной строкой внизу, чтобы не растягивать страницу
  const sec = (title, html) => html ? `<section class="sp-sec"><h3>${title}</h3>${html}</section>` : (empty.push(title.toLowerCase()), '');
  const same = S.drugs.map((x, k) => [x, k]).filter(([x, k]) => x.g === d.g && k !== i);
  const lvl = (x, k, cls) => { const [n, note] = x.split(' — '); return `<li class="${cls}" style="--lv:${k}">${esc(n)}${note ? `<small>${esc(note)}</small>` : ''}</li>`; };
  const tree = '<ol class="sp-tree">' + g.path.map((x, k) => lvl(x, k, k === g.path.length - 1 ? 'grp' : '')).join('') + '</ol>';
  $('drBody').innerHTML =
    sec('Классификация', tree + (g.about ? `<p class="sp-about">${esc(g.about)}</p>` : '')) +
    sec('Показания', spUl(g.ind)) +
    sec('Фармакологические эффекты', spUl(g.eff)) +
    sec('Побочные эффекты', spUl(g.side)) +
    sec('Противопоказания', spUl(g.contra)) +
    sec('Особенности', (d.f.length ? `<div class="sp-q">${esc(d.n[0].toUpperCase() + d.n.slice(1))}</div>${spUl(d.f)}` + (g.feat.length ? '<div class="sp-q">Вся группа</div>' : '') : '') + spUl(g.feat)) +
    (empty.length ? `<p class="sp-none sp-empty">В лекции не указано: ${empty.join(', ')}</p>` : '') +
    sec('Препараты той же группы', same.length ? `<div class="sp-links">${same.map(([x, k]) => `<button data-k="${k}">${esc(x.n)}</button>`).join('')}</div>` : '');
  $('drBody').querySelectorAll('[data-k]').forEach(b => b.onclick = () => openDrug(+b.dataset.k));
  $('drPrev').disabled = pos <= 0;
  $('drNext').disabled = pos >= spOrder.length - 1;
  show('drug');
}
$('drPrev').onclick = () => { const p = spOrder.indexOf(spCur); if (p > 0) openDrug(spOrder[p - 1]); };
$('drNext').onclick = () => { const p = spOrder.indexOf(spCur); if (p < spOrder.length - 1) openDrug(spOrder[p + 1]); };
$('drBack').onclick = () => { show('sprav'); window.scrollTo(0, spScroll); };

// ── Шпаргалки ──
const sheetsOf = tid => (window.SHEETS && window.SHEETS[tid]) || [];
const sheetFor = (tid, sec) => sheetsOf(tid).find(sh => sh.secs.includes(sec));
let sheetList = [], sheetIdx = 0, sheetDone = null, sheetBack = null;
function openSheets(list, idx, done, back) {
  sheetList = list; sheetIdx = idx; sheetDone = done; sheetBack = back;
  abortListening(); hush();
  showSheet();
}
// Шпаргалки листаются свайпом: все картинки списка в ленте со «щелчком» по слайду, соседние грузятся заранее
const sheetVer = () => document.getElementById('verLine').textContent.replace(/\D/g, '') || '0';
function showSheet() {
  const tr = $('shTrack');
  tr.innerHTML = '';
  sheetList.forEach((sh, k) => {
    const d = document.createElement('div'); d.className = 'sheet-slide';
    const im = document.createElement('img'); im.alt = sh.title; im.decoding = 'async';
    if (Math.abs(k - sheetIdx) > 1) im.loading = 'lazy';
    im.src = sh.f + '?v=' + sheetVer();   // версия — чтобы не показывалась старая картинка из кэша
    im.onclick = () => { d.classList.toggle('zoom'); sheetFit(); };
    im.onload = () => { if (k === sheetIdx) sheetFit(); };
    d.append(im); tr.append(d);
  });
  // PDF всех шпаргалок темы (tools/make_sheet_pdfs.py)
  const tid = (sheetList[0].f.match(/sheets\/(t\d+)\//) || [])[1];
  const pdf = tid && (window.SHEET_PDF || {})[tid];
  $('shPdf').hidden = !pdf;
  if (pdf) { $('shPdf').href = pdf + '?v=' + sheetVer(); $('shPdf').setAttribute('download', `Шпаргалки ${tid.slice(1)} — ${shortName(TOPIC[tid])}.pdf`); }
  show('sheet');
  tr.scrollLeft = sheetIdx * tr.clientWidth;
  sheetSync();
}
function sheetSync() {
  const tr = $('shTrack'), k = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
  const i = Math.max(0, Math.min(sheetList.length - 1, k));
  if (i !== sheetIdx) tr.children[sheetIdx] && tr.children[sheetIdx].classList.remove('zoom');
  sheetIdx = i;
  $('shPos').textContent = sheetList.length > 1 ? `${i + 1} / ${sheetList.length}` : '';
  const last = i === sheetList.length - 1;
  $('shNext').hidden = !(last && sheetDone);
  $('shL').hidden = i === 0; $('shR').hidden = last;   // листаются свайпом; кнопка — только на последней, если дальше карточки
  for (const j of [i - 1, i + 1]) { const im = tr.children[j] && tr.children[j].firstChild; if (im) im.loading = 'eager'; }
  sheetFit();
}
// высота ленты — по текущей картинке (иначе под короткими остаётся пустота до самой высокой)
function sheetFit() { const sl = $('shTrack').children[sheetIdx]; if (sl) $('shTrack').style.height = sl.offsetHeight + 'px'; }
window.addEventListener('resize', () => { if (screenNow === 'sheet') sheetFit(); });
let sheetTick = 0;
$('shTrack').addEventListener('scroll', () => { cancelAnimationFrame(sheetTick); sheetTick = requestAnimationFrame(sheetSync); }, { passive: true });
const sheetGo = i => { const tr = $('shTrack'); tr.scrollTo({ left: i * tr.clientWidth, behavior: 'smooth' }); };
// на компьютере свайпа нет — стрелки по бокам (видны только при мыши) и клавиши ← →
$('shL').onclick = () => { if (sheetIdx > 0) sheetGo(sheetIdx - 1); };
$('shR').onclick = () => { if (sheetIdx < sheetList.length - 1) sheetGo(sheetIdx + 1); };
// стрелка при нажатии клавиши на миг подсвечивается (без рамки фокуса)
const shHit = b => { if (b.hidden) return; b.click(); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 220); };
document.addEventListener('keydown', e => { if (screenNow !== 'sheet') return; if (e.key === 'ArrowLeft') shHit($('shL')); if (e.key === 'ArrowRight') shHit($('shR')); });
for (const b of ['shL', 'shR']) $(b).addEventListener('mousedown', e => e.preventDefault());   // не забирать фокус
$('shNext').onclick = () => {
  if (sheetIdx < sheetList.length - 1) return sheetGo(sheetIdx + 1);
  if (sheetDone) return sheetDone();
  sheetBack();
};
$('shBack').onclick = () => sheetBack();
$('tSheets').onclick = () => openSheets(sheetsOf(curTid), 0, null, () => openTopic(curTid));
// Карточки раздела: если с этого раздела начинается шпаргалка — сначала она
function openBlock(tid, idx) {
  const b = topicBlocks(tid)[idx];
  const list = sheetsOf(tid).filter(sh => b.names.includes(sh.secs[0]));
  if (!list.length) return startBlock(tid, idx);
  openSheets(list, 0, () => startBlock(tid, idx), () => openTopic(tid));
}
$('studySheet').onclick = () => {
  const sh = block && sheetFor(run.tid, block.cards[block.studyIdx].s);
  if (!sh) return;
  saveSession();
  openSheets([sh], 0, null, () => showStudy());
};
function startBlock(tid, idx) {
  dropSession(`${tid}:block`);
  resetRun(tid, 'block');
  const b = topicBlocks(tid)[idx];
  block = { idx, cards: b.cards, phase: 'study', studyIdx: 0, quizLeft: [] };
  showStudy();
}
// «Подряд» (тема «Определения»): все карточки по порядку — только читать, без разделов и опроса
const READ_TID = 'def';
function startRead(tid) {
  if (loadSessions()[`${tid}:read`]) return resumeSession(`${tid}:read`, 'topic');
  resetRun(tid, 'read');
  block = { idx: -1, read: true, cards: TOPIC[tid].cards, phase: 'study', studyIdx: 0, quizLeft: [] };
  showStudy();
}
const curBlockLabel = () => block.read ? 'Все определения подряд' : blockLabel(topicBlocks(run.tid)[block.idx]);
function showStudy() {
  abortListening(); hush();
  block.phase = 'study';
  const i = block.studyIdx, c = block.cards[i];
  $('studyScore').textContent = `${i + 1} / ${block.cards.length}`;
  $('studySheet').hidden = !sheetFor(run.tid, c.s);
  $('sTopic').textContent = curBlockLabel();
  const st = c.strict && settings.mode === 'exam';
  $('sKind').textContent = st ? 'строго' : KIND[c.t];
  $('sKind').classList.toggle('strict', st);
  $('sQ').textContent = c.q;
  $('sA').innerHTML = c.t === 'list' || !c.a ? `<ul>${c.items.map(x => `<li>${esc(x.t)}</li>`).join('')}</ul>` : markKeys(c);
  $('sDots').innerHTML = block.cards.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('sPrev').disabled = i === 0;
  const last = i === block.cards.length - 1;
  $('sNext').textContent = last ? (block.read ? 'Готово ✓' : 'К опросу ▶') : 'Дальше →';
  $('sSkip').hidden = last || block.read;
  show('study');
  saveSession();
}
function studyMove(d) {
  const n = block.studyIdx + d;
  if (n < 0) return;
  if (n >= block.cards.length && block.read) { hush(); dropSession(sessKey()); toast('Все определения прочитаны'); return openTopic(run.tid); }
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
const KIND_LABEL = { read: 'Подряд', mix: 'Микс', seq: 'По лекции', block: 'Карточки', errors: 'Ошибки', drugs: 'Препараты', rand: '10 наугад' };
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
  if (s.kind === 'read' && s.block) detail = `${s.block.studyIdx + 1} из ${t.cards.length}`;
  else if (s.block) { const b = topicBlocks(s.tid)[s.block.idx]; if (b) detail = blockLabel(b) + (s.block.phase === 'study' ? '' : ' · опрос'); }
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
  const bl = s.block && (s.kind === 'read' ? { cards: TOPIC[s.tid].cards } : topicBlocks(s.tid)[s.block.idx]);
  if (bl) block = { read: s.kind === 'read', idx: s.block.idx, cards: bl.cards, phase: s.block.phase, studyIdx: Math.min(s.block.studyIdx || 0, bl.cards.length - 1), quizLeft: ids(s.block.quizLeft) };
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
const MAX_TRIES = 3;   // ответ + две попытки «подумай ещё»
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
  const st = current.strict && settings.mode === 'exam';
  $('qkind').textContent = st ? 'строго' : KIND[current.t];
  $('qkind').classList.toggle('strict', st);
  $('qtext').textContent = current.q;
  $('answer').value = '';
  $('chips').innerHTML = '';
  $('feedback').hidden = true;
  $('hints').hidden = true; $('hints').innerHTML = '';
  const hasHint = !!((current.hs && current.hs.length) || current.h);
  $('hintBtn').disabled = !hasHint; $('hintLabel').textContent = hasHint ? 'Подсказка' : 'Нет подсказки';
  $('answerBox').hidden = false; $('after').hidden = true;
  $('peekBtn').hidden = !hist().length; closePeek(); hideCheer(); renderSpeakTog();
  saveSession();
  say(current.q);
}
$('repeat').onclick = () => { abortListening(); speak(current.q); };
// ⚑ Замечание — выключено (2026-10-26, по просьбе Оли: вопросы она проверяет сама). Кнопки flagQ/flagS/flagC скрыты в index.html; вернуть — убрать hidden.
// Бот @medzachetbot сразу знает, о какой карточке речь
const BOT = 'medzachetbot';
const FLAG_URL = 'https://zachet-pravki.osanka-telo.workers.dev/flag';
const tgLink = c => `https://t.me/${BOT}?start=c_${c.id}`;
let flagging = null;
// управляющая — сразу в бот (с комментариями и правками); остальные — короткая отметка без Телеграма
function flagCard(c) {
  if (!c) return;
  abortListening(); hush();
  if (screenNow === 'quiz' || screenNow === 'study') saveSession();
  if (settings.admin) return window.open(tgLink(c), '_blank');
  flagging = c;
  $('flagQText').textContent = c.q;
  $('flagText').value = ''; $('flagErr').hidden = true;
  $('flagSend').disabled = false; $('flagSend').textContent = 'Отправить';
  $('flagTg').href = tgLink(c);
  $('flagBox').hidden = false;
}
$('flagClose').onclick = () => { $('flagBox').hidden = true; };
$('flagSend').onclick = async () => {
  const c = flagging; if (!c) return;
  $('flagSend').disabled = true; $('flagSend').textContent = 'Отправляю…';
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(FLAG_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ card: c.id, q: c.q, text: $('flagText').value.trim() }) });
    if (!r.ok) throw new Error(r.status);
    $('flagBox').hidden = true; toast('Спасибо! Отметка отправлена');
  } catch (e) {
    $('flagSend').disabled = false; $('flagSend').textContent = 'Попробовать ещё раз'; $('flagErr').hidden = false;
  }
};
$('flagQ').onclick = () => flagCard(current);
$('flagS').onclick = () => flagCard(block && block.cards[block.studyIdx]);
$('flagC').onclick = () => flagCard(CARD[cardvId]);

// Режим управляющей: 5 касаний по строке версии в настройках → ключ
let verTaps = 0, verTimer = null;
$('verLine').onclick = () => {
  verTaps++; clearTimeout(verTimer); verTimer = setTimeout(() => { verTaps = 0; }, 1500);
  if (verTaps < 5) return;
  verTaps = 0;
  if (settings.admin) { if (confirm('Выключить режим управляющей на этом телефоне?')) { settings.admin = false; saveSettings(); toast('Режим управляющей выключен'); } return; }
  const k = (prompt('Ключ управляющей') || '').trim().toLowerCase();
  if (k && audioKey(k) === '682sr7') { settings.admin = true; saveSettings(); toast('Режим управляющей включён: ⚑ ведёт в бот'); }
  else if (k) toast('Неверный ключ');
};

// Одна карточка по ссылке из уведомления: …/farma/#card=t06-07
let cardvId = null;
function openCardView(id) {
  const c = CARD[id]; if (!c) return false;
  cardvId = id;
  $('cvTopic').textContent = (c.drug ? shortName(TOPIC[c.tid]) : c.topic) + (c.s ? ' · ' + c.s : '');
  $('cvId').textContent = id;
  $('cvQ').textContent = c.q;
  $('cvA').innerHTML = c.t === 'list' || !c.a ? `<ul>${c.items.map(x => `<li>${esc(x.t)}</li>`).join('')}</ul>` : markKeys(c);
  show('cardv');
  return true;
}
$('cardvBack').onclick = () => { history.replaceState(null, '', location.pathname); renderHome(); show('home'); };
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
// Подсказки — только те, что написала Оля (hs, по шагам). В непроверенных темах — старый наводящий вопрос h,
// если в нём нет слов самого ответа. Подсказок по буквам нет (решение Оли 22.10).
function hintList() {
  if (current.hs && current.hs.length) return current.hs.map((v, i) => [current.hs.length > 1 ? `Подсказка ${i + 1}` : 'Подсказка', v]);
  const h = (current.h || '').toLowerCase().replace(/ё/g, 'е');
  if (!h) return [];
  const st = Checker.status(current, found, modeFor(current));
  const miss = st.missing.map(i => current.items[i]);
  return miss.some(it => it.k.some(k => k.length > 3 && h.includes(k.split(' ')[0]))) ? [] : [['Подсказка', current.h]];
}
$('hintBtn').onclick = () => {
  if (finished) return;
  const list = hintList();
  if (!list.length) { $('hintBtn').disabled = true; $('hintLabel').textContent = 'Нет подсказки'; return; }
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

  if (attempt < MAX_TRIES) {   // две попытки «подумай ещё», потом итог
    attempt++;
    const lastTry = attempt === MAX_TRIES, again = lastTry ? 'Подумай ещё раз — последняя попытка.' : 'Подумай ещё.';
    let title, speech;
    if (current.t === 'list') {
      title = got ? `Названо ${got} из ${need}` : 'Пока не то';
      speech = got ? `Названо ${got} из ${need}. Вспомни ещё ${left}.` : again;
      showFeedback('warn', title, `<p>${got ? `Вспомни ещё ${left} ${plural(left, 'пункт', 'пункта', 'пунктов')}.` : again}${got && lastTry ? ' Последняя попытка.' : ''}</p>`);
    } else if (current.t === 'def') {
      title = got ? 'Не совсем точно' : 'Неверно';
      speech = 'Не совсем точно. ' + again;
      showFeedback('warn', title, `<p>Не хватает ${left} ${plural(left, 'элемента', 'элементов', 'элементов')} определения. ${again}</p>`);
    } else {
      title = got ? 'Почти' : 'Неверно';
      speech = (got ? 'Почти. ' : 'Неверно. ') + again;
      showFeedback('warn', title, `<p>${again}</p>`);
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
    const title = usedHint ? 'Верно, с подсказкой' : attempt === 1 ? 'Верно!' : attempt === 2 ? 'Верно, со второй попытки' : 'Верно, с третьей попытки';
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
    return openBlock(run.tid, next);
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
  else if (screen === 'sheet') last = { screen: 'topic', tid: curTid };
  else if (screen === 'sprav') last = { screen: 'sprav' };
  else if (screen === 'drug') last = { screen: 'drug', n: spCur };
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
    if (last.screen === 'sprav') return openSprav();
    if (last.screen === 'drug') return openSprav(() => openDrug(last.n));
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
if (!(location.hash.startsWith('#card=') && openCardView(decodeURIComponent(location.hash.slice(6))))) restoreScreen();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});

// ── Тренажёр определений: Марина говорит часть (rp) — текст исчезает — вспоминаешь и повторяешь (микрофон как в опросе или текстом) ──
const REP_SAY = ['Принято!', 'Отлично, принято!', 'Есть! Принято.', 'Супер, принято!'];
const REP_POP = ['🖐 Пятёрка в лоб!', '🎉 Определение в кармане!', '🧠 Синапсы записали!', '📜 Чётко, как по лекции!', '⭐ Это определение уже не страшно!',
  '🚀 Как по нотам!', '🔐 Зафиксировано в долговременной памяти!', '🥇 Ещё одно — в копилку зачёта!'];
let rp = null;   // { tid, cards, i, part, fails }
const repNorm = t => (t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim().split(' ').filter(Boolean);
function repLev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// засчитано, если узнаны почти все значимые слова части (короткие — все); окончания и ослышки прощаются
function repMatch(target, heard) {
  const tw = repNorm(target).filter(w => w.length >= 3);
  const hw = repNorm(Checker.correctTerms(heard, window.VOCAB));
  if (!tw.length) return hw.length > 0;
  const hit = tw.filter(w => {
    const st = w.slice(0, Math.min(6, Math.max(3, w.length - 2)));
    return hw.some(h => h.startsWith(st) || (w.length >= 6 && repLev(h.slice(0, st.length), st) <= 1));
  }).length;
  return tw.length <= 3 ? hit === tw.length : hit / tw.length >= 0.8;
}
const repTerm = c => c.q.replace(/^\d+\.\s*/, '').replace(/ — дай определение\.$/, '');
// Место — отдельно для «все» и для каждого раздела: settings.repAt[ключ] = номер определения
if (typeof settings.repPos === 'number') { settings.repAt = { all: settings.repPos }; delete settings.repPos; saveSettings(); }
const repAt = () => (settings.repAt = settings.repAt || {});
const repCards = (tid, scope) => TOPIC[tid].cards.filter(c => c.rp && c.rp.length && (scope === 'all' || c.s === scope)).map(c => CARD[c.id]);
function openRepPick(tid) {
  const box = $('rpkList'); box.innerHTML = '';
  const secs = [...new Set(TOPIC[tid].cards.filter(c => c.rp).map(c => c.s))];
  for (const scope of ['all', ...secs]) {
    const n = repCards(tid, scope).length, at = repAt()[scope] || 0;
    const row = document.createElement('button');
    row.className = 'sec' + (at ? ' now' : '');
    row.innerHTML = `<span class="num">${scope === 'all' ? '★' : secs.indexOf(scope) + 1}</span><span class="sname"></span><small></small>`;
    row.querySelector('.sname').textContent = scope === 'all' ? 'Все определения подряд' : scope;
    row.querySelector('small').textContent = at ? `с ${at + 1} из ${n}` : n;
    row.onclick = () => startRep(tid, scope);
    box.append(row);
  }
  show('repPick');
}
$('rpkBack').onclick = () => openTopic(READ_TID);
function startRep(tid, scope = 'all') {
  const cards = repCards(tid, scope);
  if (!cards.length) return;
  rp = { tid, scope, cards, i: Math.min(repAt()[scope] || 0, cards.length - 1), part: 0, fails: 0, shown: false, count: 0 };
  abortListening(); hush();
  micUI = MIC_REP;
  show('rep');
  repCard();
}
// shown — текущая часть видна (пока Марина говорит или после двух ошибок); иначе «…» — вспомни сам
function repRender() {
  const c = rp.cards[rp.i], done = rp.part >= c.rp.length;
  $('rpPos').textContent = (rp.scope === 'all' ? '' : rp.scope + ' · ') + `${rp.i + 1} / ${rp.cards.length}`;
  $('rpTerm').textContent = repTerm(c);
  $('rpParts').innerHTML = c.rp.map((p, k) => k < rp.part ? `<span class="done">${esc(p)}</span>`
    : k === rp.part ? (rp.shown ? `<span class="now">${esc(p)}</span>` : '<span class="now hide">вспомни и повтори…</span>')
    : '<span class="later">…</span>').join(' ');
  $('rpCheck').disabled = done;
  $('rpSkip').textContent = done ? 'Следующее определение →' : rp.part === c.rp.length - 1 ? 'Пропустить ⏭' : 'Пропустить часть ⏭';
}
const repLabel = t => { $('rpLabel').textContent = t; };
const repLive = me => rp === me && screenNow === 'rep';
async function repCard() {
  rp.part = 0; rp.fails = 0; rp.shown = false;
  $('rpDone').hidden = true;
  $('rpAnswer').value = ''; $('rpFb').textContent = '';
  repRender();
  const me = rp;
  await speak(repTerm(rp.cards[rp.i]) + '.');
  if (!repLive(me)) return;
  repPlay();
}
// Марина говорит часть: текст виден, пока звучит, потом прячется
async function repPlay() {
  const me = rp, part = rp.part, c = rp.cards[rp.i];
  if (part >= c.rp.length) return;
  abortListening();
  rp.shown = true; repRender(); repLabel('Слушай…');
  await speak(c.rp[part]);
  if (!repLive(me) || me.part !== part) return;
  rp.shown = rp.fails >= 2; repRender();
  repLabel(MIC_IDLE);
}
function repCheck() {
  if (!rp) return;
  const c = rp.cards[rp.i], me = rp, text = $('rpAnswer').value.trim();
  if (!text || rp.part >= c.rp.length) return;
  if (repMatch(c.rp[rp.part], text)) {
    rp.part++; rp.fails = 0; rp.shown = false;
    $('rpAnswer').value = ''; $('rpFb').textContent = '';
    repRender();
    if (rp.part < c.rp.length) return repPlay();
    // определение целиком
    const lastOne = rp.i === rp.cards.length - 1;
    repAt()[rp.scope] = lastOne ? 0 : rp.i + 1; saveSettings();
    rp.count++;
    repLabel('');
    if (lastOne) showCheer(rp.scope === 'all' ? '🏆 Все определения пройдены!' : '🏁 Раздел пройден!');
    else if (rp.count % 3 === 0) showCheer(REP_POP[Math.floor(Math.random() * REP_POP.length)]);   // пузырь — иногда, как в опросе
    // между определениями — по кнопке; после последнего в разделе — сам к выбору раздела
    speak(REP_SAY[Math.floor(Math.random() * REP_SAY.length)]).then(() => {
      if (lastOne) setTimeout(() => { if (repLive(me) && me.part >= c.rp.length && !me.redo) { toast(me.scope === 'all' ? 'Все определения пройдены!' : 'Раздел пройден!'); hush(); rp = null; micUI = MIC_QUIZ; openRepPick(me.tid); } }, 1500);
    });
    $('rpNext').textContent = lastOne ? (me.scope === 'all' ? '🏆 К разделам' : '🏁 К разделам') : 'Следующее →';
    $('rpDone').hidden = false;
    return;
  }
  rp.fails++;
  $('rpFb').textContent = rp.fails >= 2 ? 'Не совсем. Вот эта часть — повтори её' : 'Не совсем — послушай ещё раз';
  $('rpAnswer').value = '';
  repPlay();
}
// ↻ Ещё раз — пройти это же определение с Мариной заново, сколько нужно
$('rpRedo').onclick = () => { if (!rp) return; abortListening(); hush(); hideCheer(); rp.redo = true; repCard(); };
$('rpNext').onclick = () => {
  if (!rp) return;
  if (rp.part >= rp.cards[rp.i].rp.length && rp.i === rp.cards.length - 1) { const t = rp.tid; hush(); rp = null; micUI = MIC_QUIZ; return openRepPick(t); }
  repNext();
};
function repNext() { abortListening(); hush(); rp.redo = false; rp.i = (rp.i + 1) % rp.cards.length; repAt()[rp.scope] = rp.i; saveSettings(); repCard(); }
$('rpCheck').onclick = () => { stopListening(); setTimeout(repCheck, rec || finishing ? 600 : 0); };
$('rpAnswer').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); repCheck(); } });
$('rpAnswer').addEventListener('input', () => updateMic());
$('rpClear').onclick = () => { abortListening(); $('rpAnswer').value = ''; baseText = ''; $('rpAnswer').focus(); };
$('rpAgain').onclick = () => { if (rp) repPlay(); };
$('rpSkip').onclick = () => {
  if (!rp) return;
  const c = rp.cards[rp.i];
  if (rp.part < c.rp.length - 1) { rp.part++; rp.fails = 0; $('rpAnswer').value = ''; $('rpFb').textContent = ''; return repPlay(); }
  repNext();
};
bindMic(MIC_REP);
$('rpBack').onclick = () => {
  abortListening(); hush(); hideCheer();
  if (rp) { repAt()[rp.scope] = rp.i; saveSettings(); }
  const t = rp ? rp.tid : READ_TID; rp = null; micUI = MIC_QUIZ; openRepPick(t);
};
