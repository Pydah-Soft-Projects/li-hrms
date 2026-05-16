const hrmsModel = require('./hrmsModelProvider');

async function generateAnswer(opts) {
  return hrmsModel.generateAnswer(opts);
}

async function* generateAnswerStream(opts) {
  yield* hrmsModel.generateAnswerStream(opts);
}

module.exports = {
  generateAnswer,
  generateAnswerStream,
};
