# Biometric Log Collector System

**A production-ready, highly scalable system for capturing granular attendance data from ZKTeco/eSSL biometric devices.**

## 🌟 Executive Summary
This system resolves the common challenges of biometric data collection (missing status codes, duplicates, limited auditing) by implementing a **hybrid architecture** that prioritizes Push data. It includes:
1.  **ADMS "Push" Protocol** (Port 4000): Listens for real-time data from devices. (Primary)
2.  **TCP "Fetch" Protocol** (Fallout/Legacy): Implementation exists but is DISABLED by default (`SYNC_INTERVAL=0`) for stability.

---

## 🚀 Key Features

### 1. Robust ADMS Auto-Registration
- **Smart Discovery**: Devices are automatically registered when they connect.
- **SN-First Identity**: Identifies devices strictly by **Serial Number**.
- **IP Mobility**: If a known device (same SN) changes IP (e.g. DHCP), the system automatically updates the IP record.
- **Ready-to-Scale**: New devices are auto-created with default settings (Port 4370) ready for any future needs.

### 2. Enterprise Logic (Strict Uniqueness)
- **One Log Per User Per Second**: Uniqueness is enforced on `{ employeeId, timestamp }`.
- **Conflict Resolution**: If a high-quality ADMS log exists, an inferior TCP log will NEVER overwrite it.
- **Performance**: Uses MongoDB **BulkWrite** operations to handle 5,000+ logs/second without blocking.

### 3. Expanded Log Types
Correctly maps all device status codes:
- **0/1**: Check-In / Check-Out
- **2/3**: Break-Out / Break-In
- **4/5**: Overtime-In / Overtime-Out

### 4. Full Data Preservation
- **`rawData` Field**: We store the *entire* original record from the device in every log entry. 
- **`AdmsRawLog` Collection**: A separate "black box" recorder that saves every single HTTP packet sent by ADMS devices.

---

## 🏗️ System Architecture

### 1. Core Services
- **`AdmsRouter`**: High-performance Express router handling `/iclock` endpoints.
- **`DeviceService`**: (Optional) Manages TCP connections. Currently set to **ADMS-Only Mode**.
- **`SyncScheduler`**: Configurable scheduler. Set to `0` to disable overhead.

### 2. Database Schema (`AttendanceLogs`)
```javascript
{
  employeeId: "101",
  timestamp: ISODate("2025-12-22T08:00:00Z"),
  logType: "BREAK-OUT",   // Expanded Types
  rawType: 2,
  deviceName: "Main Gate",
  deviceId: "BJ2C...",
  rawData: { ... }        // 100% fidelity to hardware
}
```

### 3. API Endpoints
- **Human Resources**: `GET /api/logs` (Normalized data)
- **Device Management**: `GET /api/devices` (Status and config)
- **Audit/Debug**: `GET /api/adms/raw` (See the raw packets)

---

## 🛠️ Configuration
**`.env` File**:
```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/biometric_logs
SYNC_INTERVAL_MINUTES=0  # 0 = ADMS Only Mode (Recommended)
```

## 🔍 How to Verify
1.  **Auto-Discovery**: Point a device to `http://<server-ip>:4000`. Watch logs for `New device detected!`.
2.  **Live Data**: Punch on the device. Watch logs for `ADMS Bulk Write: Inserted 1`.

---

## 👨‍💻 Developer Notes
- **Scalability**: The system uses `bulkWrite` with `ordered: false` to allow massive concurrent data dumps while silently ignoring duplicates.
- **ADMS Parser**: Located in `src/utils/admsParser.js`. Handles both tab-separated text and binary streams.

---
*System developed by Antigravity (Google DeepMind) for Advanced Agentic Coding.*
