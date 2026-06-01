/**
 * Restore CL leave applications wrongly cancelled by reset_cl_register_keep_only_scheduled.js.
 * Status is inferred from workflow.isCompleted + approvalChain (not from register data).
 *
 * Usage:
 *   node scripts/restore_cl_leaves_cancelled_by_register_reset.js          # dry run
 *   node scripts/restore_cl_leaves_cancelled_by_register_reset.js --apply
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Leave = require('../leaves/model/Leave');

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const ROLE_TO_STATUS = {
  reporting_manager: 'reporting_manager_approved',
  hod: 'hod_approved',
  manager: 'manager_approved',
  hr: 'hr_approved',
  principal: 'principal_approved',
};

function inferRestoredStatus(leave) {
  if (leave.workflow?.isCompleted) return 'approved';

  const chain = leave.workflow?.approvalChain || [];
  let lastApprovedRole = null;
  for (const step of chain) {
    if (String(step?.status || '').toLowerCase() === 'approved') {
      lastApprovedRole = step.role;
    }
  }
  if (lastApprovedRole && ROLE_TO_STATUS[lastApprovedRole]) {
    return ROLE_TO_STATUS[lastApprovedRole];
  }
  return 'pending';
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  await mongoose.connect(process.env.MONGODB_URI);

  const apply = hasFlag('apply');
  const filter = {
    leaveType: /^CL$/i,
    status: 'cancelled',
    'cancellation.reason': 'CL register reset — keep scheduled CL only',
  };

  const leaves = await Leave.find(filter).lean();
  const summary = {
    dryRun: !apply,
    matched: leaves.length,
    byRestoredStatus: {},
    restored: 0,
  };

  for (const leave of leaves) {
    const restoredStatus = inferRestoredStatus(leave);
    summary.byRestoredStatus[restoredStatus] =
      (summary.byRestoredStatus[restoredStatus] || 0) + 1;

    if (apply) {
      await Leave.updateOne(
        { _id: leave._id },
        {
          $set: { status: restoredStatus },
          $unset: {
            cancellation: '',
          },
        }
      );
      summary.restored++;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error?.stack || error?.message || error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
