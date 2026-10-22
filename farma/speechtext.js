// Текст для голоса — общий для приложения и для записи голосом Марины (tools/make_audio.js).
(function (root) {
  // Текст для голоса: без кавычек и скобок (иначе iPhone читает «quote»), греческие буквы — словами
  // Сокращения читаем по буквам (ЦНС → «цэ-эн-эс»), кроме тех, что говорят словом
  const LETTER = { А: 'а', Б: 'бэ', В: 'вэ', Г: 'гэ', Д: 'дэ', Е: 'е', Ё: 'ё', Ж: 'жэ', З: 'зэ', И: 'и', Й: 'й', К: 'ка', Л: 'эль', М: 'эм', Н: 'эн',
    О: 'о', П: 'пэ', Р: 'эр', С: 'эс', Т: 'тэ', У: 'у', Ф: 'эф', Х: 'ха', Ц: 'цэ', Ч: 'че', Ш: 'ша', Щ: 'ща', Э: 'э', Ю: 'ю', Я: 'я' };
  const SAY_AS_WORD = new Set(['ЦОГ']);
  function spellAbbr(s) {
    // без «просмотра назад» в регулярке — старый Safari на iPhone его не понимает
    return s.replace(/(^|[^А-Яа-яЁё])([А-ЯЁ]{2,5})(?![а-яё])/g, (_, pre, m) =>
      pre + (SAY_AS_WORD.has(m) ? m.toLowerCase() : [...m].map(ch => LETTER[ch] || ch).join('-')));
  }
  // Римские цифры: «II группы» → «второй группы», «ангиотензин II» → «ангиотензин два» (Марина читала «ай-ай»)
  const ORD = { I: ['перв', 'ая', 'ой', 'ую'], II: ['втор', 'ая', 'ой', 'ую'], III: ['трет', 'ья', 'ьей', 'ью'], IV: ['четвёрт', 'ая', 'ой', 'ую'] };
  const CARD = { I: 'один', II: 'два', III: 'три', IV: 'четыре' };
  function romans(s) {
    return s
      .replace(/(^|[^A-Za-z])(IV|I{1,3})\s+(групп)([а-яё]*)/g, (_, pre, r, g, end) => {
        const o = ORD[r], form = end === 'а' ? 1 : end === 'у' ? 3 : 2;
        return pre + o[0] + o[form] + ' ' + g + end;
      })
      .replace(/(^|[^A-Za-z])(IV|I{1,3})(?![A-Za-z])/g, (_, pre, r) => pre + CARD[r]);
  }
  function forSpeech(s) {
    return spellAbbr(romans(s))
      .replace(/мм\s*рт\.?\s*ст\.?/g, 'миллиметров ртутного столба')
      .replace(/(\d+)\s*\/\s*(\d+)/g, '$1 на $2')
      .replace(/[«»"“”„'`]/g, '')
      .replace(/[()[\]]/g, ', ')
      .replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 до $2')
      .replace(/\s+[—–]\s+/g, ', ')
      .replace(/α/g, 'альфа ').replace(/β/g, 'бета ')
      .replace(/%/g, ' процентов')
      .replace(/^\d+\.\s*/, '')
      .replace(/\s*,\s*([,.?!])/g, '$1').replace(/\s{2,}/g, ' ');
  }
  // Номер записи: короткий хэш исходного текста (FNV-1a) — файл audio/<хэш>.mp3
  function audioKey(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  root.forSpeech = forSpeech; root.audioKey = audioKey;
})(typeof window !== 'undefined' ? window : globalThis);
