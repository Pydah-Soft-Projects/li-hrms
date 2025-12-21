const { s3, BUCKET_NAME } = require('../config/s3Config');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} originalName - Original filename
 * @param {String} mimeType - File MIME type
 * @param {String} folder - S3 folder path (e.g., 'certificates/qualifications')
 * @returns {Promise<String>} - S3 file URL
 */
const uploadToS3 = async (fileBuffer, originalName, mimeType, folder = 'certificates') => {
    try {
        const fileExtension = path.extname(originalName);
        const fileName = `${folder}/${uuidv4()}${fileExtension}`;

        const params = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: fileBuffer,
            ContentType: mimeType,
            ACL: 'public-read' // Make files publicly accessible
        };

        console.log(`[S3 Upload] Uploading file: ${fileName}`);
        const result = await s3.upload(params).promise();
        console.log(`[S3 Upload] Success: ${result.Location}`);

        return result.Location; // Returns the public URL
    } catch (error) {
        console.error('[S3 Upload] Error:', error);
        throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
};

/**
 * Delete file from S3
 * @param {String} fileUrl - Full S3 URL
 * @returns {Promise<Boolean>}
 */
const deleteFromS3 = async (fileUrl) => {
    try {
        if (!fileUrl || !fileUrl.includes(BUCKET_NAME)) {
            console.warn('[S3 Delete] Invalid URL or not from our bucket:', fileUrl);
            return false;
        }

        // Extract key from URL
        const url = new URL(fileUrl);
        const key = url.pathname.substring(1); // Remove leading '/'

        const params = {
            Bucket: BUCKET_NAME,
            Key: key
        };

        console.log(`[S3 Delete] Deleting file: ${key}`);
        await s3.deleteObject(params).promise();
        console.log(`[S3 Delete] Success: ${key}`);

        return true;
    } catch (error) {
        console.error('[S3 Delete] Error:', error);
        throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
};

/**
 * Replace file in S3 (delete old, upload new)
 * @param {String} oldFileUrl - Old file URL to delete
 * @param {Buffer} newFileBuffer - New file buffer
 * @param {String} originalName - New filename
 * @param {String} mimeType - New file MIME type
 * @param {String} folder - S3 folder
 * @returns {Promise<String>} - New file URL
 */
const replaceInS3 = async (oldFileUrl, newFileBuffer, originalName, mimeType, folder = 'certificates') => {
    try {
        // Delete old file if exists
        if (oldFileUrl) {
            await deleteFromS3(oldFileUrl);
        }

        // Upload new file
        return await uploadToS3(newFileBuffer, originalName, mimeType, folder);
    } catch (error) {
        console.error('[S3 Replace] Error:', error);
        throw new Error(`Failed to replace file in S3: ${error.message}`);
    }
};

/**
 * Check if S3 is configured
 * @returns {Boolean}
 */
const isS3Configured = () => {
    return !!(process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_S3_BUCKET_NAME);
};

module.exports = {
    uploadToS3,
    deleteFromS3,
    replaceInS3,
    isS3Configured
};
