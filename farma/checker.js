// Проверка ответа по ключевым словам. Работает в браузере и в node (для тестов).
(function (root) {
  function normalize(s) {
    return (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  // Расстояние Левенштейна — прощает ошибки распознавания в длинных названиях препаратов
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function stemFound(stem, words, joined) {
    // «из=» — только целое слово (иначе «из» найдётся в «избирательно»)
    if (stem.endsWith('=')) return words.includes(stem.slice(0, -1));
    const tol = stem.length >= 11 ? 2 : stem.length >= 7 ? 1 : 0;
    for (const w of words) {
      if (w.startsWith(stem)) return true;
      // начало слова должно совпадать точно, иначе «нейротокс» сойдёт за «нефротокс»
      if (tol && w.slice(0, 4) === stem.slice(0, 4) && w.length >= stem.length - 1 &&
          lev(w.slice(0, stem.length), stem) <= tol) return true;
    }
    // «грам положительная» / «грамположительная» — ищем и в склеенном тексте
    return stem.length >= 6 && joined.includes(stem);
  }

  function variantFound(variant, words, joined) {
    return variant.toLowerCase().replace(/ё/g, 'е').split(' ').filter(Boolean).every(st => stemFound(st, words, joined));
  }

  function itemFound(item, text, mode) {
    const norm = normalize(text);
    const words = norm.split(' ').filter(Boolean);
    const joined = words.join('');
    const variants = mode === 'exam' && item.e ? item.e : item.k;
    return variants.some(v => variantFound(v, words, joined));
  }

  // Какие пункты обязательны в этом режиме
  function requiredItems(card, mode) {
    return card.items.map((it, i) => i).filter(i => mode === 'exam' || !card.items[i].opt);
  }

  // Сколько назвать, сколько осталось. need — «назови не менее N» (для длинных списков).
  function status(card, foundSet, mode) {
    const required = requiredItems(card, mode);
    const missing = required.filter(i => !foundSet.has(i));
    const need = card.need ? Math.min(card.need, required.length) : required.length;
    const got = required.length - missing.length;
    const left = Math.max(0, need - got);
    return { required, missing, need, got, left, done: left === 0 };
  }

  // Возвращает { found: [индексы], missing, need, got, left, done }
  function check(card, text, mode) {
    const found = [];
    card.items.forEach((it, i) => { if (itemFound(it, text, mode)) found.push(i); });
    return { found, ...status(card, new Set(found), mode) };
  }

  // ── Исправление ослышек: незнакомое слово → ближайшее слово из лекций ──
  // «андреномиметики» → «адреномиметики», «холино литики» → «холинолитики».
  let vocabIndex = null;
  function buildIndex(vocab) {
    const set = new Set(vocab), byFirst = {};
    for (const w of vocab) (byFirst[w[0]] = byFirst[w[0]] || []).push(w);
    return { set, byFirst };
  }
  function nearest(m, idx) {
    const maxD = Math.max(1, Math.floor(m.length * 0.25));
    let best = null, bestD = maxD + 1;
    for (const w of idx.byFirst[m[0]] || []) {
      if (Math.abs(w.length - m.length) > maxD) continue;
      const d = lev(m, w);
      if (d < bestD || (d === bestD && best && w.length === m.length)) { best = w; bestD = d; }
    }
    return best ? { w: best, d: bestD } : null;
  }
  function correctTerms(text, vocab) {
    if (!vocab || !vocab.length) return text;
    if (!vocabIndex || vocabIndex.src !== vocab) vocabIndex = { ...buildIndex(vocab), src: vocab };
    const idx = vocabIndex;
    const toks = text.split(/\s+/).filter(Boolean);
    const clean = t => t.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9-]/g, '').replace(/-/g, '');
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const w = clean(toks[i]);
      if (w.length < 4 || /\d/.test(w)) { out.push(toks[i]); continue; }
      // склейка с одним-двумя следующими словами («холино литики»)
      let done = false;
      for (const n of [2, 1]) {
        if (i + n >= toks.length) continue;
        const parts = toks.slice(i + 1, i + 1 + n).map(clean);
        if (parts.some(p => p.length < 3)) continue;              // «и», «в» не приклеиваем
        const merged = [w, ...parts].join('');
        if (merged.length < 8) continue;
        const hit = idx.set.has(merged) ? { w: merged, d: 0 } : nearest(merged, idx);
        if (hit && hit.d <= Math.floor(merged.length * 0.15) && !(idx.set.has(w) && hit.d > 0)) {
          out.push(hit.w); i += n; done = true; break;
        }
      }
      if (done) continue;
      if (w.length < 5 || idx.set.has(w)) { out.push(toks[i]); continue; }
      const hit = nearest(w, idx);
      out.push(hit ? hit.w : toks[i]);
    }
    return out.join(' ');
  }

  const NOT_KNOW =/(^| )(не знаю|не помню|сдаюсь|без понятия|покажи ответ)( |$)/;
  function saysDontKnow(text) { return NOT_KNOW.test(normalize(text)); }

  const api = { normalize, check, status, itemFound, requiredItems, saysDontKnow, correctTerms };
  if (typeof module !== 'undefined') module.exports = api; else root.Checker = api;
})(this);
