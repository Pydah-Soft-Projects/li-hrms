
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('Checking S3 Configuration...');
console.log('AWS_ACCESS_KEY_ID exists:', !!process.env.AWS_ACCESS_KEY_ID);
console.log('AWS_SECRET_ACCESS_KEY exists:', !!process.env.AWS_SECRET_ACCESS_KEY);
console.log('AWS_S3_BUCKET_NAME exists:', !!process.env.AWS_S3_BUCKET_NAME);
console.log('Bucket Name:', process.env.AWS_S3_BUCKET_NAME);
console.log('Region:', process.env.AWS_REGION || 'us-east-1 (default)');
