# 🚀 Quick Start Guide - Biometric Log Collection System

## ⚡ 3-Step Setup

### 1️⃣ Configure Your Devices

Edit `config/devices.json` with your actual eSSL device IP addresses:

```json
[
  {
    "deviceId": "DEVICE_001",
    "name": "Main Gate",
    "ip": "192.168.1.100",  // ← Change to your device IP
    "port": 4370,
    "enabled": true
  }
]
```

### 2️⃣ Start MongoDB

```powershell
net start MongoDB
```

### 3️⃣ Run the Application

```powershell
npm start
```

Server starts on: `http://localhost:3000`

---

## 🎯 Key API Endpoints

### Get ALL Logs for Employee (Your Special Endpoint)
```http
GET /api/logs/employee/EMP001
```

### Get Logs with Filters
```http
GET /api/logs?employeeId=EMP001&startDate=2025-12-22&endDate=2025-12-23
```

### Trigger Manual Sync
```http
POST /api/sync
```

### Check Device Status
```http
GET /api/devices/status
```

---

## 📊 What Gets Stored

```json
{
  "employeeId": "EMP001",
  "timestamp": "2025-12-22T17:09:05.805Z",
  "logType": "CHECK_IN",  // From device: CHECK_IN, CHECK_OUT, OVERTIME_IN, OVERTIME_OUT
  "deviceId": "DEVICE_001",
  "deviceName": "Main Gate"
}
```

---

## ✅ Features

- ✅ Fetches raw logs from eSSL devices
- ✅ Auto-sync every 15 minutes
- ✅ Prevents duplicate entries
- ✅ No pairing/transformation (HRMS handles that)
- ✅ RESTful API for integration

---

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `.env` | MongoDB URI, port, sync interval |
| `config/devices.json` | Device IP addresses |

---

## 📖 Full Documentation

See `README.md` for complete documentation and troubleshooting.
