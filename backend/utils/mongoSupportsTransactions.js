const mongoose = require('mongoose');

/**
 * Multi-document transactions require a replica set or mongos.
 * Standalone `mongod` throws: "Transaction numbers are only allowed on a replica set member or mongos"
 *
 * Uses `hello` (reliable across driver versions); falls back to topology description if needed.
 */
async function mongoSupportsTransactions() {
  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1) return false;
  try {
    const client = typeof conn.getClient === 'function' ? conn.getClient() : conn.client;
    if (!client) return false;
    const hello = await client.db('admin').command({ hello: 1 });
    if (hello && hello.msg === 'isdbgrid') return true;
    if (hello && typeof hello.setName === 'string' && hello.setName.length > 0) return true;
    return false;
  } catch {
    try {
      const client = typeof conn.getClient === 'function' ? conn.getClient() : conn.client;
      const type = client?.topology?.description?.type;
      if (type == null) return false;
      const t = String(type);
      return t === 'ReplicaSetWithPrimary' || t === 'Sharded' || t === 'LoadBalanced';
    } catch {
      return false;
    }
  }
}

module.exports = { mongoSupportsTransactions };
