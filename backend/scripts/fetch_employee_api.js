const url = 'http://localhost:5000/api/attendance/monthly?year=2026&month=6&page=1&limit=50&search=2146&divisionId=6992f9254fb69ffde98364bc&startDate=2026-05-26&endDate=2026-06-25&mode=complete';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OThiMWI2YTFiOTUzN2VmZDY0MjY2MDEiLCJzZXNzaW9uSWQiOiIyOTY0MDQzMC0wMzc0LTRkZjAtYTNkNS1mZWFjNTZlY2I5Y2YiLCJ0b2tlblZlcnNpb24iOjAsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3ODE4NTIwODksImV4cCI6MTc4MTg1Mjk4OX0.JpLtgc4JraExcCv74h7tMzQWPsBFPTRZhdNG3gzmR6Y';

(async () => {
  try {
    console.log('🔄 Fetching employee 2146 attendance data...\n');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      process.exit(1);
    }

    const data = await response.json();
    
    console.log('✅ Successfully fetched data!\n');
    console.log(`📊 Total Records: ${data.totalRecords}`);
    console.log(`📄 Current Page: ${data.page}`);
    console.log(`🔢 Records on Page: ${data.records?.length || 0}\n`);

    // Find employee 2146 records
    const emp2146Records = (data.records || []).filter(r => r.employeeNumber === '2146') || [];
    console.log(`🧑 Employee 2146 Records Found: ${emp2146Records.length}\n`);

    if (emp2146Records.length === 0) {
      console.log('⚠️  No records found for employee 2146');
      process.exit(0);
    }

    // Check June 15, 16, 17
    const targetDates = ['2026-06-15', '2026-06-16', '2026-06-17'];
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 CHECKING TARGET DATES FOR HALF-DAY DISPLAY');
    console.log('═══════════════════════════════════════════════════════════\n');

    targetDates.forEach(date => {
      const record = emp2146Records.find(r => r.date === date);
      
      if (!record) {
        console.log(`❌ No record for ${date}`);
        return;
      }

      console.log(`📅 ${date}`);
      console.log(`   Status: ${record.status}`);
      console.log(`   Payable: ${record.payableShifts}`);
      console.log(`   Working Hours: ${record.totalHours || record.totalWorkingHours}`);
      console.log(`   Late In Minutes: ${record.lateInMinutes}`);
      console.log(`   Early Out Minutes: ${record.earlyOutMinutes}`);

      // Check shifts array
      if (record.shifts && record.shifts.length > 0) {
        const shift = record.shifts[0];
        console.log(`\n   ✅ SHIFT DATA PRESENT`);
        console.log(`      Shift Status: ${shift.status}`);
        console.log(`      Shift Payable: ${shift.payableShift}`);
        
        if (shift.shiftSegments && shift.shiftSegments.length > 0) {
          console.log(`\n      📌 SEGMENTS (for frontend display):`);
          shift.shiftSegments.forEach((seg, idx) => {
            console.log(`         [${idx+1}] ${seg.segmentName}: Present=${seg.present}, Payable=${seg.payableShifts}`);
          });
        } else {
          console.log(`      ⚠️  NO SEGMENTS - Frontend may not display correctly!`);
        }
      } else {
        console.log(`   ❌ NO SHIFTS ARRAY - Frontend cannot display!`);
      }

      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ FRONTEND DISPLAY READINESS CHECK:');
    console.log('═══════════════════════════════════════════════════════════\n');

    let allReady = true;
    targetDates.forEach(date => {
      const record = emp2146Records.find(r => r.date === date);
      if (!record) {
        console.log(`❌ ${date}: No record`);
        allReady = false;
        return;
      }

      const hasShifts = !!(record.shifts && record.shifts.length);
      const hasSegments = !!(record.shifts && record.shifts[0] && record.shifts[0].shiftSegments && record.shifts[0].shiftSegments.length);
      
      if (!hasShifts) {
        console.log(`❌ ${date}: Missing shifts array`);
        allReady = false;
      } else if (!hasSegments) {
        console.log(`❌ ${date}: Missing shiftSegments`);
        allReady = false;
      } else {
        console.log(`✅ ${date}: Ready for display (has segments)`);
      }
    });

    console.log(`\n${allReady ? '✅ ALL DATA READY FOR FRONTEND!' : '❌ SOME DATA MISSING!'}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
