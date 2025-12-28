# Device Management API - Quick Reference

## 🎯 Overview

Devices are now stored in **MongoDB** and can be managed dynamically via API endpoints. Your HRMS can add, update, or remove devices without editing configuration files.

---

## 📋 API Endpoints

### 1. **Get All Devices**
```http
GET /api/devices
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "...",
      "deviceId": "DEVICE_001",
      "name": "Main Gate",
      "ip": "192.168.1.100",
      "port": 4370,
      "enabled": true,
      "location": "Main Entrance",
      "lastSyncAt": "2025-12-22T17:45:00.000Z",
      "lastSyncStatus": "success",
      "createdAt": "2025-12-22T17:30:00.000Z",
      "updatedAt": "2025-12-22T17:45:00.000Z"
    }
  ]
}
```

---

### 2. **Get Single Device**
```http
GET /api/devices/DEVICE_001
```

---

### 3. **Add New Device** ⭐
```http
POST /api/devices
Content-Type: application/json

{
  "deviceId": "DEVICE_003",
  "name": "Warehouse Entrance",
  "ip": "192.168.1.102",
  "port": 4370,
  "enabled": true,
  "location": "Warehouse Building"
}
```

**Required Fields:**
- `deviceId` - Unique identifier
- `name` - Device name
- `ip` - IP address

**Optional Fields:**
- `port` - Default: 4370
- `enabled` - Default: true
- `location` - Device location description

**Response:**
```json
{
  "success": true,
  "message": "Device added successfully",
  "data": { ... }
}
```

---

### 4. **Update Device**
```http
PUT /api/devices/DEVICE_001
Content-Type: application/json

{
  "name": "Main Gate Updated",
  "ip": "192.168.1.105",
  "enabled": false
}
```

---

### 5. **Delete Device**
```http
DELETE /api/devices/DEVICE_001
```

**Response:**
```json
{
  "success": true,
  "message": "Device deleted successfully"
}
```

---

### 6. **Toggle Device Enable/Disable**
```http
PATCH /api/devices/DEVICE_001/toggle
```

Quickly enable or disable a device without full update.

---

## 🚀 Usage Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');
const API_URL = 'http://localhost:3000/api/devices';

// Add a new device
async function addDevice() {
  const response = await axios.post(API_URL, {
    deviceId: 'DEVICE_003',
    name: 'Warehouse Entrance',
    ip: '192.168.1.102',
    port: 4370,
    enabled: true,
    location: 'Warehouse'
  });
  console.log('Device added:', response.data);
}

// Get all devices
async function getAllDevices() {
  const response = await axios.get(API_URL);
  console.log('Devices:', response.data.data);
}

// Disable a device
async function disableDevice(deviceId) {
  const response = await axios.put(`${API_URL}/${deviceId}`, {
    enabled: false
  });
  console.log('Device disabled:', response.data);
}
```

### Python

```python
import requests

API_URL = 'http://localhost:3000/api/devices'

# Add a new device
def add_device():
    data = {
        'deviceId': 'DEVICE_003',
        'name': 'Warehouse Entrance',
        'ip': '192.168.1.102',
        'port': 4370,
        'enabled': True,
        'location': 'Warehouse'
    }
    response = requests.post(API_URL, json=data)
    print('Device added:', response.json())

# Get all devices
def get_all_devices():
    response = requests.get(API_URL)
    print('Devices:', response.json()['data'])
```

### cURL

```bash
# Add device
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVICE_003",
    "name": "Warehouse Entrance",
    "ip": "192.168.1.102",
    "port": 4370,
    "enabled": true
  }'

# Get all devices
curl http://localhost:3000/api/devices

# Update device
curl -X PUT http://localhost:3000/api/devices/DEVICE_001 \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Delete device
curl -X DELETE http://localhost:3000/api/devices/DEVICE_001
```

---

## 🔄 Initial Setup

### Run Seed Script (First Time Only)

```bash
npm run seed
```

This adds the initial 2 devices to the database:
- DEVICE_001: Main Gate (192.168.1.100)
- DEVICE_002: Office Entrance (192.168.1.101)

**Note:** Update the IP addresses in `scripts/seedDevices.js` before running if needed.

---

## 📊 Device Schema

```javascript
{
  deviceId: String,        // Unique identifier (required)
  name: String,            // Device name (required)
  ip: String,              // IP address (required)
  port: Number,            // Port (default: 4370)
  enabled: Boolean,        // Active status (default: true)
  location: String,        // Location description
  lastSyncAt: Date,        // Last sync timestamp
  lastSyncStatus: String,  // 'success' | 'failed' | null
  createdAt: Date,         // Auto-generated
  updatedAt: Date          // Auto-generated
}
```

---

## ✅ Benefits

1. **Dynamic Management** - Add/remove devices without restarting server
2. **HRMS Integration** - Your HRMS can manage devices programmatically
3. **Sync Tracking** - See when each device was last synced
4. **Easy Maintenance** - Enable/disable devices with one API call
5. **No Config Files** - All device data in database

---

## 🔧 Migration from JSON

The system now loads devices from MongoDB instead of `config/devices.json`. The JSON file is kept for reference but is no longer used by the application.

To migrate existing devices:
1. Update `scripts/seedDevices.js` with your devices
2. Run `npm run seed`
3. Devices are now in MongoDB!
