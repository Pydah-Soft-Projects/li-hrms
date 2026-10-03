require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('../../employees/model/Employee');

let transportConn = null;

const resolveTransportMongoUri = () => {
  return (
    process.env.TRANSPORT_MONGODB_URI ||
    process.env.TRANSPORT_MONGO_URI ||
    ''
  );
};

const getTransportConnection = async () => {
  if (transportConn && transportConn.readyState === 1) return transportConn;

  const uri = resolveTransportMongoUri();
  if (!uri) {
    console.warn('⚠️ TRANSPORT_MONGODB_URI is not defined in backend .env');
    return null;
  }

  try {
    if (!transportConn || transportConn.readyState === 0) {
      transportConn = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 5000,
      });
    }

    await transportConn.asPromise();
    console.log('✅ Connected to Transport Database');
    return transportConn;
  } catch (err) {
    console.error('❌ Transport Database Connection Error:', err.message);
    transportConn = null;
    return null;
  }
};

// Mongoose Schema for EmployeeTransportRequests
const employeeTransportRequestSchema = new mongoose.Schema(
  {
    emp_no: { type: String, required: true, index: true },
    employee_name: { type: String, required: true },
    route_id: { type: String },
    route_name: { type: String },
    stage_name: { type: String },
    bus_id: { type: String },
    fare: { type: Number, default: 0 },
    status: { type: String, default: 'pending', index: true },
    cancellation_reason: { type: String, default: null },
    cancelled_at: { type: Date, default: null },
    raised_by: { type: String },
    raised_by_id: { type: String },
    academic_year: { type: String, index: true },
    application_number: { type: String },
    application_serial: { type: Number },
    application_college_code: { type: String },
    application_course_code: { type: String },
    request_date: { type: Date },
    new_id_card_needed: { type: Boolean, default: false },
    not_interested: { type: Boolean, default: false },
    expiry_reason: { type: String, default: null },
    not_interested_reason: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

const getEmployeeTransportRequestsModel = async () => {
  const conn = await getTransportConnection();
  if (!conn) return null;
  if (conn.models.EmployeeTransportRequests) {
    return conn.models.EmployeeTransportRequests;
  }
  return conn.model(
    'EmployeeTransportRequests',
    employeeTransportRequestSchema,
    'employeetransportrequests'
  );
};

/**
 * Fetch Employee Transport Requests with filtering, pagination, and HRMS Employee enrichment.
 */
const getTransportRequests = async (params = {}) => {
  const Model = await getEmployeeTransportRequestsModel();

  if (!Model) {
    return {
      requests: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      summary: {
        totalRequests: 0,
        approvedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        expiredCount: 0,
        totalFare: 0,
      },
      availableAcademicYears: [],
      dbConnected: false,
      message: 'Transport Database (TRANSPORT_MONGODB_URI) is not configured in backend .env',
    };
  }

  const {
    search = '',
    status = '',
    academicYear = '',
    page = 1,
    limit = 50,
    sortBy = 'created_at',
    sortOrder = 'desc',
  } = params;

  const query = {};

  if (status && status !== 'all') {
    query.status = status.toLowerCase();
  }

  if (academicYear && academicYear !== 'all') {
    query.academic_year = academicYear;
  }

  if (search && search.trim() !== '') {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { emp_no: searchRegex },
      { employee_name: searchRegex },
      { route_id: searchRegex },
      { route_name: searchRegex },
      { stage_name: searchRegex },
      { bus_id: searchRegex },
      { application_number: searchRegex },
      { raised_by: searchRegex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const sortOption = {};
  sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

  // Execute queries in parallel
  const [requests, totalCount, summaryStats, availableAcademicYears] = await Promise.all([
    Model.find(query).sort(sortOption).skip(skip).limit(limitNum).lean(),
    Model.countDocuments(query),
    Model.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalFare: { $sum: '$fare' },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
          },
          cancelledCount: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          expiredCount: {
            $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] },
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
        },
      },
    ]),
    Model.distinct('academic_year'),
  ]);

  // Enrich requests with HRMS employee metadata (department, designation, college, photo, etc.)
  const empNos = [...new Set(requests.map((r) => r.emp_no).filter(Boolean))];
  let hrmsEmployeesMap = {};
  if (empNos.length > 0 && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const hrmsEmployees = await Employee.find({
        employeeNumber: { $in: empNos },
      })
        .select('employeeNumber firstName lastName department designation college email mobileNumber photo status')
        .populate('department', 'name')
        .populate('designation', 'title')
        .populate('college', 'name code')
        .lean();

      hrmsEmployees.forEach((emp) => {
        hrmsEmployeesMap[emp.employeeNumber] = emp;
      });
    } catch (err) {
      console.error('Error populating HRMS employee details for transport requests:', err.message);
    }
  }

  const enrichedRequests = requests.map((req) => {
    const hrmsEmp = hrmsEmployeesMap[req.emp_no] || null;
    return {
      ...req,
      employeeDetails: hrmsEmp
        ? {
            id: hrmsEmp._id,
            fullName: `${hrmsEmp.firstName || ''} ${hrmsEmp.lastName || ''}`.trim() || req.employee_name,
            department: hrmsEmp.department?.name || 'N/A',
            designation: hrmsEmp.designation?.title || 'N/A',
            college: hrmsEmp.college?.name || hrmsEmp.college?.code || 'N/A',
            email: hrmsEmp.email || '',
            mobileNumber: hrmsEmp.mobileNumber || '',
            photo: hrmsEmp.photo || null,
            status: hrmsEmp.status || 'Active',
          }
        : null,
    };
  });

  const stats = summaryStats[0] || {
    totalFare: 0,
    approvedCount: 0,
    cancelledCount: 0,
    expiredCount: 0,
    pendingCount: 0,
  };

  return {
    requests: enrichedRequests,
    pagination: {
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    },
    summary: {
      totalRequests: totalCount,
      approvedCount: stats.approvedCount,
      cancelledCount: stats.cancelledCount,
      expiredCount: stats.expiredCount,
      pendingCount: stats.pendingCount,
      totalFare: stats.totalFare,
    },
    availableAcademicYears: availableAcademicYears.filter(Boolean).sort().reverse(),
  };
};

const AttendanceDaily = require('../../attendance/model/AttendanceDaily');

// Mongoose Schema for GpsDailyReports
const gpsDailyReportSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, index: true },
    busNumber: { type: String, required: true, index: true },
    routeId: { type: String, index: true },
    routeName: { type: String },
    firstInTime: { type: String },
    lastOutTime: { type: String },
    totalKms: { type: Number, default: 0 },
    isLateArrival: { type: Boolean, default: false },
    syncStatus: { type: String },
    tggVehicleName: { type: String },
    campus: { type: Number },
  },
  { timestamps: true }
);

const getGpsDailyReportsModel = async () => {
  const conn = await getTransportConnection();
  if (!conn) return null;
  if (conn.models.GpsDailyReports) {
    return conn.models.GpsDailyReports;
  }
  return conn.model('GpsDailyReports', gpsDailyReportSchema, 'gpsdailyreports');
};

/**
 * Fetch Bus-wise daily activity reports with assigned employee list and daily attendance punch times.
 */
const getBusWiseDailyReports = async (params = {}) => {
  const GpsModel = await getGpsDailyReportsModel();
  const RequestModel = await getEmployeeTransportRequestsModel();

  if (!GpsModel || !RequestModel) {
    return {
      date: params.date || new Date().toISOString().split('T')[0],
      busReports: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      summary: { totalBuses: 0, onTimeBuses: 0, lateBuses: 0, totalPassengers: 0 },
      availableDates: [],
      dbConnected: false,
      message: 'Transport Database (TRANSPORT_MONGODB_URI) is not configured in backend .env',
    };
  }

  // Get today's date string in IST format ("YYYY-MM-DD")
  const getTodayDateIST = () => {
    const d = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffset);
    return istDate.toISOString().split('T')[0];
  };

  const todayStr = getTodayDateIST();

  const availableDates = (await GpsModel.distinct('date')).filter(Boolean).sort().reverse();

  let targetDate = params.date || todayStr;
  if (!params.date && availableDates.length > 0 && !availableDates.includes(targetDate)) {
    targetDate = availableDates[0];
  }

  const query = { date: targetDate };

  if (params.search && params.search.trim() !== '') {
    const searchRegex = new RegExp(params.search.trim(), 'i');
    query.$or = [
      { busNumber: searchRegex },
      { routeId: searchRegex },
      { routeName: searchRegex },
      { tggVehicleName: searchRegex },
    ];
  }

  const pageNum = Math.max(1, parseInt(params.page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(params.limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [busReports, totalCount] = await Promise.all([
    GpsModel.find(query).sort({ routeId: 1, busNumber: 1 }).skip(skip).limit(limitNum).lean(),
    GpsModel.countDocuments(query),
  ]);

  // Enrich bus reports with assigned employees & their attendance punches
  const enrichedBusReports = await Promise.all(
    busReports.map(async (bus) => {
      const empReqs = await RequestModel.find({
        $or: [{ bus_id: bus.busNumber }, { route_id: bus.routeId }],
        status: 'approved',
      }).lean();

      const empNos = [...new Set(empReqs.map((r) => r.emp_no).filter(Boolean))];

      let hrmsEmployeesMap = {};
      let attendanceMap = {};

      if (empNos.length > 0 && mongoose.connection && mongoose.connection.readyState === 1) {
        try {
          const [hrmsEmps, attendanceDailyDocs] = await Promise.all([
            Employee.find({ employeeNumber: { $in: empNos } })
              .select('employeeNumber firstName lastName department designation photo mobileNumber')
              .populate('department', 'name')
              .populate('designation', 'title')
              .lean(),
            AttendanceDaily.find({
              employeeNumber: { $in: empNos },
              date: targetDate,
            }).lean(),
          ]);

          hrmsEmps.forEach((emp) => {
            hrmsEmployeesMap[emp.employeeNumber] = emp;
          });

          attendanceDailyDocs.forEach((att) => {
            attendanceMap[att.employeeNumber] = att;
          });
        } catch (err) {
          console.error('Error populating employee attendance for bus wise report:', err.message);
        }
      }

      const employees = empReqs.map((req) => {
        const hrmsEmp = hrmsEmployeesMap[req.emp_no] || null;
        const att = attendanceMap[req.emp_no] || null;

        let formattedInTime = 'No Punch';
        let formattedOutTime = 'No Punch';
        let attendanceStatus = att?.status || 'ABSENT';

        if (att && att.shifts && att.shifts.length > 0) {
          const firstShift = att.shifts[0];
          if (firstShift.inTime) {
            formattedInTime = new Date(firstShift.inTime).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }
          const lastShift = att.shifts[att.shifts.length - 1];
          if (lastShift.outTime) {
            formattedOutTime = new Date(lastShift.outTime).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          } else if (firstShift.inTime) {
            formattedOutTime = 'In Progress';
          }
        }

        return {
          emp_no: req.emp_no,
          employee_name: hrmsEmp
            ? `${hrmsEmp.firstName || ''} ${hrmsEmp.lastName || ''}`.trim()
            : req.employee_name,
          department: hrmsEmp?.department?.name || 'N/A',
          designation: hrmsEmp?.designation?.title || 'N/A',
          stage_name: req.stage_name || 'N/A',
          photo: hrmsEmp?.photo || null,
          mobileNumber: hrmsEmp?.mobileNumber || '',
          inTime: formattedInTime,
          outTime: formattedOutTime,
          attendanceStatus,
        };
      });

      const isLate = (bus.firstInTime && bus.firstInTime !== '—' && bus.firstInTime > '09:00') || !!bus.isLateArrival;

      return {
        _id: bus._id,
        busNumber: bus.busNumber,
        routeId: bus.routeId || 'N/A',
        routeName: bus.routeName || 'N/A',
        firstInTime: bus.firstInTime || '—',
        lastOutTime: bus.lastOutTime || '—',
        totalKms: bus.totalKms || 0,
        isLateArrival: isLate,
        syncStatus: bus.syncStatus || 'N/A',
        passengerCount: employees.length,
        employees,
      };
    })
  );

  let finalBusReports = enrichedBusReports;
  if (params.onlyLate === 'true' || params.onlyLate === true || params.lateOnly === 'true') {
    finalBusReports = enrichedBusReports.filter((b) => b.isLateArrival);
  }

  return {
    date: targetDate,
    busReports: finalBusReports,
    pagination: {
      total: finalBusReports.length,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(finalBusReports.length / limitNum),
    },
    summary: {
      totalBuses: totalCount,
      onTimeBuses: enrichedBusReports.filter((b) => !b.isLateArrival).length,
      lateBuses: enrichedBusReports.filter((b) => b.isLateArrival).length,
      totalPassengers: enrichedBusReports.reduce((acc, b) => acc + b.passengerCount, 0),
    },
    availableDates,
  };
};

module.exports = {
  getTransportConnection,
  getEmployeeTransportRequestsModel,
  getGpsDailyReportsModel,
  getTransportRequests,
  getBusWiseDailyReports,
};

