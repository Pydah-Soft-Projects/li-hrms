const { getTransportRequests, getBusWiseDailyReports } = require('../services/transportDbService');
const XLSX = require('xlsx');

/**
 * Controller to get Employee Transport Requests for Reports Page
 */
const getReports = async (req, res) => {
  try {
    const data = await getTransportRequests(req.query);
    return res.status(200).json({
      success: true,
      dbConnected: data.dbConnected !== false,
      message: data.message || null,
      data: data.requests || [],
      pagination: data.pagination,
      summary: data.summary,
      availableAcademicYears: data.availableAcademicYears,
    });
  } catch (error) {
    console.error('Error fetching transport reports:', error);
    return res.status(200).json({
      success: true,
      dbConnected: false,
      message: 'Failed to fetch transport requests: ' + error.message,
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      summary: { totalRequests: 0, approvedCount: 0, pendingCount: 0, cancelledCount: 0, expiredCount: 0, totalFare: 0 },
      availableAcademicYears: [],
    });
  }
};

/**
 * Controller to export Employee Transport Requests to Excel/CSV
 */
const exportReports = async (req, res) => {
  try {
    // Fetch all records matching filter without pagination limit
    const data = await getTransportRequests({
      ...req.query,
      page: 1,
      limit: 10000,
    });

    if (data.dbConnected === false) {
      return res.status(400).json({
        success: false,
        message: data.message || 'Transport database is not configured.',
      });
    }

    const rows = (data.requests || []).map((item, index) => ({
      'S.No': index + 1,
      'Employee No': item.emp_no || '',
      'Employee Name': item.employeeDetails?.fullName || item.employee_name || '',
      'College': item.employeeDetails?.college || item.application_college_code || '',
      'Department': item.employeeDetails?.department || '',
      'Designation': item.employeeDetails?.designation || '',
      'Mobile Number': item.employeeDetails?.mobileNumber || '',
      'Application No': item.application_number || '',
      'Route ID': item.route_id || '',
      'Route Name': item.route_name || '',
      'Stage Name': item.stage_name || '',
      'Bus ID': item.bus_id || '',
      'Fare (₹)': item.fare || 0,
      'Status': (item.status || '').toUpperCase(),
      'Academic Year': item.academic_year || '',
      'Request Date': item.request_date ? new Date(item.request_date).toLocaleDateString('en-IN') : '',
      'Raised By': item.raised_by || '',
      'New ID Card Needed': item.new_id_card_needed ? 'Yes' : 'No',
      'Cancellation Reason': item.cancellation_reason || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transport Requests');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Employee_Transport_Requests_${new Date().toISOString().split('T')[0]}.xlsx`
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Error exporting transport reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export transport reports',
      error: error.message,
    });
  }
};

/**
 * Controller to get Bus Wise Daily Activity Reports
 */
const getBusWiseReports = async (req, res) => {
  try {
    const data = await getBusWiseDailyReports(req.query);
    return res.status(200).json({
      success: true,
      dbConnected: data.dbConnected !== false,
      message: data.message || null,
      date: data.date,
      data: data.busReports || [],
      pagination: data.pagination,
      summary: data.summary,
      availableDates: data.availableDates,
    });
  } catch (error) {
    console.error('Error fetching bus wise daily reports:', error);
    return res.status(200).json({
      success: true,
      dbConnected: false,
      message: 'Failed to fetch bus wise daily reports: ' + error.message,
      date: req.query.date || new Date().toISOString().split('T')[0],
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      summary: { totalBuses: 0, onTimeBuses: 0, lateBuses: 0, totalPassengers: 0 },
      availableDates: [],
    });
  }
};

module.exports = {
  getReports,
  exportReports,
  getBusWiseReports,
};

