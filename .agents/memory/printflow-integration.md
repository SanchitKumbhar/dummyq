---
name: PrintFlow backend-frontend integration
description: Integration of PrintFlow Node.js backend with Electron frontend; bug fixes and security hardening applied.
---

## Key decisions

**Critical bug:** user.login.service.js used result.id — SQLite returns store_id not id. Silently created tokens with storeId: undefined.

**Security rule:** All order/file mutations must pass store_id: WHERE job_id = ? AND store_id = ?. Any new endpoint touching print_jobs without this is an IDOR.

**Redis:** Made optional. reconnectStrategy: false stops reconnection flood. BullMQ only initializes AFTER Redis connect succeeds. Server always starts.

**Frontend:** api.js is the single service layer (fetch + socket.io-client). app.js calls api.js for data; UI rendering logic preserved intact.

**How to apply:** New protected endpoints → pass req.storeId into all service calls as a mandatory second/third param.
