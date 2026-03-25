const mongoose = require('mongoose');
require('dotenv').config();

const monthlyPoolCarryForwardService = require('../leaves/services/monthlyPoolCarryForwardService');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);

  const month = Number(process.argv[2]);
  const year = Number(process.argv[3]);
  if (!month || !year) {
    throw new Error('Usage: node show_monthly_pool_carry_errors.js <month> <year>');
  }

  const pool = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year);
  console.log('summary:', {
    processed: pool.processed,
    skipped: pool.skipped,
    carriesPosted: pool.carriesPosted,
    forfeitsPosted: pool.forfeitsPosted,
    carriedEmployees: pool.carriedEmployees,
    errors: pool.errors.length,
  });

  console.log('firstErrors:', pool.errors.slice(0, 5));

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

