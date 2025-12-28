# Log Type Handling - Quick Reference

## Overview

The system now handles unknown device status codes gracefully by defaulting them to `CHECK_IN` and logging warnings so you can identify and add proper mappings.

## Current Log Type Mappings

```javascript
const LOG_TYPE_MAP = {
    0: 'CHECK_IN',
    1: 'CHECK_OUT',
    2: 'OVERTIME_IN',
    3: 'OVERTIME_OUT',
    4: 'CHECK_IN',
    5: 'CHECK_OUT',
    255: 'CHECK_IN',  // Generic punch (some devices)
};
```

## How It Works

1. **Device sends status code** with each punch
2. **System maps code** to log type using `LOG_TYPE_MAP`
3. **Unknown codes** → Default to `CHECK_IN` + log warning
4. **Logs stored** in MongoDB with the mapped log type

## Finding Unknown Status Codes

When the system encounters an unknown status code, it will log a warning:

```
WARN: Unknown status code: 15 - defaulting to CHECK_IN
```

Check your server logs to see which codes your devices are using.

## Adding New Mappings

If you see unknown status codes in the logs, add them to the mapping in `src/services/deviceService.js`:

```javascript
const LOG_TYPE_MAP = {
    0: 'CHECK_IN',
    1: 'CHECK_OUT',
    2: 'OVERTIME_IN',
    3: 'OVERTIME_OUT',
    4: 'CHECK_IN',
    5: 'CHECK_OUT',
    255: 'CHECK_IN',
    // Add your device's codes here:
    15: 'CHECK_OUT',  // Example: if code 15 means check-out
    20: 'OVERTIME_IN', // Example: if code 20 means overtime in
};
```

## Testing

1. **Check logs after sync:**
   ```bash
   # Look for WARN messages about unknown status codes
   ```

2. **Query logs by type:**
   ```bash
   curl "http://localhost:3000/api/logs?logType=CHECK_IN"
   ```

3. **Check statistics:**
   ```bash
   curl http://localhost:3000/api/stats
   ```

## Common Device Status Codes

Different eSSL/ZKTeco device models use different codes:

| Code | Common Meaning | Our Mapping |
|------|----------------|-------------|
| 0 | Check-In | CHECK_IN |
| 1 | Check-Out | CHECK_OUT |
| 2 | Break Out | OVERTIME_IN |
| 3 | Break In | OVERTIME_OUT |
| 4 | Overtime In | CHECK_IN |
| 5 | Overtime Out | CHECK_OUT |
| 255 | Generic Punch | CHECK_IN |

**Note:** Your specific device model may use different codes. Check the device manual or watch the server logs to identify the correct mappings.

## Recommendations

1. **Monitor logs** for the first few days to identify all status codes your devices use
2. **Update mappings** in `LOG_TYPE_MAP` based on your device behavior
3. **Test with employees** - have them punch in/out and verify the log types are correct
4. **Document your mappings** - note which codes your specific device models use

## Default Behavior

- **Unknown codes** → `CHECK_IN` (safe default)
- **Warning logged** → So you can identify and fix mappings
- **No data loss** → All punches are still recorded with timestamps
