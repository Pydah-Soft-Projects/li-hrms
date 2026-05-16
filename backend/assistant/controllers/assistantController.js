const { v4: uuidv4 } = require('uuid');
const { isConfigured, getProviderMode } = require('../services/hrmsModelProvider');
const { isLlmEnabled } = require('../services/llmService');
const { planDataFetch } = require('../services/routerService');
const { fetchPlannedData } = require('../services/dataFetcherService');
const { generateAnswer, generateAnswerStream } = require('../services/answerService');
const { getHistory, appendMessages } = require('../services/conversationStore');
const { buildUserContext } = require('../services/userContext');

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function getUserId(req) {
  return String(req.user?._id || req.user?.id || req.user?.userId || 'unknown');
}

exports.getStatus = async (req, res) => {
  let pythonHealth = null;
  if (getProviderMode() === 'self_hosted') {
    try {
      const axios = require('axios');
      const base = (process.env.HRMS_AI_BASE_URL || '').replace(/\/$/, '');
      const { data } = await axios.get(`${base}/health`, { timeout: 5000 });
      pythonHealth = data;
    } catch {
      pythonHealth = null;
    }
  }

  res.json({
    success: true,
    data: {
      enabled: process.env.ASSISTANT_ENABLED !== 'false',
      configured: isConfigured(),
      provider: getProviderMode(),
      engine: pythonHealth?.engine || (getProviderMode() === 'self_hosted' ? 'self_hosted' : 'hrms-native'),
      gguf: pythonHealth?.gguf || null,
      llmEnabled: isLlmEnabled(),
      conversationMemory: true,
      streaming: true,
    },
  });
};

exports.chat = async (req, res) => {
  try {
    if (process.env.ASSISTANT_ENABLED === 'false') {
      return res.status(503).json({
        success: false,
        message: 'HR assistant is currently disabled.',
      });
    }

    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'HR assistant is not available.',
        code: 'ASSISTANT_NOT_CONFIGURED',
      });
    }

    const { message, sessionId: clientSessionId } = req.body || {};
    const trimmed = (message || '').trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    if (trimmed.length > 4000) {
      return res.status(400).json({ success: false, message: 'Message is too long' });
    }

    const userId = getUserId(req);
    const sessionId = clientSessionId || uuidv4();
    const history = getHistory(userId, sessionId);
    const token = getBearerToken(req);

    const plan = await planDataFetch({
      message: trimmed,
      reqUser: req.user,
      history,
    });

    let fetchedData = [];
    if (!plan.needsClarification && plan.endpoints.length > 0 && !plan.navigationTopic) {
      fetchedData = await fetchPlannedData({
        bearerToken: token,
        plannedCalls: plan.endpoints,
      });
    }

    const { reply, answerEngine, navigationTopicId, navigationPath } = await generateAnswer({
      message: trimmed,
      userContext: plan.userContext || buildUserContext(req.user),
      history,
      fetchedData,
      needsClarification: plan.needsClarification,
      navigationTopic: plan.navigationTopic,
    });

    appendMessages(userId, sessionId, [
      { role: 'user', content: trimmed },
      { role: 'assistant', content: reply },
    ]);

    res.json({
      success: true,
      data: {
        reply,
        sessionId,
        meta: {
          endpointsUsed: (plan.endpoints || []).map((e) => e.endpointId),
          needsClarification: Boolean(plan.needsClarification),
          answerEngine: answerEngine || getProviderMode(),
          navigationTopicId: navigationTopicId || null,
          navigationPath: navigationPath || null,
        },
      },
    });
  } catch (err) {
    console.error('[Assistant] chat error:', err);
    const status = err.message === 'ASSISTANT_NOT_CONFIGURED' ? 503 : 500;
    res.status(status).json({
      success: false,
      message:
        err.message === 'ASSISTANT_NOT_CONFIGURED'
          ? 'HR assistant is not available.'
          : 'Failed to process your question. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

exports.chatStream = async (req, res) => {
  try {
    if (process.env.ASSISTANT_ENABLED === 'false' || !isConfigured()) {
      return res.status(503).json({ success: false, message: 'HR assistant unavailable' });
    }

    const { message, sessionId: clientSessionId } = req.body || {};
    const trimmed = (message || '').trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const userId = getUserId(req);
    const sessionId = clientSessionId || uuidv4();
    const history = getHistory(userId, sessionId);
    const token = getBearerToken(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('session', { sessionId });

    send('status', { phase: 'thinking' });

    const plan = await planDataFetch({
      message: trimmed,
      reqUser: req.user,
      history,
    });

    let fetchedData = [];
    if (!plan.needsClarification && plan.endpoints.length > 0 && !plan.navigationTopic) {
      send('status', { phase: 'fetching' });
      fetchedData = await fetchPlannedData({
        bearerToken: token,
        plannedCalls: plan.endpoints,
      });
    }

    send('status', { phase: 'responding' });

    let fullReply = '';
    let answerEngine = getProviderMode();
    let navigationTopicId = null;
    let navigationPath = null;
    const stream = generateAnswerStream({
      message: trimmed,
      userContext: plan.userContext || buildUserContext(req.user),
      history,
      fetchedData,
      needsClarification: plan.needsClarification,
      navigationTopic: plan.navigationTopic,
    });

    for await (const chunk of stream) {
      if (typeof chunk === 'object' && chunk !== null) {
        if (chunk.answerEngine) answerEngine = chunk.answerEngine;
        if (chunk.navigationTopicId) navigationTopicId = chunk.navigationTopicId;
        if (chunk.navigationPath) navigationPath = chunk.navigationPath;
        continue;
      }
      fullReply += chunk;
      send('token', { text: chunk });
    }

    appendMessages(userId, sessionId, [
      { role: 'user', content: trimmed },
      { role: 'assistant', content: fullReply },
    ]);

    send('done', {
      sessionId,
      meta: {
        endpointsUsed: (plan.endpoints || []).map((e) => e.endpointId),
        answerEngine,
        navigationTopicId: navigationTopicId || null,
        navigationPath: navigationPath || null,
      },
    });
    res.end();
  } catch (err) {
    console.error('[Assistant] stream error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Stream failed' });
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream failed' })}\n\n`);
    res.end();
  }
};
