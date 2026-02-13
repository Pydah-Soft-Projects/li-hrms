const logger = require('./logger');

/**
 * Utility to parse ADMS (Push) protocol payloads
 */
const admsParser = {
    /**
     * Parse binary record based on user-provided offsets:
     * 4-7: User ID
     * 8-15: Timestamp
     * 16: InOut flag
     */
    parseBinaryRecord: (buffer) => {
        try {
            if (buffer.length < 17) return null;

            // Packet typically includes header (0-3)
            // 4-7: User ID
            const userId = buffer.readUInt32LE(4).toString();

            // 8-15: Timestamp (simplified parsing, often encoded in specific format)
            // For now, let's log the hex and try to decode if it's standard 
            // In many protocols, it's YYYYMMDDHHMMSS as packed BCD or similar
            const rawTime = buffer.slice(8, 16).toString('hex');

            // 16: InOut flag
            const inOut = buffer.readUInt8(16);

            return {
                userId,
                timestamp: new Date(), // Placeholder for now - needs specific decoding
                inOutMode: inOut,
                rawTimeHex: rawTime
            };
        } catch (error) {
            logger.error('Error parsing ADMS binary record:', error);
            return null;
        }
    },

    /**
     * Parse ADMS Key-Value lines (USERINFO, FINGERTMP, FACE, etc.)
     * Example: PIN=1	Name=John	Password=123	Group=1
     */
    parseKeyValueLine: (line) => {
        if (!line.trim()) return null;

        const result = {};
        // Split by tabs (standard ADMS format). 
        // We use tabs specifically so names with spaces are not broken apart.
        const parts = line.split('\t');

        for (const part of parts) {
            if (!part.includes('=')) continue;

            const [key, ...valueParts] = part.split('=');
            if (key) {
                const normKey = key.trim().toUpperCase();
                const value = valueParts.join('=').trim();
                result[normKey] = value;

                // Normalization: Ensure PIN and USERID are treated the same
                if (normKey === 'USERID' && !result.PIN) {
                    result.PIN = value;
                }

                // Normalization: Ensure various Name keys are mapped to NAME
                if (['NAME', 'USERNAME', 'USER_NAME'].includes(normKey) && !result._NAME_FINAL) {
                    result._NAME_FINAL = value;
                }
            }
        }

        // Final normalization for the consumer
        if (result._NAME_FINAL) result.NAME = result._NAME_FINAL;

        // Return null if empty or non-data line
        return Object.keys(result).length > 0 ? result : null;
    },

    /**
     * Specialized parser for Biometric Templates (Finger/Face)
     * Format: PIN=1	FID=0	Size=123	Valid=1	TMP=...
     */
    parseBiometricData: (text) => {
        if (!text || typeof text !== 'string') return [];

        const lines = text.split('\n');
        const results = [];

        for (const line of lines) {
            // Lines often start with 'FP ' or 'FACE '
            const cleanLine = line.replace(/^(FP|FACE|USER)\s+/, '').trim();
            const data = admsParser.parseKeyValueLine(cleanLine);

            if (data && (data.PIN || data.USERID)) {
                results.push({
                    userId: data.PIN || data.USERID,
                    fingerIndex: data.FID !== undefined ? parseInt(data.FID) : null,
                    faceIndex: data.FID !== undefined ? parseInt(data.FID) : null,
                    template: data.TMP || '',
                    size: parseInt(data.SIZE) || 0,
                    valid: data.VALID === '1'
                });
            }
        }
        return results;
    },

    /**
     * Most ADMS devices send data as plain text tab-separated values
     * Example: 1	2025-12-23 00:50:00	0	0	0	0
     */
    parseTextRecords: (text) => {
        // Handle empty, null, undefined, or object body
        if (!text || typeof text !== 'string') {
            logger.warn(`parseTextRecords received non-string data: ${typeof text}`);
            return [];
        }

        // Handle empty string
        if (text.trim().length === 0) {
            return [];
        }

        const lines = text.split('\n');
        const records = [];

        for (const line of lines) {
            if (!line.trim() || line.startsWith('table=')) continue;

            const parts = line.split('\t');
            if (parts.length >= 2) {
                // Basic check for ATTLOG format (tab separated values without keys)
                if (!parts[0].includes('=')) {
                    // Normalize timestamp string: "2023-12-25 10:45:00" -> "2023/12/25 10:45:00 +05:30"
                    // Adding the offset ensures correct UTC calculation regardless of server timezone
                    const offset = process.env.TIMEZONE_OFFSET || '+05:30';
                    const timeStr = parts[1].replace(/-/g, '/') + ' ' + offset;

                    records.push({
                        userId: parts[0],
                        timestamp: new Date(timeStr),
                        inOutMode: parseInt(parts[2]) || 0,
                        status: parseInt(parts[3]) || 0
                    });
                }
            }
        }
        return records;
    },
    /**
     * Parse device status info (usually comma separated with ~ prefix)
     * Format: ~DeviceName=x,MAC=00:...,TransactionCount=8741
     */
    parseDeviceStatus: (text) => {
        if (!text || typeof text !== 'string') return null;

        const result = {};
        const parts = text.split(',');

        for (const part of parts) {
            if (!part.includes('=')) continue;

            const [key, ...valueParts] = part.split('=');
            if (key) {
                // Strip ~ and normalize key
                const rawKey = key.trim();
                const cleanKey = rawKey.startsWith('~') ? rawKey.substring(1) : rawKey;
                const value = valueParts.join('=').trim();
                result[cleanKey] = value;
            }
        }
        return Object.keys(result).length > 0 ? result : null;
    }
};

module.exports = admsParser;
