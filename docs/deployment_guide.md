# Comprehensive Deployment Guide: LI-HRMS on Windows Server (IBM Tower)

This guide provides a complete, step-by-step flow for deploying the LI-HRMS ecosystem (Frontend, Backend, and Biometric Log Collector) on a Windows-based IBM Tower server.

---

## 🚀 1. Getting Started: Server Preparation

### 1.1 Download & Install Core Tools
Install these on the server in the following order:
1.  **Node.js (LTS)**: [nodejs.org](https://nodejs.org/) (Choose Windows Installer .msi).
2.  **Redis (Memurai)**: [memurai.com](https://www.memurai.com/) (Best Choice for Windows production).
3.  **Git for Windows**: [git-scm.com](https://git-scm.com/) (Required for Step 2.1).
4.  **Nginx for Windows**: [nginx.org](https://nginx.org/en/download.html) (Download the Mainline/Stable `.zip`, extract to `C:\nginx`).
5.  **PM2 Process Manager**: Open PowerShell as Admin and run:
    ```powershell
    npm install -g pm2
    ```

### 1.2 Firewall Configuration (CRITICAL)
Open the **Windows Firewall with Advanced Security** and add **Inbound Port Rules** for:
- **Port 80/443**: To serve the web app (Nginx).
- **Port 4000**: Direct HTTP communication for Biometric Devices (ADMS).
- **Port 5000**: (Optional) For direct API testing, though usually kept internal.

---

## 🚚 2. Code Transfer & Initial Setup

### 2.1 Transferring the Code
On the server, open PowerShell and navigate to your production directory (e.g., `C:\apps` or `D:\`):

**Method A: Git (Recommended)**
```powershell
git clone https://your-repository-url.git li-hrms
```

**Method B: Manual Transfer**
Copy the project folder using RDP (Remote Desktop) or an SFTP tool like FileZilla.

### 2.2 Global Initialization
Navigate to the root of the project and install primary dependencies:
```powershell
cd li-hrms
npm install
```

---

## 🛠️ 3. Component Configuration & Deployment

### 3.1 Backend Setup
1. Navigate to `backend/`.
2. Create/Edit `.env`:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/li-hrms
   REDIS_HOST=localhost
   REDIS_PORT=6379
   JWT_SECRET=generate_a_random_string_here
   FRONTEND_URL=http://your-server-ip
   ```
3. Install and Start:
   ```powershell
   npm install --production
   pm2 start server.js --name "hrms-backend"
   ```

### 3.2 Biometric Service Setup
1. Navigate to `biometric/`.
2. Create `.env`:
   ```env
   PORT=4000
   MONGODB_URI=mongodb://localhost:27017/biometric_logs
   SYNC_INTERVAL_MINUTES=0
   ```
3. Install and Start:
   ```powershell
   npm install
   pm2 start src/server.js --name "hrms-biometric"
   ```

### 3.3 Frontend Setup (Build Mode)
1. Navigate to `frontend/`.
2. Create `.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://your-server-ip/api
   NEXT_PUBLIC_SOCKET_URL=http://your-server-ip
   ```
3. **Build the Application**:
   ```powershell
   npm install
   npm run build
   ```
4. **Deploy with PM2**:
   ```powershell
   pm2 start "npm start" --name "hrms-frontend"
   ```

---

## 🌐 4. Reverse Proxy Setup (The Bridge)

Nginx acts as the "Traffic Controller," directing port 80 requests to the correct internal services.

1. Open `C:\nginx\conf\nginx.conf`.
2. Replace the `server { ... }` block with this:

```nginx
server {
    listen 80;
    server_name your-server-ip; # Replace with your actual IP or Domain

    # FRONTEND (Main Website)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # BACKEND API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # SOCKET.IO (Real-time Notifications)
    location /socket.io {
        proxy_pass http://localhost:5000/socket.io;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

3. **Start Nginx**:
   Run `C:\nginx\nginx.exe` in PowerShell.

---

## 🔄 5. Automation & Persistence

To ensure everything restarts automatically if the server reboots:

1. Install Windows Service Installer:
   ```powershell
   npm install -g pm2-windows-service
   ```
2. Run `pm2-service-install` and follow the prompts.
3. Save current PM2 processes:
   ```powershell
   pm2 save
   ```

---

## 📟 6. Device Connection (Biometric)
1. Device **Server Address**: `http://your-server-ip`
2. Device **Server Port**: `4000`
3. Communication will happen via direct IP-to-IP over the firewall.

---

## ✅ 7. Verification List
- [ ] Visit `http://your-server-ip` -> Should see Login screen.
- [ ] Login -> Should be able to view Dashboard (Tests /api).
- [ ] Check Logs: `pm2 status`. All services should be `online`.
- [ ] Redis check: `pm2 logs hrms-backend` -> Should show "Connected to Redis/BullMQ".
