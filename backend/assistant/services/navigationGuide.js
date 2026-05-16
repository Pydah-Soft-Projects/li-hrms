/**
 * In-app navigation help — no API calls, guides users to the right UI.
 */
const TOPICS = require('../data/userManualTopics');

function topicAllowed(topic, role) {
  if (topic.roles === 'all') return true;
  return Array.isArray(topic.roles) && topic.roles.includes(role);
}

function isNavigationQuestion(text) {
  const t = (text || '').toLowerCase();
  if (
    /\b(how to|how do i|how can i|where is|where are|where can i|where do i|steps to|guide to|help me apply|help me find|navigate|take me to)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (/\b(apply|find|see|view|check)\b/.test(t) && /\b(leave|od|attendance|payslip|loan|permission|ot)\b/.test(t)) {
    return true;
  }
  return false;
}

function scoreTopic(topic, q) {
  let score = 0;
  for (const kw of topic.keywords) {
    if (q.includes(kw.toLowerCase())) score += 8;
  }
  if (q.includes(topic.title.toLowerCase())) score += 5;
  return score;
}

function findTopic(message, role) {
  const q = (message || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const topic of TOPICS) {
    if (!topicAllowed(topic, role)) continue;
    const s = scoreTopic(topic, q);
    if (s > bestScore) {
      bestScore = s;
      best = topic;
    }
  }
  if (best) return best;
  if (isNavigationQuestion(message)) {
    return TOPICS.find((t) => t.id === 'view-my-leaves') || TOPICS[0];
  }
  return null;
}

function formatNavigationReply(topic, userName) {
  const name = (userName || 'there').split(' ')[0];
  const steps = topic.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return (
    `${name}, here's how to ${topic.title}:\n\n` +
    `${topic.summary}\n\n` +
    `Steps in the app:\n${steps}\n\n` +
    `Go to this page in HRMS: ${topic.path}\n\n` +
    `For the complete guide for every module, open User Manual from your dashboard.`
  );
}

module.exports = {
  isNavigationQuestion,
  findTopic,
  formatNavigationReply,
  TOPICS,
};
