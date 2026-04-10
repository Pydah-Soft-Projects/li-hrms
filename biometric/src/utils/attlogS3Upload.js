/**
 * Optional upload of attendance backup JSON files to S3.
 * Enable with ATTLOG_BACKUP_S3_ENABLED=true plus AWS_S3_BUCKET_NAME (or ATTLOG_BACKUP_S3_BUCKET), AWS_REGION, credentials.
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

function attlogS3Enabled() {
    const v = process.env.ATTLOG_BACKUP_S3_ENABLED;
    if (v == null || String(v).trim() === '') return false;
    return ['1', 'true', 'yes', 'on'].includes(String(v).trim().toLowerCase());
}

function getBucket() {
    return (
        process.env.AWS_S3_BUCKET_NAME ||
        process.env.ATTLOG_BACKUP_S3_BUCKET ||
        process.env.AWS_S3_BUCKET ||
        ''
    );
}

function getPrefix() {
    const p = process.env.ATTLOG_BACKUP_S3_PREFIX || 'device-attlog-backups/';
    return p.endsWith('/') ? p : `${p}/`;
}

/**
 * @param {string} localFilePath - absolute path to JSON file
 * @param {object} [meta]
 * @param {string} [meta.deviceId]
 * @param {string} [meta.operationTag]
 * @returns {Promise<{ uploaded: boolean, skipped?: boolean, reason?: string, bucket?: string, key?: string, error?: string, localFilePath?: string }>}
 */
async function uploadAttlogBackupFile(localFilePath, meta = {}) {
    if (!attlogS3Enabled()) {
        return { uploaded: false, skipped: true, reason: 's3_disabled' };
    }

    const bucket = getBucket();
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
    if (!bucket || !region) {
        logger.warn(
            'ATTLOG_BACKUP_S3_ENABLED but bucket (AWS_S3_BUCKET_NAME / ATTLOG_BACKUP_S3_BUCKET) or AWS_REGION is missing; skipping S3 upload'
        );
        logger.info(`Local ATTLOG JSON backup is still on disk: ${localFilePath}`);
        return { uploaded: false, skipped: true, reason: 'missing_config', localFilePath };
    }

    let PutObjectCommand;
    let S3Client;
    try {
        ({ PutObjectCommand, S3Client } = require('@aws-sdk/client-s3'));
    } catch (e) {
        logger.error('S3 upload requested but @aws-sdk/client-s3 is not installed:', e.message);
        logger.warn(
            `Local ATTLOG JSON backup is still on disk (run "npm install" in the biometric app folder): ${localFilePath}`
        );
        return { uploaded: false, skipped: true, reason: 'sdk_missing', localFilePath };
    }

    const basename = path.basename(localFilePath);
    const key = `${getPrefix()}${basename}`;

    const clientConfig = { region };
    const endpoint = process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT;
    if (endpoint) {
        clientConfig.endpoint = endpoint;
        clientConfig.forcePathStyle = String(process.env.AWS_S3_FORCE_PATH_STYLE || 'true').toLowerCase() !== 'false';
    }

    const client = new S3Client(clientConfig);
    const body = await fs.readFile(localFilePath);

    const Metadata = {};
    if (meta.deviceId) Metadata.deviceid = String(meta.deviceId).slice(0, 1024);
    if (meta.operationTag) Metadata.operation = String(meta.operationTag).slice(0, 1024);

    try {
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            ...(Object.keys(Metadata).length ? { Metadata } : {})
        }));
        logger.info(`ATTLOG backup uploaded to s3://${bucket}/${key}`);
        return { uploaded: true, bucket, key };
    } catch (err) {
        logger.error(`S3 upload failed for ${localFilePath}:`, err.message);
        logger.info(`Local ATTLOG JSON backup was not deleted; file remains: ${localFilePath}`);
        return { uploaded: false, error: err.message, localFilePath };
    }
}

module.exports = {
    attlogS3Enabled,
    uploadAttlogBackupFile
};
