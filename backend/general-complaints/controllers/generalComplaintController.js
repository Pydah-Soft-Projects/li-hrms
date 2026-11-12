const maintenanceDbService = require('../services/maintenanceDbService');

const getIdentity = (req) => {
  const user = req.user || {};
  const identifiers = [
    user.employeeId,
    user.employeeRef,
    user._id,
    user.email,
  ]
    .filter(Boolean)
    .map((value) => String(value));

  const requesterIdentifier = identifiers[0];
  if (!requesterIdentifier || requesterIdentifier.length > 100) return null;

  const requesterHrmsId = identifiers.find((value) => value.length <= 24) || null;

  return {
    requesterHrmsId,
    requesterIdentifier,
    identifiers: new Set(identifiers),
  };
};

const isComplaintOwner = (complaint, identity) =>
  Boolean(identity) &&
  (
    identity.identifiers.has(String(complaint.requester_hrms_id || '')) ||
    identity.identifiers.has(String(complaint.requester_identifier || ''))
  );

const errorResponse = (res, error, message = 'Unable to process the complaint request.') => {
  console.error('[GeneralComplaints] Request failed:', error);
  return res.status(500).json({ success: false, message });
};

const parseOptionalId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
};

const optionalText = (value, maxLength) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= maxLength ? text : null;
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await maintenanceDbService.getCategories();
    return res.json({ success: true, data: categories });
  } catch (error) {
    return errorResponse(res, error, 'Could not load maintenance complaint categories.');
  }
};

exports.getMyComplaints = async (req, res) => {
  const identity = getIdentity(req);
  if (!identity) {
    return res.status(401).json({ success: false, message: 'Your account does not have a usable complaint identity.' });
  }

  try {
    const result = await maintenanceDbService.getComplaints({
      requester_hrms_id: identity.requesterHrmsId,
      requester_identifier: identity.requesterIdentifier,
      only_my: true,
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 'Could not load your general complaints.');
  }
};

exports.createComplaint = async (req, res) => {
  const identity = getIdentity(req);
  if (!identity) {
    return res.status(401).json({ success: false, message: 'Your account does not have a usable complaint identity.' });
  }

  const title = optionalText(req.body.title, 255);
  const description = optionalText(req.body.description, 10000);
  const collegeName = optionalText(req.body.college_name, 255);
  const blockNo = optionalText(req.body.block_no, 100);
  const floorNo = optionalText(req.body.floor_no, 100);
  const roomNo = optionalText(req.body.room_no, 100);
  const photoUrl = optionalText(req.body.photo_url, 1024);
  const categoryId = parseOptionalId(req.body.category_id);
  const subCategoryId = parseOptionalId(req.body.sub_category_id);
  const collegeId = parseOptionalId(req.body.college_id);
  const allowedPriorities = ['low', 'medium', 'high', 'urgent'];
  const priority = req.body.priority || 'medium';

  if (title === null || !title) {
    return res.status(400).json({ success: false, message: 'A complaint title of up to 255 characters is required.' });
  }
  if (
    description === null ||
    collegeName === null ||
    blockNo === null ||
    floorNo === null ||
    roomNo === null ||
    photoUrl === null
  ) {
    return res.status(400).json({ success: false, message: 'One or more complaint fields exceed the allowed length or have an invalid format.' });
  }
  if (!Number.isInteger(categoryId) || (subCategoryId !== null && !Number.isInteger(subCategoryId))) {
    return res.status(400).json({ success: false, message: 'Select a valid complaint category and subcategory.' });
  }
  if (collegeId !== null && !Number.isInteger(collegeId)) {
    return res.status(400).json({ success: false, message: 'College ID must be a positive number.' });
  }
  if (!allowedPriorities.includes(priority)) {
    return res.status(400).json({ success: false, message: 'Select a valid complaint priority.' });
  }

  try {
    const categoryData = await maintenanceDbService.getCategories();
    const selectedCategory = categoryData.categories.find((category) => Number(category.id) === categoryId);
    const selectedSubCategory = subCategoryId === null
      ? null
      : (categoryData.subCategoriesByParent[categoryId] || []).find(
        (category) => Number(category.id) === subCategoryId
      );

    if (!selectedCategory || (subCategoryId !== null && !selectedSubCategory)) {
      return res.status(400).json({ success: false, message: 'The selected complaint category is no longer available.' });
    }

    const user = req.user;
    const result = await maintenanceDbService.createComplaint({
      requester_hrms_id: identity.requesterHrmsId,
      requester_name: user.name || user.email || 'HRMS user',
      requester_identifier: identity.requesterIdentifier,
      category_id: categoryId,
      sub_category_id: subCategoryId,
      college_id: collegeId,
      college_name: collegeName || null,
      block_no: blockNo || null,
      floor_no: floorNo || null,
      room_no: roomNo || null,
      title,
      description: description || null,
      photo_url: photoUrl || null,
      priority,
    });

    return res.status(201).json({ success: true, message: 'General complaint submitted.', data: result });
  } catch (error) {
    return errorResponse(res, error, 'Could not submit the complaint to the maintenance system.');
  }
};

exports.getComplaint = async (req, res) => {
  const identity = getIdentity(req);
  if (!identity) {
    return res.status(401).json({ success: false, message: 'Your account does not have a usable complaint identity.' });
  }

  try {
    const complaint = await maintenanceDbService.getComplaintById(req.params.id);
    if (!complaint || !isComplaintOwner(complaint, identity)) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    return res.json({ success: true, data: complaint });
  } catch (error) {
    return errorResponse(res, error, 'Could not load the complaint details.');
  }
};

exports.addComment = async (req, res) => {
  const identity = getIdentity(req);
  const commentText = optionalText(req.body.comment, 2000);
  if (!identity) {
    return res.status(401).json({ success: false, message: 'Your account does not have a usable complaint identity.' });
  }
  if (commentText === null || !commentText) {
    return res.status(400).json({ success: false, message: 'Enter a comment of up to 2,000 characters.' });
  }

  try {
    const complaint = await maintenanceDbService.getComplaintById(req.params.id);
    if (!complaint || !isComplaintOwner(complaint, identity)) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    if (complaint.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Comments cannot be added to a cancelled complaint.' });
    }

    const comment = await maintenanceDbService.addComment(complaint.id, {
      userName: req.user.name || req.user.email,
      userIdentifier: identity.requesterIdentifier,
      commentText,
    });
    return res.status(201).json({ success: true, message: 'Comment added.', data: comment });
  } catch (error) {
    return errorResponse(res, error, 'Could not add the complaint comment.');
  }
};

exports.submitFeedback = async (req, res) => {
  const identity = getIdentity(req);
  const comment = optionalText(req.body.comment, 2000);
  const isSatisfied = req.body.is_satisfied;
  const requestedRating = req.body.rating === undefined ? null : Number(req.body.rating);
  if (!identity) {
    return res.status(401).json({ success: false, message: 'Your account does not have a usable complaint identity.' });
  }
  if (
    typeof isSatisfied !== 'boolean' ||
    (requestedRating !== null && (!Number.isInteger(requestedRating) || requestedRating < 1 || requestedRating > 5)) ||
    comment === null
  ) {
    return res.status(400).json({ success: false, message: 'Select whether you are satisfied and provide a comment of up to 2,000 characters.' });
  }

  try {
    const complaint = await maintenanceDbService.getComplaintById(req.params.id);
    if (!complaint || !isComplaintOwner(complaint, identity)) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    if (!['completed', 'resolved'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'Feedback is available after a complaint is resolved.' });
    }

    const feedback = await maintenanceDbService.submitFeedback(complaint.id, {
      rating: requestedRating || (isSatisfied ? 5 : 1),
      comment: comment || null,
      is_satisfied: isSatisfied,
    });
    return res.json({
      success: true,
      message: isSatisfied
        ? 'Feedback submitted.'
        : 'Complaint reopened as pending for follow-up.',
      data: feedback,
    });
  } catch (error) {
    return errorResponse(res, error, 'Could not submit complaint feedback.');
  }
};
