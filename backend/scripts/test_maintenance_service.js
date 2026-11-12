const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const service = require('../general-complaints/services/maintenanceDbService');

async function testService() {
  try {
    const cats = await service.getCategories();
    console.log('Categories loaded successfully! Main count:', cats.categories.length);
    console.log('Subcategories keys:', Object.keys(cats.subCategoriesByParent));

    const res = await service.getComplaints({ only_my: false, limit: 5 });
    console.log('Complaints query success! Total:', res.pagination.total, 'Stats:', res.stats);
    if (res.complaints.length > 0) {
      console.log('First complaint:', {
        id: res.complaints[0].id,
        number: res.complaints[0].complaint_number,
        title: res.complaints[0].title,
        status: res.complaints[0].status,
        category: res.complaints[0].category_name,
        requester: res.complaints[0].requester_name
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

testService();

