/**
 * One-time script to sanitize and normalize already-uploaded complaint image URLs in MongoDB.
 *
 * It converts:
 * - "http://localhost:5000/api/files/..." -> "/api/files/..."
 * - "http://127.0.0.1:5000/api/files/..." -> "/api/files/..."
 * - "http://192.168.x.x:5000/api/files/..." -> "/api/files/..."
 * - "http://hrmsu1.sleipl.com/api/files/..." -> "https://hrmsu1.sleipl.com/api/files/..."
 * - "http://hrmsu2.sleipl.com/api/files/..." -> "https://hrmsu2.sleipl.com/api/files/..."
 *
 * Usage:
 *   node scripts/fix_already_uploaded_complaint_urls.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB:', uri.replace(/\/\/.*@/, '//<credentials>@'));

  const Complaint = mongoose.models.Complaint || mongoose.model(
    'Complaint',
    new mongoose.Schema({ imageUrl: String }, { strict: false }),
    'complaints'
  );

  const complaints = await Complaint.find({ imageUrl: { $ne: null, $exists: true } });
  console.log(`Found ${complaints.length} complaints with an imageUrl.`);

  let updatedCount = 0;

  for (const c of complaints) {
    if (!c.imageUrl || typeof c.imageUrl !== 'string') continue;
    const original = c.imageUrl.trim();
    let sanitized = original;

    // 1. Upgrade plain http to https for production domains
    if (sanitized.startsWith('http://hrmsu1.sleipl.com')) {
      sanitized = sanitized.replace('http://hrmsu1.sleipl.com', 'https://hrmsu1.sleipl.com');
    } else if (sanitized.startsWith('http://hrmsu2.sleipl.com')) {
      sanitized = sanitized.replace('http://hrmsu2.sleipl.com', 'https://hrmsu2.sleipl.com');
    }

    // 2. If it points to localhost or private LAN IP, convert to relative /api/files/...
    const filesIdx = sanitized.indexOf('/api/files/');
    if (filesIdx !== -1 && (sanitized.includes('localhost') || sanitized.includes('127.0.0.1') || sanitized.includes('192.168.'))) {
      sanitized = sanitized.slice(filesIdx);
    }

    if (sanitized !== original) {
      c.imageUrl = sanitized;
      await c.save();
      console.log(`Updated complaint [${c._id}]:\n  Before: ${original}\n  After:  ${sanitized}\n`);
      updatedCount++;
    }
  }

  console.log(`Finished. Total complaints updated: ${updatedCount}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
