const mysql = require('mysql2/promise');

let pool = null;

/**
 * Returns a singleton MySQL connection pool for maintenance_db
 */
const getMaintenancePool = () => {
  if (!pool) {
    const host = process.env.MAINTENANCE_DB_HOST || process.env.DB_HOST;
    const user = process.env.MAINTENANCE_DB_USER || process.env.DB_USER;
    const password = process.env.MAINTENANCE_DB_PASSWORD || process.env.DB_PASSWORD;
    const database = process.env.MAINTENANCE_DB_NAME || process.env.DB_NAME || 'maintenance_db';
    const port = parseInt(process.env.MAINTENANCE_DB_PORT || process.env.DB_PORT || process.env.SQL_PORT || '3306', 10);

    if (!host || !user || !password) {
      throw new Error('Maintenance database connection is missing required environment configuration.');
    }

    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      port,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    console.log(`[MaintenanceDB] Connection pool created for ${database}`);
  }
  return pool;
};

/**
 * Fetch all active categories & subcategories from maintenance_db
 */
const getCategories = async () => {
  const p = getMaintenancePool();
  const [rows] = await p.query(`
    SELECT id, name, description, parent_id, is_active, display_order, requires_approval
    FROM categories
    WHERE is_active = 1
    ORDER BY display_order ASC, name ASC
  `);

  const parents = [];
  const subCategoriesByParent = {};

  rows.forEach((cat) => {
    if (cat.parent_id === null || cat.parent_id === undefined) {
      parents.push(cat);
      if (!subCategoriesByParent[cat.id]) {
        subCategoriesByParent[cat.id] = [];
      }
    } else {
      if (!subCategoriesByParent[cat.parent_id]) {
        subCategoriesByParent[cat.parent_id] = [];
      }
      subCategoriesByParent[cat.parent_id].push(cat);
    }
  });

  return {
    all: rows,
    categories: parents,
    subCategoriesByParent,
  };
};

/**
 * Generate a unique complaint number: TKT-YYYY-XXXXXX-XXX
 */
const generateComplaintNumber = async () => {
  const p = getMaintenancePool();
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    const rand1 = Math.floor(100000 + Math.random() * 900000);
    const rand2 = Math.floor(100 + Math.random() * 900);
    const candidate = `TKT-${year}-${rand1}-${rand2}`;

    const [existing] = await p.query(
      'SELECT id FROM complaints WHERE complaint_number = ? LIMIT 1',
      [candidate]
    );

    if (existing.length === 0) {
      return candidate;
    }
  }

  // Fallback timestamp based
  return `TKT-${year}-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
};

/**
 * Insert a new complaint into maintenance_db.complaints
 */
const createComplaint = async (complaintData) => {
  const p = getMaintenancePool();

  const complaintNumber = await generateComplaintNumber();

  // If requester_hrms_id is given, see if a matching user exists in maintenance_db.users
  let requesterUserId = null;
  if (complaintData.requester_hrms_id) {
    try {
      const [matchedUsers] = await p.query(
        'SELECT id FROM users WHERE hrms_id = ? LIMIT 1',
        [complaintData.requester_hrms_id]
      );
      if (matchedUsers.length > 0) {
        requesterUserId = matchedUsers[0].id;
      }
    } catch (err) {
      console.warn('[MaintenanceDB] Note checking user by hrms_id:', err.message);
    }
  }

  const initialStatusHistory = [
    {
      id: Date.now(),
      notes: 'Submitted via HRMS Portal',
      changed_by: requesterUserId,
      created_at: new Date().toISOString(),
      new_status: 'pending',
      old_status: null,
    },
  ];

  const sql = `
    INSERT INTO complaints (
      complaint_number,
      requester_user_id,
      requester_type,
      reference_site,
      requester_hrms_id,
      requester_name,
      requester_identifier,
      category_id,
      sub_category_id,
      college_id,
      college_name,
      block_no,
      floor_no,
      room_no,
      title,
      description,
      photo_url,
      status,
      priority,
      assignments,
      comments,
      status_history,
      feedback,
      resolved_at,
      closed_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NOW(), NOW())
  `;

  const values = [
    complaintNumber,
    requesterUserId,
    'staff', // requester_type
    'HRMS', // reference_site
    complaintData.requester_hrms_id || null,
    complaintData.requester_name || null,
    complaintData.requester_identifier || null,
    complaintData.category_id,
    complaintData.sub_category_id || null,
    complaintData.college_id ? parseInt(complaintData.college_id, 10) : null,
    complaintData.college_name || null,
    complaintData.block_no || null,
    complaintData.floor_no || null,
    complaintData.room_no || null,
    complaintData.title,
    complaintData.description || null,
    complaintData.photo_url || null,
    'pending', // default status
    complaintData.priority || 'medium',
    JSON.stringify([]), // assignments
    JSON.stringify([]), // comments
    JSON.stringify(initialStatusHistory),
    null, // feedback
  ];

  const [result] = await p.query(sql, values);

  return {
    id: result.insertId,
    complaint_number: complaintNumber,
    status: 'pending',
  };
};

/**
 * Fetch complaints with filtering, search, and pagination
 */
const getComplaints = async ({
  requester_hrms_id,
  requester_identifier,
  only_my = false,
  status,
  category_id,
  priority,
  search,
  startDate,
  endDate,
  page = 1,
  limit = 20,
}) => {
  const p = getMaintenancePool();

  const conditions = [];
  const params = [];

  // HRMS scope
  conditions.push("c.reference_site = 'HRMS'");

  if (only_my) {
    if (requester_hrms_id && requester_identifier) {
      conditions.push('(c.requester_hrms_id = ? OR c.requester_identifier = ?)');
      params.push(requester_hrms_id, requester_identifier);
    } else if (requester_hrms_id) {
      conditions.push('c.requester_hrms_id = ?');
      params.push(requester_hrms_id);
    } else if (requester_identifier) {
      conditions.push('c.requester_identifier = ?');
      params.push(requester_identifier);
    }
  }

  if (status && status !== 'all') {
    conditions.push('c.status = ?');
    params.push(status);
  }

  if (category_id) {
    conditions.push('c.category_id = ?');
    params.push(parseInt(category_id, 10));
  }

  if (priority && priority !== 'all') {
    conditions.push('c.priority = ?');
    params.push(priority);
  }

  if (startDate) {
    conditions.push('c.created_at >= ?');
    params.push(`${startDate} 00:00:00`);
  }

  if (endDate) {
    conditions.push('c.created_at <= ?');
    params.push(`${endDate} 23:59:59`);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      '(c.complaint_number LIKE ? OR c.title LIKE ? OR c.description LIKE ? OR c.requester_name LIKE ? OR c.block_no LIKE ? OR c.room_no LIKE ?)'
    );
    params.push(term, term, term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const [countResult] = await p.query(
    `SELECT COUNT(*) as total FROM complaints c ${whereClause}`,
    params
  );
  const total = countResult[0]?.total || 0;

  // Get paginated complaints with category names joined
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const querySql = `
    SELECT 
      c.id,
      c.complaint_number,
      c.requester_user_id,
      c.requester_type,
      c.reference_site,
      c.requester_hrms_id,
      c.requester_name,
      c.requester_identifier,
      c.category_id,
      c.sub_category_id,
      cat.name AS category_name,
      subcat.name AS sub_category_name,
      c.college_id,
      c.college_name,
      c.block_no,
      c.floor_no,
      c.room_no,
      c.title,
      c.description,
      c.photo_url,
      c.status,
      c.priority,
      c.assignments,
      c.comments,
      c.status_history,
      c.feedback,
      c.resolved_at,
      c.closed_at,
      c.created_at,
      c.updated_at
    FROM complaints c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN categories subcat ON c.sub_category_id = subcat.id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await p.query(querySql, [...params, limitNum, offset]);

  // Parse JSON fields safely if MySQL didn't auto-parse
  const formattedRows = rows.map((row) => ({
    ...row,
    assignments: typeof row.assignments === 'string' ? JSON.parse(row.assignments) : row.assignments || [],
    comments: typeof row.comments === 'string' ? JSON.parse(row.comments) : row.comments || [],
    status_history: typeof row.status_history === 'string' ? JSON.parse(row.status_history) : row.status_history || [],
    feedback: typeof row.feedback === 'string' ? JSON.parse(row.feedback) : row.feedback || null,
  }));

  // Fetch summary counts for HRMS complaints
  const [statusCounts] = await p.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN c.status IN ('approaching', 'resolving', 'in_progress') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN c.status IN ('completed', 'resolved') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN c.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM complaints c
    ${whereClause}
  `, params);

  const stats = statusCounts[0] || { total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 };

  return {
    complaints: formattedRows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    stats: {
      total: Number(stats.total || 0),
      pending: Number(stats.pending || 0),
      in_progress: Number(stats.in_progress || 0),
      completed: Number(stats.completed || 0),
      cancelled: Number(stats.cancelled || 0),
    },
  };
};

/**
 * Fetch a single complaint by ID or complaint_number
 */
const getComplaintById = async (idOrNumber) => {
  const p = getMaintenancePool();

  const isNumeric = /^\d+$/.test(String(idOrNumber));
  const where = isNumeric ? 'c.id = ?' : 'c.complaint_number = ?';

  const [rows] = await p.query(
    `
    SELECT 
      c.id,
      c.complaint_number,
      c.requester_user_id,
      c.requester_type,
      c.reference_site,
      c.requester_hrms_id,
      c.requester_name,
      c.requester_identifier,
      c.category_id,
      c.sub_category_id,
      cat.name AS category_name,
      subcat.name AS sub_category_name,
      c.college_id,
      c.college_name,
      c.block_no,
      c.floor_no,
      c.room_no,
      c.title,
      c.description,
      c.photo_url,
      c.status,
      c.priority,
      c.assignments,
      c.comments,
      c.status_history,
      c.feedback,
      c.resolved_at,
      c.closed_at,
      c.created_at,
      c.updated_at
    FROM complaints c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN categories subcat ON c.sub_category_id = subcat.id
    WHERE ${where}
    LIMIT 1
  `,
    [idOrNumber]
  );

  if (!rows || rows.length === 0) return null;

  const row = rows[0];
  const complaint = {
    ...row,
    assignments: typeof row.assignments === 'string' ? JSON.parse(row.assignments) : row.assignments || [],
    comments: typeof row.comments === 'string' ? JSON.parse(row.comments) : row.comments || [],
    status_history: typeof row.status_history === 'string' ? JSON.parse(row.status_history) : row.status_history || [],
    feedback: typeof row.feedback === 'string' ? JSON.parse(row.feedback) : row.feedback || null,
  };

  const assignments = Array.isArray(complaint.assignments) ? complaint.assignments : [];
  const assignedUserId = (assignment) => {
    if (!assignment || typeof assignment !== 'object') {
      const id = Number(assignment);
      return Number.isInteger(id) && id > 0 ? id : null;
    }

    const user = assignment.assigned_user || assignment.assignedUser || assignment.user ||
      assignment.staff || assignment.assignee || assignment.assigned_to || assignment.assignedTo;
    const id = user?.id || user?.user_id || user?.userId || user?.staff_id || user?.staffId ||
      assignment.user_id || assignment.userId || assignment.staff_id || assignment.staffId ||
      assignment.staff_user_id || assignment.staffUserId || assignment.assigned_user_id ||
      assignment.assignedUserId || assignment.assignee_id || assignment.assigneeId ||
      assignment.assigned_to || assignment.assignedTo;
    const normalizedId = Number(id);
    return Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : null;
  };
  const userIds = [...new Set(assignments.map(assignedUserId).filter(Boolean))];
  if (userIds.length > 0) {
    const [assignedUsers] = await p.query(
      'SELECT id, name, username, email, phone, hrms_id, role FROM users WHERE id IN (?)',
      [userIds]
    );
    const usersById = new Map(assignedUsers.map((user) => [Number(user.id), user]));
    complaint.assignments = assignments.map((assignment) => {
      const nestedUser = assignment && typeof assignment === 'object'
        ? assignment.assigned_user || assignment.assignedUser || assignment.user ||
          assignment.staff || assignment.assignee || assignment.assigned_to || assignment.assignedTo
        : null;
      const hasNestedUserDetails = nestedUser && typeof nestedUser === 'object' &&
        (nestedUser.name || nestedUser.username || nestedUser.email || nestedUser.phone);
      const resolvedUser = hasNestedUserDetails
        ? nestedUser
        : usersById.get(assignedUserId(assignment)) || null;

      return assignment && typeof assignment === 'object'
        ? { ...assignment, assigned_user: resolvedUser }
        : { user_id: assignedUserId(assignment), assigned_user: resolvedUser };
    });
  }

  return complaint;
};

/**
 * Add a comment/message to a complaint
 */
const addComment = async (complaintId, { userName, userIdentifier, commentText }) => {
  const p = getMaintenancePool();
  const complaint = await getComplaintById(complaintId);
  if (!complaint) throw new Error('Complaint not found');

  const comments = Array.isArray(complaint.comments) ? complaint.comments : [];
  const newComment = {
    id: Date.now(),
    user_name: userName || 'Staff',
    user_identifier: userIdentifier || null,
    comment: commentText,
    created_at: new Date().toISOString(),
  };

  comments.push(newComment);

  await p.query(
    'UPDATE complaints SET comments = ?, updated_at = NOW() WHERE id = ?',
    [JSON.stringify(comments), complaint.id]
  );

  return newComment;
};

/**
 * Submit feedback on a resolved complaint
 */
const submitFeedback = async (complaintId, { rating, comment, is_satisfied }) => {
  const p = getMaintenancePool();
  const complaint = await getComplaintById(complaintId);
  if (!complaint) throw new Error('Complaint not found');

  const feedbackObj = {
    rating: Number(rating) || (is_satisfied ? 5 : 1),
    comment: comment || null,
    is_satisfied: Boolean(is_satisfied),
    submitted_at: new Date().toISOString(),
  };

  const statusHistory = Array.isArray(complaint.status_history) ? complaint.status_history : [];
  const updateStatus = is_satisfied === false;
  const nextStatus = updateStatus ? 'pending' : complaint.status;
  if (updateStatus) {
    statusHistory.push({
      id: Date.now(),
      notes: 'Requester was not satisfied; complaint reopened for follow-up.',
      changed_by: complaint.requester_user_id || null,
      created_at: new Date().toISOString(),
      new_status: 'pending',
      old_status: complaint.status,
    });
  }

  await p.query(
    `UPDATE complaints
     SET feedback = ?,
         status = ?,
         status_history = ?,
         resolved_at = ?,
         closed_at = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [
      JSON.stringify(feedbackObj),
      nextStatus,
      JSON.stringify(statusHistory),
      updateStatus ? null : complaint.resolved_at,
      updateStatus ? null : complaint.closed_at,
      complaint.id,
    ]
  );

  return { ...feedbackObj, status: nextStatus };
};

module.exports = {
  getMaintenancePool,
  getCategories,
  createComplaint,
  getComplaints,
  getComplaintById,
  addComment,
  submitFeedback,
};

