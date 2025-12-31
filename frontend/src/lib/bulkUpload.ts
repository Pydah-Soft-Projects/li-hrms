import * as XLSX from 'xlsx';

// ============== Types ==============

export interface ParsedRow {
  [key: string]: string | number | boolean | null | string[];
}

export interface BulkUploadResult {
  success: boolean;
  data: ParsedRow[];
  errors: string[];
  headers: string[];
}

// ============== Employee Template ==============

export const EMPLOYEE_TEMPLATE_HEADERS = [
  'emp_no',
  'employee_name',
  'division_name',
  'department_name',
  'designation_name',
  'doj',
  'dob',
  'proposedSalary',
  'gender',
  'marital_status',
  'blood_group',
  'qualifications',
  'experience',
  'address',
  'location',
  'aadhar_number',
  'phone_number',
  'alt_phone_number',
  'email',
  'pf_number',
  'esi_number',
  'bank_account_no',
  'bank_name',
  'bank_place',
  'ifsc_code',
];

export const EMPLOYEE_TEMPLATE_SAMPLE = [
  {
    emp_no: 'EMP001',
    employee_name: 'John Doe',
    division_name: 'Main Division',
    department_name: 'Information Technology',
    designation_name: 'Software Developer',
    doj: '2024-01-15',
    dob: '1990-05-20',
    proposedSalary: 50000,
    gender: 'Male',
    marital_status: 'Single',
    blood_group: 'O+',
    qualifications: 'B.Tech',
    experience: 5,
    address: '123 Main Street, City',
    location: 'Hyderabad',
    aadhar_number: '123456789012',
    phone_number: '9876543210',
    alt_phone_number: '9876543211',
    email: 'john.doe@example.com',
    pf_number: 'PF001234',
    esi_number: 'ESI001234',
    bank_account_no: '1234567890123',
    bank_name: 'State Bank',
    bank_place: 'Hyderabad',
    ifsc_code: 'SBIN0001234',
  },
];

// ============== Department Template ==============

export const DEPARTMENT_TEMPLATE_HEADERS = [
  'name',
  'code',
  'description',
];

export const DEPARTMENT_TEMPLATE_SAMPLE = [
  {
    name: 'Information Technology',
    code: 'IT',
    description: 'IT Department handles all technology-related operations',
  },
  {
    name: 'Human Resources',
    code: 'HR',
    description: 'HR Department manages employee relations',
  },
];

// ============== Designation Template ==============
// Designations are now independent entities (not tied to specific departments)
// They will be automatically linked to departments when employees are assigned

export const DESIGNATION_TEMPLATE_HEADERS = [
  'name',
  'code',
  'description',
  'paid_leaves',
];

export const DESIGNATION_TEMPLATE_SAMPLE = [
  {
    name: 'Software Developer',
    code: 'SD',
    description: 'Develops and maintains software applications',
    paid_leaves: 12,
  },
  {
    name: 'HR Manager',
    code: 'HRM',
    description: 'Manages HR operations',
    paid_leaves: 15,
  },
  {
    name: 'Manager',
    code: 'MGR',
    description: 'Manages team operations and strategy',
    paid_leaves: 18,
  },
];

// ============== Parsing Functions ==============

/**
 * Parse Excel/CSV file and return data
 */
export const parseFile = (file: File): Promise<BulkUploadResult> => {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, {
          raw: false,
          defval: '',
        });

        if (jsonData.length === 0) {
          resolve({
            success: false,
            data: [],
            errors: ['File is empty or has no data rows'],
            headers: [],
          });
          return;
        }

        // Get headers from first row
        const headers = Object.keys(jsonData[0]);

        // Clean and normalize data
        const cleanedData = jsonData.map((row, index) => {
          const cleanedRow: ParsedRow = { _rowIndex: index + 2 }; // +2 for header row and 0-index
          for (const key of headers) {
            let value: string | number | boolean | null = row[key] as string | number | boolean | null;
            // Trim strings
            if (typeof value === 'string') {
              value = value.trim();
            }

            // More robust date helper
            const isDateField = key.toLowerCase().includes('dob') || key.toLowerCase().includes('doj');

            // Handle dates (xlsx may return Date objects)
            if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Date]') {
              value = (value as unknown as Date).toISOString().split('T')[0];
            } else if (isDateField && typeof value === 'string' && value) {
              // Try to parse string dates if Excel didn't treat them as dates
              try {
                // Handle DD/MM/YYYY or DD-MM-YYYY
                if (value.includes('/') || (value.includes('-') && value.split('-')[0].length < 4)) {
                  const parts = value.split(/[/-]/);
                  if (parts.length === 3) {
                    // Assume DD/MM/YYYY
                    const d = parseInt(parts[0]);
                    const m = parseInt(parts[1]) - 1;
                    const y = parseInt(parts[2]);
                    const date = new Date(y, m, d);
                    if (!isNaN(date.getTime())) {
                      value = date.toISOString().split('T')[0];
                    }
                  }
                } else {
                  // Fallback to standard Date parsing
                  const date = new Date(value);
                  if (!isNaN(date.getTime())) {
                    value = date.toISOString().split('T')[0];
                  }
                }
              } catch (e) {
                console.warn(`Failed to parse date for ${key}: ${value}`);
              }
            }

            cleanedRow[key] = value === '' ? null : value;
          }
          return cleanedRow;
        });

        resolve({
          success: true,
          data: cleanedData,
          errors: [],
          headers,
        });
      } catch (error) {
        resolve({
          success: false,
          data: [],
          errors: [`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`],
          headers: [],
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        data: [],
        errors: ['Failed to read file'],
        headers: [],
      });
    };

    reader.readAsBinaryString(file);
  });
};

/**
 * Download template as Excel file
 */
export const downloadTemplate = (
  headers: string[],
  sampleData: ParsedRow[],
  filename: string
) => {
  // Create worksheet with headers and sample data
  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });

  // Set column widths
  const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }));
  worksheet['!cols'] = colWidths;

  // Create workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

  // Download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

/**
 * Match division name to division ID
 */
export const matchDivisionByName = (
  name: string | null,
  divisions: { _id: string; name: string }[]
): string | null => {
  if (!name) return null;
  const normalizedName = name.toString().toLowerCase().trim();
  const match = divisions.find(
    (d) => d.name.toLowerCase().trim() === normalizedName
  );
  return match?._id || null;
};

/**
 * Match department name to department ID
 */
export const matchDepartmentByName = (
  name: string | null,
  departments: { _id: string; name: string }[]
): string | null => {
  if (!name) return null;
  const normalizedName = name.toString().toLowerCase().trim();
  const match = departments.find(
    (d) => d.name.toLowerCase().trim() === normalizedName
  );
  return match?._id || null;
};

/**
 * Match designation name to designation ID within a department
 */
export const matchDesignationByName = (
  name: string | null,
  departmentId: string | null,
  designations: { _id: string; name: string; department: string }[]
): string | null => {
  if (!name) return null;
  const normalizedName = name.toString().toLowerCase().trim();
  const match = designations.find(
    (d) =>
      d.name.toLowerCase().trim() === normalizedName &&
      (!departmentId || d.department === departmentId)
  );
  return match?._id || null;
};

/**
 * Match user name to user ID
 */
export const matchUserByName = (
  name: string | null,
  users: { _id: string; name: string; email?: string }[]
): string | null => {
  if (!name) return null;
  const normalizedName = name.toString().toLowerCase().trim();
  const match = users.find(
    (u) => u.name.toLowerCase().trim() === normalizedName
  );
  return match?._id || null;
};

/**
 * Validate employee row
 */
export const validateEmployeeRow = (
  row: ParsedRow,
  divisions: { _id: string; name: string }[] = [],
  departments: { _id: string; name: string }[],
  designations: { _id: string; name: string; department: string }[],
  users: { _id: string; name: string; email?: string }[] = []
): { isValid: boolean; errors: string[]; mappedRow: ParsedRow } => {
  const errors: string[] = [];
  const mappedRow: ParsedRow = { ...row };

  // Required fields
  if (!row.emp_no) errors.push('Employee No is required');
  if (!row.employee_name) errors.push('Employee Name is required');

  // Map division
  if (row.division_name) {
    const divId = matchDivisionByName(row.division_name as string, divisions);
    if (!divId) {
      errors.push(`Division "${row.division_name}" not found`);
    }
    mappedRow.division_id = divId;
  } else {
    errors.push('Division is required');
  }

  // Map department
  if (row.department_name) {
    const deptId = matchDepartmentByName(row.department_name as string, departments);
    if (!deptId) {
      errors.push(`Department "${row.department_name}" not found`);
    }
    mappedRow.department_id = deptId;
  }

  // Map designation
  if (row.designation_name) {
    const desigId = matchDesignationByName(
      row.designation_name as string,
      mappedRow.department_id as string,
      designations
    );
    if (!desigId) {
      errors.push(`Designation "${row.designation_name}" not found`);
    }
    mappedRow.designation_id = desigId;
  }

  // Map reporting_to (if provided by name)
  if (row.reporting_to && typeof row.reporting_to === 'string' && users.length > 0) {
    // If it's a comma separated list of names
    const names = row.reporting_to.split(',').map(n => n.trim());
    const ids: string[] = [];
    names.forEach(name => {
      const id = matchUserByName(name, users);
      if (id) {
        ids.push(id);
      } else if (name.length > 24 && /^[0-9a-fA-F]{24}$/.test(name)) {
        // Assume it's already an ID
        ids.push(name);
      } else {
        errors.push(`Reporting manager "${name}" not found`);
      }
    });
    mappedRow.reporting_to = ids.length > 0 ? ids : null;
  } else if (row.reporting_to && Array.isArray(row.reporting_to)) {
    // Already an array of IDs
    mappedRow.reporting_to = row.reporting_to;
  }

  // Validate gender
  if (row.gender && !['Male', 'Female', 'Other'].includes(row.gender as string)) {
    errors.push('Gender must be Male, Female, or Other');
  }

  // Validate dates
  if (row.dob && isNaN(new Date(row.dob as string).getTime())) {
    errors.push('Invalid Date of Birth format');
  }
  if (row.doj && isNaN(new Date(row.doj as string).getTime())) {
    errors.push('Invalid Date of Joining format');
  }

  // Validate marital status
  if (row.marital_status && !['Single', 'Married', 'Divorced', 'Widowed'].includes(row.marital_status as string)) {
    errors.push('Invalid marital status');
  }

  // Validate blood group
  if (row.blood_group && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(row.blood_group as string)) {
    errors.push('Invalid blood group');
  }

  return {
    isValid: errors.length === 0,
    errors,
    mappedRow,
  };
};

/**
 * Validate department row
 */
export const validateDepartmentRow = (
  row: ParsedRow
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!row.name) errors.push('Department Name is required');

  return { isValid: errors.length === 0, errors };
};

/**
 * Validate designation row
 * Designations are now independent - department is optional
 */
export const validateDesignationRow = (
  row: ParsedRow,
  departments: { _id: string; name: string }[]
): { isValid: boolean; errors: string[]; mappedRow: ParsedRow } => {
  const errors: string[] = [];
  const mappedRow: ParsedRow = { ...row };

  if (!row.name) errors.push('Designation Name is required');

  // Map department if provided (optional for independent designations)
  if (row.department_name) {
    const deptId = matchDepartmentByName(row.department_name as string, departments);
    if (!deptId) {
      errors.push(`Department "${row.department_name}" not found`);
    }
    mappedRow.department_id = deptId;
  }
  // Department is now optional - designations can be created independently

  return { isValid: errors.length === 0, errors, mappedRow };
};


