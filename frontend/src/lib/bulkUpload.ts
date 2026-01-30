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
  'second_salary',
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
  'salary_mode',
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
    second_salary: 0,
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
    salary_mode: 'Bank',
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

// ============== Allowance / Deduction Template ==============

export const ALLOWANCE_DEDUCTION_TEMPLATE_HEADERS = [
  'name',
  'category',
  'description',
  'type',
  'amount',
  'percentage',
  'percentageBase',
  'minAmount',
  'maxAmount',
  'basedOnPresentDays',
  'isActive',
];

export const ALLOWANCE_DEDUCTION_TEMPLATE_SAMPLE = [
  {
    name: 'HRA',
    category: 'allowance',
    description: 'House Rent Allowance',
    type: 'percentage',
    amount: '',
    percentage: 40,
    percentageBase: 'basic',
    minAmount: '',
    maxAmount: '',
    basedOnPresentDays: false,
    isActive: true,
  },
  {
    name: 'PF',
    category: 'deduction',
    description: 'Provident Fund',
    type: 'percentage',
    amount: '',
    percentage: 12,
    percentageBase: 'basic',
    minAmount: '',
    maxAmount: '',
    basedOnPresentDays: false,
    isActive: true,
  },
  {
    name: 'Transport Allowance',
    category: 'allowance',
    description: 'Fixed transport allowance',
    type: 'fixed',
    amount: 1000,
    percentage: '',
    percentageBase: '',
    minAmount: '',
    maxAmount: '',
    basedOnPresentDays: false,
    isActive: true,
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

        // Convert to JSON with raw values to get Date objects directly when possible
        const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, {
          raw: true,
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

            // Trim strings if it is one
            if (typeof value === 'string') {
              value = value.trim();
            }

            // More robust date helper
            const isDateField = key.toLowerCase().includes('dob') || key.toLowerCase().includes('doj') ||
              key.toLowerCase().includes('date');

            if (isDateField && value !== undefined && value !== null && value !== '') {
              try {
                let parsedDate: Date | null = null;

                // 1. Handle native JS Date objects (returned by xlsx with cellDates:true)
                if (Object.prototype.toString.call(value) === '[object Date]') {
                  parsedDate = value as unknown as Date;
                }
                // 2. Handle Excel serial numbers (numbers)
                else if (typeof value === 'number') {
                  // Excel serial base is Dec 30 1899. 
                  // XLSX already handles most, but if it remains a number:
                  parsedDate = new Date(Math.round((value - 25569) * 86400 * 1000));
                }
                // 3. Handle string dates
                else if (typeof value === 'string') {
                  const cleanValue = value.trim().replace(/[./]/g, '-');
                  const parts = cleanValue.split('-');

                  if (parts.length === 3) {
                    let y, m, d;
                    // Detect YYYY-MM-DD
                    if (parts[0].length === 4) {
                      y = parseInt(parts[0]);
                      m = parseInt(parts[1]) - 1;
                      d = parseInt(parts[2]);
                    }
                    // Detect DD-MM-YYYY or MM-DD-YYYY
                    else if (parts[2].length === 4) {
                      y = parseInt(parts[2]);
                      const p1 = parseInt(parts[0]);
                      const p2 = parseInt(parts[1]);
                      // Guess DD-MM vs MM-DD
                      if (p1 > 12) { d = p1; m = p2 - 1; }
                      else if (p2 > 12) { d = p2; m = p1 - 1; }
                      else { d = p1; m = p2 - 1; } // Default to DD-MM (common)
                    }

                    if (y && m !== undefined && d) {
                      parsedDate = new Date(y, m, d);
                    }
                  } else {
                    // Fallback to native parsing
                    const d = new Date(cleanValue);
                    if (!isNaN(d.getTime())) parsedDate = d;
                  }
                }

                if (parsedDate && !isNaN(parsedDate.getTime())) {
                  // Always output YYYY-MM-DD
                  const year = parsedDate.getFullYear();
                  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                  const day = String(parsedDate.getDate()).padStart(2, '0');
                  value = `${year}-${month}-${day}`;
                }
              } catch (err) {
                console.warn(`Failed to parse date for ${key}: ${value}`, err);
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
  name: string | null | number,
  divisions: { _id: string; name: string }[]
): string | null => {
  if (name === null || name === undefined || name === '') return null;
  const input = String(name).toLowerCase().trim();
  const match = divisions.find(
    (d) => d.name.toLowerCase().trim() === input
  );
  return match?._id || null;
};

/**
 * Match department name to department ID
 */
export const matchDepartmentByName = (
  name: string | null | number,
  departments: { _id: string; name: string }[]
): string | null => {
  if (name === null || name === undefined || name === '') return null;
  const input = String(name).toLowerCase().trim();
  const match = departments.find(
    (d) => d.name.toLowerCase().trim() === input
  );
  return match?._id || null;
};

/**
 * Match designation name to designation ID within a department
 */
export const matchDesignationByName = (
  name: string | null | number,
  designations: { _id: string; name: string; code?: string }[]
): string | null => {
  if (name === null || name === undefined || name === '') return null;
  const input = String(name).toLowerCase().trim();
  const match = designations.find(
    (d) =>
      d.name?.toLowerCase().trim() === input ||
      (d.code && String(d.code).toLowerCase().trim() === input)
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
  designations: { _id: string; name: string; department: string; code?: string }[],
  users: { _id: string; name: string; email?: string }[] = []
): { isValid: boolean; errors: string[]; mappedRow: ParsedRow; fieldErrors: { [key: string]: string } } => {
  const errors: string[] = [];
  const fieldErrors: { [key: string]: string } = {};
  const mappedRow: ParsedRow = { ...row };

  // Required fields
  if (!row.emp_no) {
    errors.push('Employee No is required');
    fieldErrors.emp_no = 'Required';
  }
  if (!row.employee_name) {
    errors.push('Employee Name is required');
    fieldErrors.employee_name = 'Required';
  }

  // Map division
  let div = null;
  if (row.division_name) {
    div = divisions.find(d => d.name.toLowerCase().trim() === String(row.division_name).toLowerCase().trim());
  } else if (row.division_id) {
    div = divisions.find(d => d._id === String(row.division_id));
  }

  if (div) {
    mappedRow.division_id = div._id;
    mappedRow.division_name = div.name;
    // Clear error if previously set by name mismatch
  } else {
    if (row.division_name) {
      errors.push(`Division "${row.division_name}" not found`);
      fieldErrors.division_name = 'Not found';
    } else if (!row.division_id) {
      errors.push('Division is required');
      fieldErrors.division_name = 'Required';
    }
  }

  // Map department
  let dept = null;
  if (row.department_name) {
    dept = departments.find(d => d.name.toLowerCase().trim() === String(row.department_name).toLowerCase().trim());
  } else if (row.department_id) {
    dept = departments.find(d => d._id === String(row.department_id));
  }

  if (dept) {
    mappedRow.department_id = dept._id;
    mappedRow.department_name = dept.name;
  } else {
    // Department is not strictly required by some logic configs, but let's assume it is if provided
    if (row.department_name) {
      errors.push(`Department "${row.department_name}" not found`);
      fieldErrors.department_name = 'Not found';
    }
    // If not provided, we don't enforce required here unless it was required in template. 
    // Wait, original code strictly checked name presence if provided. 
    // If user provided nothing, original code did nothing. 
    // So we invoke name check only if provided.
  }

  // Map designation
  let desig = null;
  const desigInput = row.designation_name ? String(row.designation_name).toLowerCase().trim() : null;

  if (desigInput) {
    desig = designations.find(d =>
      d.name?.toLowerCase().trim() === desigInput ||
      (d.code && String(d.code).toLowerCase().trim() === desigInput)
    );
  } else if (row.designation_id) {
    desig = designations.find(d => d._id === String(row.designation_id));
  }

  if (desig) {
    mappedRow.designation_id = desig._id;
    mappedRow.designation_name = desig.name;
  } else {
    if (row.designation_name) {
      errors.push(`Designation "${row.designation_name}" not found`);
      fieldErrors.designation_name = 'Not found';
    }
  }

  // Map reporting_to (if provided by name)
  if (row.reporting_to && typeof row.reporting_to === 'string' && users.length > 0) {
    // If it's a comma separated list of names
    const names = row.reporting_to.split(',').map(n => n.trim());
    const ids: string[] = [];
    let hasError = false;
    names.forEach(name => {
      const id = matchUserByName(name, users);
      if (id) {
        ids.push(id);
      } else if (name.length > 24 && /^[0-9a-fA-F]{24}$/.test(name)) {
        // Assume it's already an ID
        ids.push(name);
      } else {
        errors.push(`Reporting manager "${name}" not found`);
        hasError = true;
      }
    });

    if (hasError) {
      fieldErrors.reporting_to = 'One or more managers not found';
    }
    mappedRow.reporting_to = ids.length > 0 ? ids : null;
  } else if (row.reporting_to && Array.isArray(row.reporting_to)) {
    // Already an array of IDs
    mappedRow.reporting_to = row.reporting_to;
  }

  // Validate gender
  if (row.gender && !['Male', 'Female', 'Other'].includes(row.gender as string)) {
    errors.push('Gender must be Male, Female, or Other');
    fieldErrors.gender = 'Invalid gender';
  }

  // Validate dates
  if (row.dob && isNaN(new Date(row.dob as string).getTime())) {
    errors.push('Invalid Date of Birth format');
    fieldErrors.dob = 'Invalid date';
  }
  if (row.doj && isNaN(new Date(row.doj as string).getTime())) {
    errors.push('Invalid Date of Joining format');
    fieldErrors.doj = 'Invalid date';
  }

  // Validate marital status
  if (row.marital_status && !['Single', 'Married', 'Divorced', 'Widowed'].includes(row.marital_status as string)) {
    errors.push('Invalid marital status');
    fieldErrors.marital_status = 'Invalid status';
  }

  // Validate blood group
  if (row.blood_group && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(row.blood_group as string)) {
    errors.push('Invalid blood group');
    fieldErrors.blood_group = 'Invalid group';
  }

  // Validate salary mode
  if (row.salary_mode && !['Bank', 'Cash'].includes(row.salary_mode as string)) {
    errors.push('Salary Mode must be Bank or Cash');
    fieldErrors.salary_mode = 'Invalid mode';
  }

  return {
    isValid: errors.length === 0,
    errors,
    mappedRow,
    fieldErrors,
  };
};


/**
 * Validate department row
 */
export const validateDepartmentRow = (
  row: ParsedRow
): { isValid: boolean; errors: string[]; fieldErrors: { [key: string]: string } } => {
  const errors: string[] = [];
  const fieldErrors: { [key: string]: string } = {};

  if (!row.name) {
    errors.push('Department Name is required');
    fieldErrors.name = 'Required';
  }

  return { isValid: errors.length === 0, errors, fieldErrors };
};

/**
 * Validate designation row
 * Designations are now independent - department is optional
 */
export const validateDesignationRow = (
  row: ParsedRow
): { isValid: boolean; errors: string[]; mappedRow: ParsedRow; fieldErrors: { [key: string]: string } } => {
  const errors: string[] = [];
  const fieldErrors: { [key: string]: string } = {};
  const mappedRow: ParsedRow = { ...row };

  if (!row.name) {
    errors.push('Designation Name is required');
    fieldErrors.name = 'Required';
  }

  return { isValid: errors.length === 0, errors, mappedRow, fieldErrors };
};


