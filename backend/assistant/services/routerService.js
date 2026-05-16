const hrmsModel = require('./hrmsModelProvider');
const { getCatalogForRole } = require('./endpointCatalog');
const { buildUserContext } = require('./userContext');

async function planDataFetch(opts) {
  return hrmsModel.planDataFetch(opts);
}

module.exports = {
  planDataFetch,
  buildUserContext,
  getCatalogForRole,
};
