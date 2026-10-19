// Регистрация тем: каждая лекция — отдельный файл, который вызывает addTopic.
window.BANK = window.BANK || [];
window.addTopic = function (subjectId, subjectName, topic) {
  let subj = window.BANK.find(s => s.id === subjectId);
  if (!subj) { subj = { id: subjectId, name: subjectName, topics: [] }; window.BANK.push(subj); }
  subj.topics.push(topic);
  subj.topics.sort((a, b) => a.id.localeCompare(b.id));
};
