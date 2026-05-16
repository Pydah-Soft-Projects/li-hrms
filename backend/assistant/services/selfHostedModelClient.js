/**
 * Client for YOUR self-hosted HRMS AI model server only.
 * Contract (POST JSON):
 *   {base}/router  -> { endpoints, needsClarification, reasoning }
 *   {base}/answer  -> { reply }
 *   {base}/answer/stream -> SSE tokens { text }
 */
const axios = require('axios');
const { buildUserContext } = require('./userContext');
const { getCatalogForRole } = require('./endpointCatalog');

function getBaseUrl() {
  return (process.env.HRMS_AI_BASE_URL || '').replace(/\/$/, '');
}

function isConfigured() {
  return Boolean(getBaseUrl());
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const key = process.env.HRMS_AI_API_KEY;
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

async function planDataFetch({ message, reqUser, history = [] }) {
  const ctx = buildUserContext(reqUser);
  const catalog = getCatalogForRole(ctx.role);
  const path = process.env.HRMS_AI_ROUTER_PATH || '/router';

  const { data } = await axios.post(
    `${getBaseUrl()}${path}`,
    { message, userContext: ctx, catalog, history: history.slice(-8) },
    { headers: headers(), timeout: Number(process.env.HRMS_AI_TIMEOUT_MS) || 90000 }
  );

  return {
    userContext: ctx,
    needsClarification: data.needsClarification || null,
    endpoints: Array.isArray(data.endpoints) ? data.endpoints : [],
    reasoning: data.reasoning,
  };
}

async function generateAnswer(opts) {
  const path = process.env.HRMS_AI_ANSWER_PATH || '/answer';
  const { data } = await axios.post(
    `${getBaseUrl()}${path}`,
    {
      message: opts.message,
      userContext: opts.userContext,
      fetchedData: opts.fetchedData,
      needsClarification: opts.needsClarification,
      history: (opts.history || []).slice(-10),
    },
    { headers: headers(), timeout: Number(process.env.HRMS_AI_TIMEOUT_MS) || 90000 }
  );
  return {
    reply: (data.reply || data.content || '').trim(),
    answerEngine: data.answerEngine || 'unknown',
  };
}

async function* generateAnswerStream(opts) {
  const streamPath = process.env.HRMS_AI_ANSWER_STREAM_PATH || '/answer/stream';
  const response = await axios.post(
    `${getBaseUrl()}${streamPath}`,
    {
      message: opts.message,
      userContext: opts.userContext,
      fetchedData: opts.fetchedData,
      needsClarification: opts.needsClarification,
      history: (opts.history || []).slice(-10),
    },
    {
      headers: headers(),
      responseType: 'stream',
      timeout: Number(process.env.HRMS_AI_TIMEOUT_MS) || 120000,
    }
  );

  let buffer = '';
  for await (const chunk of response.data) {
    buffer += chunk.toString();
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine.slice(5).trim());
        if (parsed.text) yield parsed.text;
        if (parsed.done && parsed.answerEngine) yield { answerEngine: parsed.answerEngine };
      } catch {
        const text = dataLine.slice(5).trim();
        if (text && text !== '[DONE]') yield text;
      }
    }
  }
}

module.exports = {
  isConfigured,
  planDataFetch,
  generateAnswer,
  generateAnswerStream,
};
