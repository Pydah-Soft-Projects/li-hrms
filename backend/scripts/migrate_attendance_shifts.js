const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const migrateAttendanceDaily = async () => {
    try {
        console.log('Connecting to database...');
        // Replace with your actual connection string logic if needed
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to database.');

        const batchSize = 100;
        let processedCount = 0;
        let updatedCount = 0;

        // Iterate through all records that still have root fields
        // We check for existence of 'shiftId' or 'inTime' at root level
        const cursor = AttendanceDaily.find({
            $or: [
                { shiftId: { $exists: true } },
                { inTime: { $exists: true } }
            ]
        }).cursor();

        for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            processedCount++;
            let needsUpdate = false;

            // Check if data exists in root fields but not in shifts array
            // OR if we want to move root data to be the first shift
            const hasRootData = doc.shiftId || doc.inTime || doc.outTime;

            // Construct a potential shift object from root data
            const potentialShift = {
                shiftNumber: 1,
                inTime: doc.inTime,
                outTime: doc.outTime,
                shiftId: doc.shiftId,
                // Calculate duration if missing
                duration: doc.outTime && doc.inTime ? (new Date(doc.outTime) - new Date(doc.inTime)) / (1000 * 60) : null,
                workingHours: doc.totalHours, // Assuming totalHours maps to workingHours
                otHours: doc.otHours,  // Or 0
                lateInMinutes: doc.lateInMinutes,
                earlyOutMinutes: doc.earlyOutMinutes,
                isLateIn: doc.isLateIn,
                isEarlyOut: doc.isEarlyOut,
                status: doc.status === 'PRESENT' || doc.status === 'HALF_DAY' ? 'complete' : 'incomplete', // Map status loosely
                payableShift: doc.status === 'PRESENT' ? 1 : (doc.status === 'HALF_DAY' ? 0.5 : 0),
            };

            // Scenario 1: No shifts array at all, but root data exists
            if (!doc.shifts || doc.shifts.length === 0) {
                if (hasRootData) {
                    doc.shifts = [potentialShift];
                    needsUpdate = true;
                    console.log(`[Migrate] Record ${doc._id} (${doc.employeeNumber} - ${doc.date}): Moved root data to shifts[0]`);
                }
            }
            // Scenario 2: Shifts array exists.
            // We assume if shifts array exists, it's the source of truth for modern records.
            // However, we still need to unset the root fields.
            else {
                // Just unset root fields if they exist
                if (hasRootData) {
                    needsUpdate = true;
                    // We don't overwrite shifts[0] if it exists, assuming it's correct.
                    console.log(`[Migrate] Record ${doc._id} (${doc.employeeNumber} - ${doc.date}): Has shifts, cleaning root fields.`);
                }
            }

            if (needsUpdate || hasRootData) {
                // Calculate Aggregates from Shifts
                let totalLateIn = 0;
                let totalEarlyOut = 0;
                let totalExpected = 0;
                let totalWorking = 0;

                if (doc.shifts && doc.shifts.length > 0) {
                    doc.shifts.forEach(shift => {
                        if (shift.lateInMinutes > 0) totalLateIn += shift.lateInMinutes;
                        if (shift.earlyOutMinutes > 0) totalEarlyOut += shift.earlyOutMinutes;
                        if (shift.workingHours > 0) totalWorking += shift.workingHours;
                        // For expected hours, we might not have it in shift object yet.
                        // If we don't, we can try to infer or just default to 0 for now.
                        // Ideally shift object should have 'duration' or 'expectedHours'. Model has 'duration'.
                        // Let's rely on shift.duration (which is usually in minutes).
                        // Note: totalExpectedHours is expected in HOURS usually? The name suggests it.
                        // Let's standardise on Hours for 'totalExpectedHours'.
                        if (shift.duration) {
                            totalExpected += (shift.duration / 60);
                        }
                    });
                }

                // Fallback: If no shifts (unlikely here) or calculation yielded 0 but root had values
                // and we just migrated, we can use root values as a starting point for totals.
                if (totalExpected === 0 && doc.expectedHours) totalExpected = doc.expectedHours;
                if (totalWorking === 0 && doc.totalWorkingHours) totalWorking = doc.totalWorkingHours;
                if (totalWorking === 0 && doc.totalHours) totalWorking = doc.totalHours;


                // Unset root fields but SET new aggregates
                // We use $set for new fields and $unset for old ones
                await AttendanceDaily.updateOne(
                    { _id: doc._id },
                    {
                        $set: {
                            shifts: doc.shifts,
                            totalWorkingHours: totalWorking,
                            totalLateInMinutes: totalLateIn,
                            totalEarlyOutMinutes: totalEarlyOut,
                            totalExpectedHours: totalExpected
                        },
                        $unset: {
                            inTime: "", outTime: "", shiftId: "",
                            lateInMinutes: "", earlyOutMinutes: "",
                            isLateIn: "", isEarlyOut: "",
                            expectedHours: "", totalHours: ""
                        }
                    }
                );
                updatedCount++;
            }

            if (processedCount % 100 === 0) {
                console.log(`Processed ${processedCount} records...`);
            }
        }

        console.log(`Migration Complete. Processed: ${processedCount}, Updated: ${updatedCount}`);
        process.exit(0);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrateAttendanceDaily();
