jest.mock('../../services/maintenanceDbService', () => ({
  getCategories: jest.fn(),
  getComplaints: jest.fn(),
  createComplaint: jest.fn(),
  getComplaintById: jest.fn(),
  addComment: jest.fn(),
  submitFeedback: jest.fn(),
}));
jest.mock('../../../settings/model/Settings', () => ({
  findOne: jest.fn(),
}));

const maintenanceDbService = require('../../services/maintenanceDbService');
const Settings = require('../../../settings/model/Settings');
const controller = require('../generalComplaintController');
const requireGeneralComplaintsEnabled = require('../../middleware/requireGeneralComplaintsEnabled');

const makeResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
};

describe('general complaint controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('limits complaint list requests to the authenticated requester identity', async () => {
    maintenanceDbService.getComplaints.mockResolvedValue({ complaints: [], pagination: {}, stats: {} });
    const req = {
      user: { _id: 'user-id', employeeId: 'E001', name: 'Test User' },
      query: {},
    };
    const res = makeResponse();

    await controller.getMyComplaints(req, res);

    expect(maintenanceDbService.getComplaints).toHaveBeenCalledWith(expect.objectContaining({
      only_my: true,
      requester_hrms_id: 'E001',
      requester_identifier: 'E001',
    }));
    expect(res.body.success).toBe(true);
  });

  test('rejects categories that are not in the active maintenance category list', async () => {
    maintenanceDbService.getCategories.mockResolvedValue({ categories: [], subCategoriesByParent: {} });
    const req = {
      user: { _id: 'user-id', employeeId: 'E001', name: 'Test User' },
      body: { category_id: 7, title: 'Broken light' },
    };
    const res = makeResponse();

    await controller.createComplaint(req, res);

    expect(res.statusCode).toBe(400);
    expect(maintenanceDbService.createComplaint).not.toHaveBeenCalled();
  });

  test('does not disclose another requester complaint details', async () => {
    maintenanceDbService.getComplaintById.mockResolvedValue({
      id: 11,
      requester_hrms_id: 'E999',
      requester_identifier: 'E999',
    });
    const req = {
      user: { _id: 'user-id', employeeId: 'E001' },
      params: { id: '11' },
    };
    const res = makeResponse();

    await controller.getComplaint(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('blocks the complaints API when the role setting disables the module', async () => {
    Settings.findOne.mockResolvedValue({ value: { activeModules: ['COMPLAINTS:write'] } });
    const req = { user: { role: 'employee', featureControl: [] } };
    const res = makeResponse();
    const next = jest.fn();

    await requireGeneralComplaintsEnabled(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows the complaints API when the role setting enables the module', async () => {
    Settings.findOne.mockResolvedValue({ value: { activeModules: ['GENERAL_COMPLAINTS:read'] } });
    const req = { user: { role: 'employee', featureControl: [] } };
    const res = makeResponse();
    const next = jest.fn();

    await requireGeneralComplaintsEnabled(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('blocks the complaints API system-wide, including for super admins', async () => {
    Settings.findOne.mockResolvedValue({ value: false });
    const req = { user: { role: 'super_admin', featureControl: [] } };
    const res = makeResponse();
    const next = jest.fn();

    await requireGeneralComplaintsEnabled(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('reopens a resolved complaint when the requester is not satisfied', async () => {
    maintenanceDbService.getComplaintById.mockResolvedValue({
      id: 12,
      requester_hrms_id: 'E001',
      requester_identifier: 'E001',
      status: 'completed',
    });
    maintenanceDbService.submitFeedback.mockResolvedValue({
      is_satisfied: false,
      status: 'pending',
    });
    const req = {
      user: { _id: 'user-id', employeeId: 'E001' },
      params: { id: '12' },
      body: { is_satisfied: false, comment: 'The issue is still happening.' },
    };
    const res = makeResponse();

    await controller.submitFeedback(req, res);

    expect(maintenanceDbService.submitFeedback).toHaveBeenCalledWith(12, expect.objectContaining({
      is_satisfied: false,
      rating: 1,
    }));
    expect(res.body.data.status).toBe('pending');
    expect(res.body.message).toMatch(/reopened as pending/i);
  });
});
