const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['super_admin', 'sub_admin', 'hr', 'hod', 'employee'],
      required: [true, 'Role is required'],
      default: 'employee',
    },
    // Scope of access for HR/Sub-admin
    scope: {
      type: String,
      enum: ['global', 'restricted'],
      default: 'global', // Defaults to global for backward compatibility, but UI should enforce selection
    },
    roles: [
      {
        type: String,
        enum: ['super_admin', 'sub_admin', 'hr', 'hod', 'employee'],
      },
    ], // Multi-role support
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },

    // Legacy field - kept for backward compatibility if any
    departments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
      },
    ],
    employeeId: {
      type: String,
      unique: true,
      sparse: true, // Allow null values but enforce uniqueness when present
    }, // Link to MSSQL employee data
    employeeRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    }, // Link to MongoDB employee
    activeWorkspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
    }, // Current active workspace
    preferences: {
      defaultWorkspace: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        default: null,
      },
      language: {
        type: String,
        default: 'en',
      },
      timezone: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return;
  }

  // Hash password with cost of 12
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);

