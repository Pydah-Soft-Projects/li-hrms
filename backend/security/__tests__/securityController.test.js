const path = require('path');

// Absolute paths for mocking
const permissionPath = path.resolve(__dirname, '../../permissions/model/Permission');

// Mock Permission model
jest.doMock(permissionPath, () => {
    const mock = {
        find: jest.fn().mockReturnThis(),
        findById: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
    };
    // For direct findById that returns a promise vs findById that is chained
    // We'll manage this in each test by overriding the mock behavior
    return mock;
});

const securityController = require('../controllers/securityController');
const Permission = require(permissionPath);
const crypto = require('crypto');

describe('Security Controller Unit Tests', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        mockReq = {
            params: {},
            body: {},
            user: { _id: 'user123', role: 'employee', employeeId: 'emp123' }
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    describe('getTodayPermissions', () => {
        test('should fetch today\'s approved permissions', async () => {
            const mockPermissions = [
                { _id: 'p1', purpose: 'Personal' },
                { _id: 'p2', purpose: 'Work' }
            ];

            Permission.find.mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockResolvedValue(mockPermissions)
            });

            await securityController.getTodayPermissions(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                count: 2,
                data: mockPermissions
            }));
        });
    });

    describe('generateGateOutQR', () => {
        test('should generate secret for approved permission', async () => {
            const mockPermission = {
                _id: 'perm123',
                employeeId: 'emp123',
                requestedBy: 'user123',
                status: 'approved',
                save: jest.fn().mockResolvedValue(true)
            };
            Permission.findById.mockResolvedValue(mockPermission);

            mockReq.params.id = 'perm123';
            await securityController.generateGateOutQR(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                qrSecret: expect.stringMatching(/^OUT:perm123:/)
            }));
            expect(mockPermission.gateOutSecret).toBeDefined();
            expect(mockPermission.save).toHaveBeenCalled();
        });

        test('should fail if permission is not approved', async () => {
            const mockPermission = {
                _id: 'perm123',
                employeeId: 'emp123',
                requestedBy: 'user123',
                status: 'pending'
            };
            Permission.findById.mockResolvedValue(mockPermission);

            mockReq.params.id = 'perm123';
            await securityController.generateGateOutQR(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Permission is not approved'
            }));
        });
    });

    describe('generateGateInQR', () => {
        test('should fail if not gated out', async () => {
            const mockPermission = {
                _id: 'perm123',
                employeeId: 'emp123',
                requestedBy: 'user123',
                status: 'approved'
            };
            Permission.findById.mockResolvedValue(mockPermission);

            mockReq.params.id = 'perm123';
            await securityController.generateGateInQR(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Must Gate Out first'
            }));
        });

        test('should fail if 5-minute buffer not passed', async () => {
            const now = new Date();
            const mockPermission = {
                _id: 'perm123',
                employeeId: 'emp123',
                requestedBy: 'user123',
                status: 'approved',
                gateOutTime: new Date(now.getTime() - 2 * 60000) // 2 mins ago
            };
            Permission.findById.mockResolvedValue(mockPermission);

            mockReq.params.id = 'perm123';
            await securityController.generateGateInQR(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: expect.stringContaining('Please wait')
            }));
        });

        test('should generate secret if 5-minute buffer passed', async () => {
            const now = new Date();
            const mockPermission = {
                _id: 'perm123',
                employeeId: 'emp123',
                requestedBy: 'user123',
                status: 'approved',
                gateOutTime: new Date(now.getTime() - 6 * 60000), // 6 mins ago
                save: jest.fn().mockResolvedValue(true)
            };
            Permission.findById.mockResolvedValue(mockPermission);

            mockReq.params.id = 'perm123';
            await securityController.generateGateInQR(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                qrSecret: expect.stringMatching(/^IN:perm123:/)
            }));
        });
    });

    describe('verifyGatePass', () => {
        test('should verify Gate Out successfully', async () => {
            const secret = 'OUT:perm123:random';
            const mockPermission = {
                _id: 'perm123',
                gateOutSecret: secret,
                employeeId: { employee_name: 'Test', emp_no: '101' },
                save: jest.fn().mockResolvedValue(true)
            };

            // Chained mock for findById(...).populate(...)
            Permission.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockPermission)
            });

            mockReq.body.qrSecret = secret;
            await securityController.verifyGatePass(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockPermission.gateOutTime).toBeDefined();
            expect(mockPermission.save).toHaveBeenCalled();
        });

        test('should fail with invalid secret', async () => {
            const secret = 'OUT:perm123:random';
            const mockPermission = {
                _id: 'perm123',
                gateOutSecret: 'different_secret',
                employeeId: { employee_name: 'Test', emp_no: '101' }
            };

            Permission.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue(mockPermission)
            });

            mockReq.body.qrSecret = secret;
            await securityController.verifyGatePass(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                message: 'Invalid or Expired Gate Out QR'
            }));
        });
    });
});
