const mongoose = require('mongoose');
require('dotenv').config();

// Ensure populate() models are registered (standalone scripts don't load all server models).
require('../departments/model/Department');
require('../departments/model/Division');
require('../departments/model/Designation');

const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const month = Number(process.argv[2]);
  const year = Number(process.argv[3]);
  if (!month || !year) throw new Error('Usage: node run_monthly_pool_carry_fixed.js <month> <year>');

  console.log(`[PoolCarryFixed] Running pool carry-forward / forfeit for ${month}/${year}...`);
  const pool = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year);

  console.log('[PoolCarryFixed] summary:', {
    processed: pool.processed,
    skipped: pool.skipped,
    carriesPosted: pool.carriesPosted,
    forfeitsPosted: pool.forfeitsPosted,
    carriedEmployees: pool.carriedEmployees,
    errors: pool.errors.length,
  });

  if (pool.errors?.length) {
    console.log('[PoolCarryFixed] firstErrors:', pool.errors.slice(0, 5));
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('[PoolCarryFixed] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

