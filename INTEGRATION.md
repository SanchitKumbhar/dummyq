# PrintFlow – Backend ↔ Frontend Integration Document

**Date:** June 28, 2026  
**Project:** PrintFlow MicroSaaS Print Shop Management System  
**Stack:** Node.js 20 + Express 5 · SQLite3 · Socket.IO 4 · BullMQ · Electron 31 · socket.io-client 4

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)  
2. [Backend API Reference](#2-backend-api-reference)  
3. [Authentication Flow](#3-authentication-flow)  
4. [Real-Time Events (Socket.IO)](#4-real-time-events-socketio)  
5. [Frontend API Service Layer](#5-frontend-api-service-layer)  
6. [Data Models](#6-data-models)  
7. [Bug Fixes Applied](#7-bug-fixes-applied)  
8. [File Serving](#8-file-serving)  
9. [Environment Configuration](#9-environment-configuration)  
10. [Running the System](#10-running-the-system)  
11. [Security Boundaries](#11-security-boundaries)  
12. [Future Work](#12-future-work)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Electron Desktop App              │
│  ┌─────────────────┐  ┌──────────────────┐ │
│  │ frontend/app.js │  │ frontend/api.js  │ │
│  │  UI Rendering   │◄─│  HTTP + Socket   │ │
│  │  Print IPC      │  │  Client Layer    │ │
│  └─────────────────┘  └────────┬─────────┘ │
└───────────────────────────────│─────────────┘
                                │ HTTP (localhost:5000)
                                │ WebSocket (socket.io)
┌───────────────────────────────▼─────────────┐
│            PrintFlow Backend                │
│  ┌────────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Express 5 │  │Socket.IO │  │ BullMQ  │ │
│  │  REST API  │  │ Rooms    │  │ Queue   │ │
│  └─────┬──────┘  └────┬─────┘  └────┬────┘ │
│        │              │              │       │
│  ┌─────▼──────────────▼──────┐  ┌───▼────┐ │
│  │       SQLite3 DB          │  │  Redis │ │
│  │  stores / print_jobs /    │  │(optional│ │
│  │  print_job_files /        │  │   )    │ │
│  │  customers                │  └────────┘ │
│  └───────────────────────────┘             │
└─────────────────────────────────────────────┘
```

**Key design decisions:**
- Redis is **optional** — server starts in standalone Socket.IO mode if Redis is unreachable. BullMQ (WhatsApp queue) only initializes when Redis is available.
- All authenticated routes enforce **tenant isolation** (JWT `storeId` scopes every DB query).
- The frontend communicates via:
  1. `fetch()` HTTP calls through `frontend/api.js`
  2. Socket.IO for real-time job arrival notifications

---

## 2. Backend API Reference

**Base URL:** `http://localhost:5000`

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

### 2.1 Auth Endpoints (Public)

#### `POST /api/user-auth/v1/signup`
Create a new store account.

**Body:**
```json
{
  "name": "Sai Print & Xerox",
  "phonenumber": "9823456789",
  "password": "securepass",
  "email": "sai@print.com",
  "district": "Pune",
  "state": "Maharashtra",
  "address": "Shop 12, Swargate",
  "cache_folder": ""
}
```

**Response 201:**
```json
{
  "success": true,
  "message": "Signup successful",
  "token": "<jwt>"
}
```

**Response 409:** Phone number or email already registered.

---

#### `POST /api/user-auth/v1/login`
Authenticate and receive a JWT.

**Body:**
```json
{
  "phonenumber": "9823456789",
  "password": "securepass"
}
```

**Response 201:**
```json
{
  "success": true,
  "token": "<jwt>"
}
```

**Response 401:** Invalid credentials.

---

### 2.2 Order / Job Endpoints (Protected)

#### `GET /api/orders/v1/get-order`
Fetch all print jobs for the authenticated store.

**Response 200:**
```json
{
  "data": [
    {
      "job_id": "MAN-1782663644526-M1RLY",
      "customer_name": "Rahul Sharma",
      "sender_phone": "9999988888",
      "source": "manual",
      "file_count": 0,
      "total_pages": 10,
      "status": "pending",
      "cost_of_job": 0,
      "created_at": "2026-06-28 16:20:44",
      "updated_at": "2026-06-28 16:20:44"
    }
  ]
}
```

---

#### `POST /api/orders/v1/create-manual-job`
Create a walk-in / manual print job.

**Body:**
```json
{
  "customer_name": "Rahul Sharma",
  "sender_phone": "9999988888",
  "pages": 10,
  "source": "manual",
  "notes": "Print double-sided"
}
```

**Response 201:**
```json
{
  "success": true,
  "job": { "job_id": "MAN-...", "status": "pending", ... }
}
```

The new job is also broadcast via Socket.IO to `store-<storeId>` room as `"new-job"`.

---

#### `PATCH /api/orders/v1/update-status`
Update the status of a print job owned by the authenticated store.

**Body:**
```json
{
  "jobId": "MAN-1782663644526-M1RLY",
  "status": "printing"
}
```

**Valid statuses:** `pending` · `printing` · `paused` · `completed` · `cancelled`

**Response 200:** `{ "success": true, "message": "Status updated" }`  
**Response 404:** Job not found or belongs to a different store.  
**Response 400:** Invalid status value.

---

#### `PATCH /api/orders/v1/cost-order`
Update the cost of a print job (tenant-scoped).

**Body:**
```json
{
  "jobId": "MAN-1782663644526-M1RLY",
  "cost": 12.50
}
```

**Response 200:** `{ "success": true, "message": "Cost updated" }`

---

#### `GET /api/orders/v1/files/:jobId`
Get all files attached to a print job (tenant-scoped via JOIN).

**Response 200:**
```json
{
  "files": [
    {
      "id": 1,
      "job_id": "MM01194844...",
      "file_name": "document.pdf",
      "file_path": "/home/runner/workspace/backend/workers/uploads/document.pdf",
      "file_type": "application/pdf",
      "pages": 5
    }
  ]
}
```

---

### 2.3 Webhook Endpoints (Public)

#### `POST /api/printwebhook/v1/webhook/whatsapp-integration`
Receives Twilio WhatsApp webhook payloads. Fast hand-off to BullMQ. Returns 200 immediately (or 200 with degradation note if Redis is offline).

#### `GET /webhook` / `POST /webhook`
Meta Cloud API WhatsApp Business webhook (verification + message events).

---

### 2.4 Utility Endpoints

#### `GET /health`
```json
{ "status": "ok", "timestamp": "2026-06-28T16:20:00.000Z" }
```

---

## 3. Authentication Flow

```
Frontend                        Backend
   │                               │
   │  POST /signup or /login       │
   ├──────────────────────────────►│
   │                               │  bcrypt.compare(password, hash)
   │                               │  jwt.sign({ storeId, phoneNumber })
   │  ◄── { token: "eyJ..." } ────│
   │                               │
   │  localStorage.setItem         │
   │    pf_token = token           │
   │    pf_store_id = storeId      │
   │                               │
   │  fetch('/api/orders/...', {   │
   │    headers: {                 │
   │      Authorization: Bearer <token>
   │    }                          │
   │  })                           │
   ├──────────────────────────────►│
   │                               │  verifyToken middleware:
   │                               │    jwt.verify(token, JWT_SECRET)
   │                               │    req.storeId = decoded.storeId
   │  ◄── { data: [...] } ────────│
```

**JWT Payload:**
```json
{
  "storeId": 4,
  "phoneNumber": "9823456789",
  "iat": 1782663626,
  "exp": 1782681626
}
```

**Token storage:** `localStorage` (Electron renderer). Token is included in every request via `Authorization: Bearer` header. The `api.isAuthenticated()` helper checks token expiry locally without a round-trip.

**Session persistence:** On app restart, `init()` calls `api.isAuthenticated()` — if token is valid, `startApp()` runs directly without showing the login screen.

---

## 4. Real-Time Events (Socket.IO)

**Connection:** `ws://localhost:5000`

### Room joining (on connect)
```js
socket.emit("register-store", { storeId: 4 });
// Server joins socket to room "store-4"
```

### Event: `new-job` (server → client)
Emitted when a new WhatsApp job arrives (via BullMQ worker) or a manual job is created from the API.

**Payload:**
```json
{
  "jobId": "MM011140c7d1e7...",
  "storeId": 1,
  "senderPhone": "919876543210",
  "source": "whatsapp",
  "fileCount": 2,
  "totalPages": 5,
  "files": [{ "fileName": "doc.pdf", "localPath": "...", "pages": 5 }],
  "status": "pending",
  "createdAt": "2026-06-28T16:20:00.000Z"
}
```

**Frontend handler (in `api.js`):**
```js
socket.on("new-job", (data) => {
  const incoming = api.normalizeSocketJob(data);
  incomingJobs.unshift(incoming);
  renderDashboard();
  showToast(`New job from ${incoming.client}`);
});
```

### Redis mode vs. Standalone mode
| Mode | How it works |
|------|-------------|
| **Redis available** | BullMQ worker publishes to `store-events` channel. Redis adapter broadcasts to all Socket.IO instances (multi-server). |
| **Redis offline** | Socket.IO emits directly from the Express process. Works for single-server deployments (typical Electron desktop use). |

---

## 5. Frontend API Service Layer

**File:** `frontend/api.js`

All functions are `async` and throw on error (HTTP non-2xx or network failure). Callers wrap in `try/catch`.

```js
const api = require('./api');

// Auth
await api.login(phonenumber, password);
await api.signup(name, phonenumber, password, email);
api.logout();
api.isAuthenticated()  // → boolean (checks exp)
api.getToken()         // → string | null
api.getStoreId()       // → number | null

// Orders
await api.getOrders()                    // → raw order array from backend
await api.updateStatus(jobId, status)    // → { success: true }
await api.updateCost(jobId, cost)        // → { success: true }
await api.createManualJob(jobData)       // → raw job object
await api.getJobFiles(jobId)             // → file array

// Normalization
api.normalizeJob(rawOrder)               // backend row → frontend job shape
api.normalizeSocketJob(socketPayload)    // socket event → incoming job shape

// Files
api.getFileUrl(dbFilePath)              // DB path → HTTP URL

// Socket
api.connectSocket(storeId, callbacks)
api.disconnectSocket()
```

### Job normalization

Backend rows have different field names from what the UI expects. `normalizeJob()` maps them:

| Backend field | Frontend field |
|---|---|
| `job_id` | `id` |
| `customer_name` \| `sender_phone` | `customer` |
| `sender_phone` | `phone` |
| `total_pages` | `pages` |
| `cost_of_job` | `amount` |
| `created_at` | `time` (formatted HH:MM AM/PM) |

---

## 6. Data Models

### `stores`
| Column | Type | Notes |
|--------|------|-------|
| `store_id` | INTEGER PK | Auto-increment |
| `store_name` | TEXT | e.g. "Sai Print & Xerox" |
| `password` | TEXT | bcrypt hashed |
| `email` | TEXT UNIQUE | Optional |
| `phone_number` | TEXT UNIQUE | Login identifier |
| `district`, `state`, `address` | TEXT | Optional location |
| `cache_folder` | TEXT | Local path for job cache |
| `created_at` | DATETIME | Auto |

### `print_jobs`
| Column | Type | Notes |
|--------|------|-------|
| `job_id` | TEXT PK | `MAN-<timestamp>` (manual) or WhatsApp MessageSid |
| `store_id` | INTEGER FK | Tenant isolation |
| `customer_name` | TEXT | Walk-in name (manual jobs) |
| `sender_phone` | TEXT | WhatsApp sender or "manual" |
| `source` | TEXT | `whatsapp`, `email`, `manual` |
| `file_count` | INTEGER | Number of attached files |
| `total_pages` | INTEGER | Aggregate page count |
| `status` | TEXT | `pending`/`printing`/`paused`/`completed`/`cancelled` |
| `cost_of_job` | REAL | Calculated cost |
| `notes` | TEXT | Operator notes |
| `print_settings` | TEXT | JSON blob (reserved) |
| `created_at`, `updated_at` | DATETIME | Auto |

### `print_job_files`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto |
| `job_id` | TEXT FK | Parent job |
| `file_name` | TEXT | Original filename |
| `file_path` | TEXT | Absolute path on server disk |
| `file_type` | TEXT | MIME type |
| `pages` | INTEGER | Page count (from pdfinfo) |

---

## 7. Bug Fixes Applied

| File | Bug | Fix |
|------|-----|-----|
| `user.login.service.js` | `generateToken(result.id, ...)` — `id` doesn't exist on SQLite row | Changed to `result.store_id` |
| `jobs.service.js` | `db.run()` used for SELECT — returns no rows | Changed to `db.all()` |
| `pending.job.service.js` | Wrong column names (`file_url`, `sender_phonenumber`), `status=pending` without quotes, broken promise (resolve after reject) | Complete rewrite |
| `pending.sync.controller.js` | `const { storeId } = req.storeId` — storeId is a scalar, not object | Changed to `const storeId = req.storeId` |
| `print.webhook.controller.js` | `const { store_id } = req.storeId` (wrong), `res.json({ data: data })` (`data` undefined) | Fixed storeId extraction; renamed to `jobs` |
| `orders.service.js` | Hardcoded `[1]` instead of `[store_id]` | Dynamic parameter |
| `index.js` | `process.exit(1)` if Redis unavailable; endless reconnection flooding logs; BullMQ initialized before Redis | Redis optional with `reconnectStrategy: false`; BullMQ deferred |
| `orders.controller.js` | Missing storeId param in costController (not protected) | Added auth middleware + storeId scoping to all PATCH routes |
| All services (IDOR) | `costService`, `updateStatusService`, `getJobFilesService` had no `store_id` constraint — cross-tenant access possible | All now require `AND store_id = ?` in SQL; controllers pass `req.storeId` |
| `print.webhook.controller.js` | `messageQueue.add()` would crash when `messageQueue` is null (Redis offline) | Added null guard with graceful response |
| `user.signup.service.js` | SQLITE_CONSTRAINT error returned as 500 | Returns 409 with descriptive message |
| `frontend/app.js` | Auth was `isAuthenticated = true` on submit (no actual API call) | Real `api.login()` / `api.signup()` calls with error handling |
| `frontend/app.js` | All jobs were hardcoded mock arrays | Replaced with `api.getOrders()` + `api.normalizeJob()` |

---

## 8. File Serving

Uploaded print files (from WhatsApp) are stored in `backend/workers/uploads/`. They are served as static files:

| Route | Source Directory |
|-------|-----------------|
| `GET /uploads/:file` | `backend/uploads/` |
| `GET /worker-uploads/:file` | `backend/workers/uploads/` |

**Electron iframe preview:**  
When a job's files are fetched via `GET /api/orders/v1/files/:jobId`, the frontend calls `api.getFileUrl(file.file_path)` which converts the absolute disk path to an HTTP URL:

```js
// DB stores: "/home/runner/workspace/backend/workers/uploads/doc.pdf"
// getFileUrl() returns: "http://localhost:5000/worker-uploads/doc.pdf"
// Electron iframe src: "http://localhost:5000/worker-uploads/doc.pdf"
```

---

## 9. Environment Configuration

Variables set via Replit Secrets / Env Vars:

| Variable | Where Set | Description |
|----------|-----------|-------------|
| `JWT_SECRET` | Replit Secret | Signing key for JWT tokens. Must be set before running. |
| `JWT_EXPIRES_IN` | Replit Env | Token lifetime (default: `5h`) |
| `PORT` | Replit Env | Server port (default: `5000`) |
| `NODE_ENV` | Replit Env | `development` or `production` |
| `REDIS_URL` | Replit Env | Redis connection string (default: `redis://127.0.0.1:6379`). Server degrades gracefully if unavailable. |
| `TWILIO_ACCOUNT_SID` | Replit Secret | For Twilio WhatsApp webhook auth (required if using Twilio) |
| `TWILIO_AUTH_TOKEN` | Replit Secret | For Twilio media download auth |
| `META_VERIFY_TOKEN` | Replit Env | Meta webhook verification token (default: `inkspool`) |

---

## 10. Running the System

### Backend (required)
```bash
cd backend && node index.js
# Or via Replit: "PrintFlow Backend" workflow on port 5000
```

### BullMQ Worker (optional — only needed with Redis + WhatsApp)
```bash
cd backend && node workers/job.worker.js
```

### Frontend (Electron desktop)
```bash
cd frontend && npm start
# Opens Electron window — connects to backend at http://localhost:5000
```

### Startup sequence
1. Backend starts, initializes SQLite schema (CREATE IF NOT EXISTS + ALTER TABLE migrations)
2. Redis connection attempted once — falls back gracefully if unavailable
3. Express listens on port 5000
4. Electron opens `frontend/index.html`
5. `app.js` calls `api.isAuthenticated()` — if token exists and not expired, loads orders directly
6. Socket.IO connects to `ws://localhost:5000` and registers the store room
7. WhatsApp jobs arrive → `new-job` socket event → appear in "Incoming Jobs" widget

---

## 11. Security Boundaries

| Concern | Implementation |
|---------|---------------|
| **Password storage** | bcrypt with 10 rounds (never stored in plain text) |
| **JWT signing** | HS256, secret from `JWT_SECRET` env var (never hardcoded) |
| **Auth middleware** | `verifyToken` on all protected routes; reads `Authorization: Bearer` header or `token` cookie |
| **Tenant isolation** | Every SQL query on `print_jobs` includes `AND store_id = ?` scoped to JWT `storeId`. Cross-tenant job IDs return 404. |
| **SQL injection** | All queries use parameterized statements (`?` placeholders); no string interpolation |
| **CORS** | `cors({ origin: "*" })` — appropriate for Electron desktop (no external browser). Tighten to `process.env.ALLOWED_ORIGIN` for web deployments. |
| **File access** | Files served from `/uploads` and `/worker-uploads` static routes. No directory traversal risk (express.static handles this). |

---

## 12. Future Work

| Item | Priority |
|------|----------|
| Redis Cloud provisioning for WhatsApp BullMQ pipeline | High |
| Twilio / Meta credential configuration for live WhatsApp | High |
| Print settings persistence to `print_settings` JSON column | Medium |
| Customer tracking table population | Medium |
| Token refresh endpoint (currently expires in 5h, requires re-login) | Medium |
| Rate limiting on auth endpoints | Medium |
| Pagination on `GET /api/orders/v1/get-order` | Low |
| File upload endpoint for manual jobs (attach PDFs from desktop) | Low |
| Export to CSV / order history report | Low |
