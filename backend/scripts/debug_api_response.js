const url = 'http://localhost:5000/api/attendance/monthly?year=2026&month=6&page=1&limit=50&search=2146&divisionId=6992f9254fb69ffde98364bc&startDate=2026-05-26&endDate=2026-06-25&mode=complete';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OThiMWI2YTFiOTUzN2VmZDY0MjI2MDEiLCJzZXNzaW9uSWQiOiIyOTY0MDQzMC0wMzc0LTRkZjAtYTNkNS1mZWFjNTZlY2I5Y2YiLCJ0b2tlblZlcnNpb24iOjAsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3ODE4NTIwODksImV4cCI6MTc4MTg1Mjk4OX0.JpLtgc4JraExcCv74h7tMzQWPsBFPTRZhdNG3gzmR6Y';

(async () => {
  try {
    console.log('🔄 Fetching data...\n');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const data = await response.json();
    
    console.log('✅ Raw Response Structure:\n');
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
