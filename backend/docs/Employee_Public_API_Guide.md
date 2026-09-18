# Employee Public API Integration Guide

## Overview
This document provides instructions on how to integrate with the Employee Public API. This API allows external clients to securely retrieve a list of active employees, including their basic details (Name, Employee ID, and Status).

## Authentication
This API uses **API Key Authentication**. 

You will be provided with a unique API key. This key must be included in the headers of every request you make to the API.
**Header Name:** `x-api-key`

> **Security Warning:** Keep your API key secure. Do not expose it in client-side code (like frontend JavaScript). Always make calls to this API from your backend servers.

---

## Endpoint Details

**URL:** `https://<YOUR-LIVE-DOMAIN-HERE>/api/employees/public`  
*(Please replace `<YOUR-LIVE-DOMAIN-HERE>` with the actual provided production URL)*

**Method:** `GET`

### Headers Required
| Key | Value | Description |
| :--- | :--- | :--- |
| `x-api-key` | `YOUR_API_KEY_HERE` | Provided by the system administrator |
| `Content-Type` | `application/json` | |

---

## Example Requests

### 1. cURL (Command Line)
```bash
curl -X GET "https://<YOUR-LIVE-DOMAIN-HERE>/api/employees/public" \
     -H "x-api-key: YOUR_API_KEY_HERE"
```

### 2. Python (Requests Library)
```python
import requests

url = "https://<YOUR-LIVE-DOMAIN-HERE>/api/employees/public"
headers = {
    "x-api-key": "YOUR_API_KEY_HERE",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
print(response.json())
```

### 3. JavaScript / Node.js (Fetch API)
```javascript
fetch('https://<YOUR-LIVE-DOMAIN-HERE>/api/employees/public', {
  method: 'GET',
  headers: {
    'x-api-key': 'YOUR_API_KEY_HERE',
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log('Employees:', data))
.catch(error => console.error('Error:', error));
```

---

## Response Structure

A successful request will return a `200 OK` status code with a JSON payload containing the employee data.

**Example Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "64b5c92f1...",
      "firstName": "John",
      "lastName": "Doe",
      "empNo": "EMP001",
      "isActive": true
    },
    {
      "_id": "64b5c93a2...",
      "firstName": "Jane",
      "lastName": "Smith",
      "empNo": "EMP002",
      "isActive": true
    }
  ]
}
```

### Error Responses
- **401 Unauthorized:** If the API key is missing, invalid, or deactivated.
- **500 Internal Server Error:** If there is a server-side issue.
