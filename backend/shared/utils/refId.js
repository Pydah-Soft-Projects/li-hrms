const mongoose = require('mongoose');

const OBJECTID_HEX = /^[a-fA-F0-9]{24}$/;
const INSPECT_OID = /ObjectId\(['"]([a-fA-F0-9]{24})['"]\)/;

/**
 * Extract a real Mongo ObjectId from a ref that may be:
 * - ObjectId
 * - 24-char hex string
 * - populated document ({ _id, name, shifts, ... })
 * - Mongoose Document (whose .toString() is an inspect dump, NOT the hex id)
 *
 * Never call .toString() on a populated document and pass that to ObjectId queries.
 */
function toRefId(value) {
  if (value == null || value === '' || value === 'all') return null;

  if (typeof value === 'object') {
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (typeof value.toHexString === 'function' && !value._id) {
      const hex = value.toHexString();
      if (OBJECTID_HEX.test(hex)) return new mongoose.Types.ObjectId(hex);
    }
    if (value._id != null) return toRefId(value._id);
  }

  const s = String(value).trim();
  if (OBJECTID_HEX.test(s)) return new mongoose.Types.ObjectId(s);

  // Last resort: "{ _id: new ObjectId('...') , name: 'UNIT-2', shifts: [...] }"
  const m = s.match(INSPECT_OID);
  if (m) return new mongoose.Types.ObjectId(m[1]);

  return null;
}

function toRefIdString(value) {
  const id = toRefId(value);
  return id ? String(id) : null;
}

module.exports = { toRefId, toRefIdString };
