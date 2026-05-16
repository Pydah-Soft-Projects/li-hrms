/**
 * HRMS-owned AI layer — no third-party LLM APIs.
 * - builtin (default): in-app router + answer engine using live HRMS data
 * - self_hosted: your own model server (HRMS_AI_BASE_URL only)
 */
const builtin = require('./builtinHrmsModel');
const selfHosted = require('./selfHostedModelClient');

function getProviderMode() {
  const mode = (process.env.HRMS_AI_PROVIDER || 'builtin').toLowerCase();
  if (mode === 'self_hosted' || mode === 'self-hosted') {
    return selfHosted.isConfigured() ? 'self_hosted' : 'builtin';
  }
  return 'builtin';
}

function isConfigured() {
  if (process.env.ASSISTANT_ENABLED === 'false') return false;
  const mode = getProviderMode();
  if (mode === 'self_hosted') return selfHosted.isConfigured();
  return true;
}

async function planDataFetch(opts) {
  const builtinPlan = await builtin.planDataFetch(opts);
  if (builtinPlan.navigationTopic) return builtinPlan;
  if (getProviderMode() === 'self_hosted') return selfHosted.planDataFetch(opts);
  return builtinPlan;
}

async function generateAnswer(opts) {
  if (opts.navigationTopic) {
    return builtin.generateAnswer(opts);
  }
  const mode = getProviderMode();
  if (mode === 'self_hosted') {
    const result = await selfHosted.generateAnswer(opts);
    if (typeof result === 'string') return { reply: result, answerEngine: 'self_hosted' };
    return result;
  }
  const result = await builtin.generateAnswer(opts);
  if (typeof result === 'object' && result.reply) return result;
  return { reply: result, answerEngine: 'hrms-native' };
}

async function* generateAnswerStream(opts) {
  if (opts.navigationTopic) {
    yield* builtin.generateAnswerStream(opts);
    return;
  }
  const mode = getProviderMode();
  if (mode === 'self_hosted') {
    yield* selfHosted.generateAnswerStream(opts);
    return;
  }
  yield* builtin.generateAnswerStream(opts);
}

module.exports = {
  getProviderMode,
  isConfigured,
  planDataFetch,
  generateAnswer,
  generateAnswerStream,
};
