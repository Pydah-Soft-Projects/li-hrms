// Mock Permission - use path relative to backend root
jest.mock('../../permissions/model/Permission', () => ({
    find: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
}));

// Mock SecurityLog - verifyGatePass creates and saves log entries
jest.mock('../model/SecurityLog', () => {
    return jest.fn().mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(true),
    }));
});

const securityController = require('../controllers/securityController');
const Permission = require('../../permissions/model/Permission');
const mongoose = require('mongoose');
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
            const permId = new mongoose.Types.ObjectId();
            const secret = `OUT:${permId}:random`;
            const mockPermission = {
                _id: permId,
                gateOutSecret: secret,
                employeeId: { _id: new mongoose.Types.ObjectId(), employee_name: 'Test', emp_no: '101' },
                save: jest.fn().mockResolvedValue(true)
            };

            mockReq.user._id = new mongoose.Types.ObjectId();

            Permission.findById.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockPermission)
                })
            });

            mockReq.body.qrSecret = secret;
            await securityController.verifyGatePass(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockPermission.gateOutTime).toBeDefined();
            expect(mockPermission.status).toBe('checked_out');
            expect(mockPermission.save).toHaveBeenCalled();
        });

        test('should fail with invalid secret', async () => {
            const permId = new mongoose.Types.ObjectId();
            const secret = `OUT:${permId}:random`;
            const mockPermission = {
                _id: permId,
                gateOutSecret: 'different_secret',
                employeeId: { _id: new mongoose.Types.ObjectId(), employee_name: 'Test', emp_no: '101' }
            };

            Permission.findById.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockPermission)
                })
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
