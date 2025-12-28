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
     * Most ADMS devices send data as plain text tab-separated values
     * Example: 1	2025-12-23 00:50:00	0	0	0	0
     */
    parseTextRecords: (text) => {
        const lines = text.split('\n');
        const records = [];

        for (const line of lines) {
            if (!line.trim() || line.startsWith('table=')) continue;

            const parts = line.split('\t');
            if (parts.length >= 2) {
                records.push({
                    userId: parts[0],
                    timestamp: new Date(parts[1].replace(/-/g, '/')),
                    inOutMode: parseInt(parts[2]) || 0,
                    status: parseInt(parts[3]) || 0
                });
            }
        }
        return records;
    }
};

module.exports = admsParser;
