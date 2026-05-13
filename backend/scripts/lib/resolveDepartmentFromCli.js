const Department = require('../../departments/model/Department');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a single department from CLI token: exact code (uppercase), exact name (case-insensitive), then substring name.
 * @param {string} token
 * @returns {Promise<{ _id: import('mongoose').Types.ObjectId; name: string; code?: string } | null>}
 */
async function resolveDepartmentFromCli(token) {
  if (!token || !String(token).trim()) return null;
  const t = String(token).trim();
  const codeUpper = t.toUpperCase();

  let list = await Department.find({ code: codeUpper }).limit(5).lean();
  if (list.length === 1) return list[0];

  list = await Department.find({ name: new RegExp(`^${escapeRegex(t)}$`, 'i') }).limit(5).lean();
  if (list.length === 1) return list[0];

  list = await Department.find({ name: new RegExp(escapeRegex(t), 'i') }).limit(15).lean();
  if (list.length === 0) {
    throw new Error(`No department matching "${t}" (try exact name or code).`);
  }
  if (list.length > 1) {
    const names = list.map((d) => d.name).join(', ');
    throw new Error(
      `Ambiguous department "${t}" — matches: ${names}. Use a longer substring or department code.`
    );
  }
  return list[0];
}

module.exports = { resolveDepartmentFromCli };
