const axios = require('axios');
const { findCatalogEntry } = require('./endpointCatalog');

const MAX_RESPONSE_CHARS = Number(process.env.ASSISTANT_MAX_DATA_CHARS) || 24000;
const MAX_ENDPOINTS = Number(process.env.ASSISTANT_MAX_ENDPOINTS) || 5;

function getInternalApiBase() {
  const port = process.env.PORT || 5000;
  return (process.env.ASSISTANT_INTERNAL_API_BASE || `http://127.0.0.1:${port}/api`).replace(/\/$/, '');
}

function buildPath(catalogEntry, pathParams = {}) {
  let path = catalogEntry.path;
  for (const key of catalogEntry.pathParams || []) {
    const val = pathParams[key];
    if (!val) {
      throw new Error(`Missing path param: ${key}`);
    }
    path = path.replace(`{${key}}`, encodeURIComponent(String(val)));
  }
  return path;
}

function sanitizeQuery(query = {}) {
  const out = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = String(v);
  }
  return out;
}

function pickName(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return obj.name || obj.employee_name || obj.employeeName || null;
}

function compactEmployeePayload(data) {
  const emp = data?.data || data?.employee || data;
  if (!emp || typeof emp !== 'object' || Array.isArray(emp)) return data;
  const dept = emp.department_id || emp.department;
  const desig = emp.designation_id || emp.designation;
  return {
    success: data.success !== false,
    data: {
      emp_no: emp.emp_no,
      employee_name: emp.employee_name || emp.name,
      email: emp.email,
      phone_number: emp.phone_number,
      is_active: emp.is_active,
      department: typeof dept === 'object' ? pickName(dept) : dept,
      designation: typeof desig === 'object' ? pickName(desig) : desig,
      division: pickName(emp.division_id || emp.division),
    },
  };
}

function compactLeavesPayload(data) {
  const root = data?.data !== undefined ? data : { data };
  let items = [];
  if (Array.isArray(root)) items = root;
  else if (Array.isArray(root?.data)) items = root.data;
  else if (Array.isArray(data?.data)) items = data.data;
  if (!items.length) return data;

  const compact = items.map((i) => ({
    emp_no: i.emp_no || i.employeeId?.emp_no,
    employee_name: i.employee_name || i.employeeName,
    status: i.status,
    leaveType: i.leaveType || i.type,
    numberOfDays: i.numberOfDays,
    fromDate: i.fromDate,
    toDate: i.toDate,
  }));

  return {
    success: data?.success !== false,
    count: data?.count ?? compact.length,
    data: compact,
  };
}

function compactForEndpoint(endpointId, data) {
  if (endpointId === 'employee_detail') return compactEmployeePayload(data);
  if (endpointId === 'leaves_list' || endpointId === 'leaves_my' || endpointId === 'leaves_pending') {
    return compactLeavesPayload(data);
  }
  return data;
}

function truncateData(data) {
  const json = JSON.stringify(data);
  if (json.length <= MAX_RESPONSE_CHARS) {
    return { data, truncated: false };
  }
  return {
    data: {
      _truncated: true,
      _note: `Response was truncated to ${MAX_RESPONSE_CHARS} characters for the assistant.`,
      preview: json.slice(0, MAX_RESPONSE_CHARS),
    },
    truncated: true,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.bearerToken
 * @param {Array<{endpointId:string, pathParams?:object, query?:object, reason?:string}>} opts.plannedCalls
 */
async function fetchPlannedData({ bearerToken, plannedCalls }) {
  if (!bearerToken) {
    throw new Error('Missing user token for data fetch');
  }

  const base = getInternalApiBase();
  const calls = (plannedCalls || []).slice(0, MAX_ENDPOINTS);
  const results = [];

  for (const call of calls) {
    const entry = findCatalogEntry(call.endpointId);
    if (!entry) {
      results.push({
        endpointId: call.endpointId,
        ok: false,
        error: 'Unknown or disallowed endpoint',
      });
      continue;
    }

    if (entry.method !== 'GET') {
      results.push({
        endpointId: call.endpointId,
        ok: false,
        error: 'Only GET endpoints are allowed',
      });
      continue;
    }

    let relativePath;
    try {
      relativePath = buildPath(entry, call.pathParams || {});
    } catch (err) {
      results.push({
        endpointId: call.endpointId,
        ok: false,
        error: err.message,
      });
      continue;
    }

    const url = `${base}/${relativePath}`;
    const query = sanitizeQuery(call.query);

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        params: query,
        timeout: 30000,
        validateStatus: () => true,
      });

      const compacted = compactForEndpoint(call.endpointId, response.data);
      const { data, truncated } = truncateData(compacted);

      results.push({
        endpointId: call.endpointId,
        path: relativePath,
        query,
        reason: call.reason,
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        truncated,
        data: response.status >= 200 && response.status < 300 ? data : data,
      });
    } catch (err) {
      results.push({
        endpointId: call.endpointId,
        path: relativePath,
        ok: false,
        error: err.message || 'Request failed',
      });
    }
  }

  return results;
}

module.exports = {
  fetchPlannedData,
  getInternalApiBase,
};
