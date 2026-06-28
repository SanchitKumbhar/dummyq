/**
 * PrintFlow Frontend – app.js
 * Full backend integration via api.js service layer.
 * Keeps all UI rendering logic intact; replaces mock data with real API calls.
 */

"use strict";

const { ipcRenderer } = require("electron");
const api = require("./api");

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // STATE MANAGEMENT
    // ==========================================
    let sidebarCollapsed = false;
    let activeScreen = "dashboard";
    let activeSettingsTab = "general";

    let printers = [];

    // Jobs are loaded from backend; empty until fetched
    let jobs = [];
    let incomingJobs = [];
    let activities = [];

    let selectedJobIds = [];
    let activePreviewFile = { name: "invoice_template.pdf", type: "pdf", zoom: 100, rotation: 0, page: 1, maxPages: 1 };
    let drawerPreviewState = { page: 1, maxPages: 1, zoom: 100 };

    // ==========================================
    // DOM ELEMENT SELECTORS
    // ==========================================
    const appContainer      = document.getElementById("main-app-container");
    const authContainer     = document.getElementById("auth-container");
    const loginForm         = document.getElementById("login-form");
    const signupForm        = document.getElementById("signup-form");
    const toggleToSignup    = document.getElementById("toggle-to-signup");
    const toggleToLogin     = document.getElementById("toggle-to-login");

    const sidebar           = document.getElementById("sidebar");
    const sidebarToggle     = document.getElementById("sidebar-toggle");
    const navItems          = document.querySelectorAll(".sidebar-nav .nav-item");
    const screens           = document.querySelectorAll(".screen-view");

    const detailsPanel      = document.getElementById("details-panel");
    const detailsCloseBtn   = document.getElementById("details-close-btn");
    const detailJobId       = document.getElementById("detail-job-id");
    const detailStatusBadge = document.getElementById("detail-status-badge");
    const detailCustomerName = document.getElementById("detail-customer-name");
    const detailPhoneNumber = document.getElementById("detail-phone-number");
    const detailSource      = document.getElementById("detail-source");
    const detailTimestamp   = document.getElementById("detail-timestamp");

    const detailPrinterSelect  = document.getElementById("detail-printer-select");
    const detailPrinterRefresh = document.getElementById("detail-printer-refresh");
    const detailPrinterTest    = document.getElementById("detail-printer-test");
    const detailSelectedPrinterInfo = document.getElementById("detail-selected-printer-info");

    const detailConfigCopies       = document.getElementById("detail-config-copies");
    const detailConfigColor        = document.getElementById("detail-config-color");
    const detailConfigDuplex       = document.getElementById("detail-config-duplex");
    const detailConfigPageselect   = document.getElementById("detail-config-pageselect");
    const detailConfigPagerange    = document.getElementById("detail-config-pagerange");
    const detailCustomPagesGroup   = document.getElementById("detail-custom-pages-group");
    const detailConfigSize         = document.getElementById("detail-config-size");
    const detailConfigOrientation  = document.getElementById("detail-config-orientation");
    const detailConfigQuality      = document.getElementById("detail-config-quality");
    const detailConfigPagesPerSheet = document.getElementById("detail-config-pages-per-sheet");
    const detailConfigScaleType    = document.getElementById("detail-config-scale-type");
    const detailConfigScalePct     = document.getElementById("detail-config-scale-pct");

    const detailCostBw    = document.getElementById("detail-cost-bw");
    const detailCostColor = document.getElementById("detail-cost-color");
    const detailCostExtra = document.getElementById("detail-cost-extra");
    const detailCostGst   = document.getElementById("detail-cost-gst");
    const detailCostTotal = document.getElementById("detail-cost-total");

    const detailDocName              = document.getElementById("detail-doc-name");
    const detailDocMeta              = document.getElementById("detail-doc-meta");
    const detailPreviewCanvas        = document.getElementById("detail-preview-canvas");
    const detailPreviewPageIndicator = document.getElementById("detail-preview-page-indicator");
    const detailPreviewZoomIn        = document.getElementById("detail-preview-zoom-in");
    const detailPreviewZoomOut       = document.getElementById("detail-preview-zoom-out");

    const detailSpoolPrinterName    = document.getElementById("detail-spool-printer-name");
    const detailSpoolProgressLabel  = document.getElementById("detail-spool-progress-label");
    const detailSpoolProgressBar    = document.getElementById("detail-spool-progress-bar");

    const detailActionPrintNow      = document.getElementById("detail-action-print-now");
    const detailActionPreviewMain   = document.getElementById("detail-action-preview-main");
    const detailActionPause         = document.getElementById("detail-action-pause");
    const detailActionResume        = document.getElementById("detail-action-resume");
    const detailActionCancel        = document.getElementById("detail-action-cancel");
    const detailActionComplete      = document.getElementById("detail-action-complete");
    const detailActionReprint       = document.getElementById("detail-action-reprint");
    const detailActionDownload      = document.getElementById("detail-action-download");
    const detailActionSaveSettings  = document.getElementById("detail-action-save-settings");

    const clockDisplay = document.getElementById("date-time-clock");

    // ==========================================
    // INITIALIZATION & BOOTSTRAP
    // ==========================================
    async function init() {
        lucide.createIcons();
        bindAuthEvents();

        if (!api.isAuthenticated()) {
            showAuthScreen("login");
            return;
        }

        await startApp();
    }

    async function startApp() {
        authContainer.style.display = "none";
        appContainer.style.display = "flex";

        updateClock();
        setInterval(updateClock, 1000);

        // Show loading state
        showToast("Loading print jobs...", "info");

        // Fetch real jobs from backend
        await loadOrdersFromBackend();

        await populatePrintersDropdown();

        renderDashboard();
        renderQueueTable();
        updateCostCalculator();

        // Connect real-time socket
        connectRealTimeSocket();

        bindEvents();
    }

    // ==========================================
    // BACKEND DATA LOADING
    // ==========================================
    async function loadOrdersFromBackend() {
        try {
            const rawOrders = await api.getOrders();
            jobs = rawOrders.map(api.normalizeJob);
            jobs.forEach(job => recalculateJobCosts(job));
        } catch (err) {
            console.error("Failed to load orders:", err.message);
            showToast("Could not load jobs from server: " + err.message, "error");
            jobs = []; // Start empty — don't crash
        }
    }

    // ==========================================
    // REAL-TIME SOCKET CONNECTION
    // ==========================================
    function connectRealTimeSocket() {
        const storeId = api.getStoreId();
        if (!storeId) return;

        api.connectSocket(storeId, {
            onConnect: () => {
                console.log("Real-time connection established for store", storeId);
            },
            onNewJob: (data) => {
                const incoming = api.normalizeSocketJob(data);
                incomingJobs.unshift(incoming);

                const activityTime = new Date().toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit", hour12: true
                });
                activities.unshift({
                    time: activityTime,
                    type: "pending",
                    text: `New job from <strong>${incoming.client}</strong> via ${incoming.source}`
                });

                if (activeScreen === "dashboard") renderDashboard();
                showToast(`New job received from ${incoming.client}`, "info");
            },
            onDisconnect: (reason) => {
                console.warn("Socket disconnected:", reason);
            }
        });
    }

    // ==========================================
    // AUTHENTICATION LOGIC
    // ==========================================
    function bindAuthEvents() {
        if (toggleToSignup) toggleToSignup.addEventListener("click", (e) => { e.preventDefault(); showAuthScreen("signup"); });
        if (toggleToLogin)  toggleToLogin.addEventListener("click",  (e) => { e.preventDefault(); showAuthScreen("login"); });

        if (loginForm) {
            loginForm.addEventListener("submit", async (e) => {
                e.preventDefault();

                const phone    = document.getElementById("login-phone").value.trim();
                const password = document.getElementById("login-password").value;
                const btn      = loginForm.querySelector("button[type=submit]");

                if (!phone || !password) {
                    return showToast("Phone number and password are required.", "error");
                }

                btn.textContent = "Signing in...";
                btn.disabled = true;

                try {
                    await api.login(phone, password);
                    btn.textContent = "Sign In";
                    btn.disabled = false;
                    await startApp();
                } catch (err) {
                    btn.textContent = "Sign In";
                    btn.disabled = false;
                    showToast(err.message || "Login failed. Check your credentials.", "error");
                }
            });
        }

        if (signupForm) {
            signupForm.addEventListener("submit", async (e) => {
                e.preventDefault();

                const name     = document.getElementById("signup-name").value.trim();
                const phone    = document.getElementById("signup-phone").value.trim();
                const password = document.getElementById("signup-password").value;
                const btn      = signupForm.querySelector("button[type=submit]");

                if (!name || !phone || !password) {
                    return showToast("All fields are required.", "error");
                }

                btn.textContent = "Creating account...";
                btn.disabled = true;

                try {
                    await api.signup(name, phone, password, "");
                    btn.textContent = "Sign Up";
                    btn.disabled = false;
                    await startApp();
                } catch (err) {
                    btn.textContent = "Sign Up";
                    btn.disabled = false;
                    showToast(err.message || "Signup failed. Try a different phone number.", "error");
                }
            });
        }
    }

    function showAuthScreen(type) {
        document.getElementById("login-section").style.display  = type === "login"  ? "block" : "none";
        document.getElementById("signup-section").style.display = type === "signup" ? "block" : "none";
    }

    function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        if (clockDisplay) {
            clockDisplay.textContent = `${hours}:${minutes} ${ampm} - ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
        }
    }

    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================
    function showToast(message, type = "info") {
        // Create a simple toast notification
        let toastContainer = document.getElementById("pf-toast-container");
        if (!toastContainer) {
            toastContainer = document.createElement("div");
            toastContainer.id = "pf-toast-container";
            toastContainer.style.cssText = `
                position: fixed; bottom: 24px; right: 24px; z-index: 9999;
                display: flex; flex-direction: column; gap: 8px;
            `;
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement("div");
        const bgColor = type === "error" ? "#EF4444" : type === "success" ? "#22C55E" : "#3B82F6";
        toast.style.cssText = `
            background: ${bgColor}; color: white; padding: 12px 16px;
            border-radius: 6px; font-size: 13px; max-width: 320px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: pf-slide-in 0.2s ease;
        `;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.3s";
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==========================================
    // EVENT BINDINGS
    // ==========================================
    function bindEvents() {
        sidebarToggle.addEventListener("click", toggleSidebar);

        navItems.forEach(item => {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                switchScreen(item.getAttribute("data-screen"));
            });
        });

        detailsCloseBtn.addEventListener("click", closeDetailsPanel);

        detailPrinterRefresh.addEventListener("click", async () => {
            detailPrinterRefresh.classList.add("loading");
            await populatePrintersDropdown();
            updateSelectedPrinterBox();
            detailPrinterRefresh.classList.remove("loading");
            showToast("Printers refreshed.", "success");
        });

        detailPrinterSelect.addEventListener("change", () => {
            selectedJobIds.forEach(id => {
                const job = jobs.find(j => j.id === id);
                if (job) { job.settings.printer = detailPrinterSelect.value; recalculateJobCosts(job); }
            });
            updateSelectedPrinterBox();
            if (selectedJobIds.length === 1) recalculatePanelCosts(jobs.find(j => j.id === selectedJobIds[0]));
        });

        detailPrinterTest.addEventListener("click", () => {
            if (!detailPrinterSelect.value) return showToast("No printer selected.", "error");
            showToast(`Test page sent to ${detailPrinterSelect.value}`, "info");
        });

        const printConfigInputs = [
            detailConfigCopies, detailConfigColor, detailConfigDuplex, detailConfigPageselect,
            detailConfigPagerange, detailConfigSize, detailConfigOrientation, detailConfigQuality,
            detailConfigPagesPerSheet, detailConfigScaleType, detailConfigScalePct
        ];

        printConfigInputs.forEach(input => {
            if (!input) return;
            input.addEventListener("input", () => {
                detailCustomPagesGroup.style.display = detailConfigPageselect.value === "custom" ? "block" : "none";
                detailConfigScalePct.style.display   = detailConfigScaleType.value === "custom" ? "block" : "none";
                savePanelInputsToJob();
                if (selectedJobIds.length === 1) recalculatePanelCosts(jobs.find(j => j.id === selectedJobIds[0]));
            });
        });

        if (detailPreviewZoomIn) {
            detailPreviewZoomIn.addEventListener("click", () => {
                if (drawerPreviewState.zoom < 200) { drawerPreviewState.zoom += 10; applyPanelPreviewTransforms(); }
            });
        }
        if (detailPreviewZoomOut) {
            detailPreviewZoomOut.addEventListener("click", () => {
                if (drawerPreviewState.zoom > 50) { drawerPreviewState.zoom -= 10; applyPanelPreviewTransforms(); }
            });
        }

        detailActionPrintNow.addEventListener("click", dispatchActiveJobSpooler);

        detailActionSaveSettings.addEventListener("click", async () => {
            savePanelInputsToJob();

            // Persist costs to backend for each selected job
            for (const id of selectedJobIds) {
                const job = jobs.find(j => j.id === id);
                if (job) {
                    try {
                        await api.updateCost(id, job.amount);
                    } catch (err) {
                        console.warn("Failed to save cost for job", id, err.message);
                    }
                }
            }

            renderQueueTable();
            showToast(`Settings saved for ${selectedJobIds.length} job(s).`, "success");
        });

        // Batch status action buttons
        detailActionPause.addEventListener("click", () =>
            selectedJobIds.forEach(id => updateJobStatusField(id, "paused")));
        detailActionResume.addEventListener("click", () =>
            selectedJobIds.forEach(id => updateJobStatusField(id, "printing")));
        detailActionCancel.addEventListener("click", () =>
            selectedJobIds.forEach(id => updateJobStatusField(id, "cancelled")));
        detailActionComplete.addEventListener("click", () =>
            selectedJobIds.forEach(id => updateJobStatusField(id, "completed")));

        detailActionReprint.addEventListener("click", async () => {
            for (const id of selectedJobIds) {
                const orig = jobs.find(j => j.id === id);
                if (!orig) continue;

                try {
                    const newJob = await api.createManualJob({
                        customer_name: orig.customer,
                        sender_phone: orig.phone,
                        pages: orig.pages,
                        source: "manual",
                        notes: `Reprint of #${orig.id}`
                    });
                    if (newJob) {
                        const normalized = api.normalizeJob(newJob);
                        recalculateJobCosts(normalized);
                        jobs.unshift(normalized);
                    }
                } catch (err) {
                    console.error("Reprint failed:", err.message);
                    // Optimistic local clone as fallback
                    const cloneId = `LOCAL-${Date.now()}`;
                    const cloned = {
                        ...orig,
                        id: cloneId,
                        time: "Just Now",
                        status: "pending",
                        timeline: [{ time: "Just Now", text: `Reprint from #${orig.id}` }]
                    };
                    jobs.unshift(cloned);
                }
            }
            closeDetailsPanel();
            renderQueueTable();
            renderDashboard();
            showToast(`${selectedJobIds.length} job(s) queued for reprint.`, "success");
        });

        detailActionDownload.addEventListener("click", async () => {
            if (selectedJobIds.length === 0) return;
            const id = selectedJobIds[0];
            try {
                const files = await api.getJobFiles(id);
                if (files.length === 0) return showToast("No files found for this job.", "error");
                files.forEach(file => {
                    const url = api.getFileUrl(file.file_path);
                    if (url) {
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = file.file_name;
                        a.click();
                    }
                });
            } catch (err) {
                showToast("Failed to download files: " + err.message, "error");
            }
        });

        const calcInputs = document.querySelectorAll("#cost-calc-form input");
        calcInputs.forEach(input => input.addEventListener("input", updateCostCalculator));

        const calcButtons = document.querySelectorAll("#cost-calc-form .option-button");
        calcButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const siblings = btn.parentElement.querySelectorAll(".option-button");
                siblings.forEach(s => s.classList.remove("selected"));
                btn.classList.add("selected");
                updateCostCalculator();
            });
        });

        // Queue search
        const searchInput = document.getElementById("queue-search-input");
        if (searchInput) searchInput.addEventListener("input", renderQueueTable);

        // New Order Modal
        const newOrderModal = document.getElementById("modal-new-order");
        document.getElementById("dash-new-order-btn")?.addEventListener("click", () => newOrderModal.classList.add("open"));
        document.getElementById("queue-new-order-btn")?.addEventListener("click", () => newOrderModal.classList.add("open"));
        document.getElementById("modal-new-order-close")?.addEventListener("click", () => newOrderModal.classList.remove("open"));
        document.getElementById("new-order-cancel-btn")?.addEventListener("click", () => newOrderModal.classList.remove("open"));

        document.getElementById("new-order-submit-btn")?.addEventListener("click", async () => {
            const name   = document.getElementById("new-order-customer").value.trim() || "Walk-in Customer";
            const phone  = document.getElementById("new-order-phone").value.trim() || "manual";
            const pages  = parseInt(document.getElementById("new-order-pages").value) || 1;
            const copies = parseInt(document.getElementById("new-order-copies").value) || 1;
            const color  = document.getElementById("new-order-color")?.value || "bw";
            const sides  = document.getElementById("new-order-sides")?.value || "double";
            const size   = document.getElementById("new-order-size")?.value || "a4";

            if (pages < 1) return showToast("Please enter a valid page count.", "error");

            const btn = document.getElementById("new-order-submit-btn");
            btn.textContent = "Creating...";
            btn.disabled = true;

            try {
                const newJob = await api.createManualJob({
                    customer_name: name,
                    sender_phone: phone,
                    pages,
                    source: "manual",
                    notes: ""
                });

                if (newJob) {
                    const normalized = api.normalizeJob(newJob);
                    // Apply front-end print settings from modal
                    normalized.copies = copies;
                    normalized.settings.copies = copies;
                    normalized.settings.color = color;
                    normalized.settings.duplex = sides;
                    normalized.settings.size = size;
                    recalculateJobCosts(normalized);
                    jobs.unshift(normalized);
                }

                newOrderModal.classList.remove("open");
                renderDashboard();
                renderQueueTable();
                showToast(`Job created for ${name}`, "success");
            } catch (err) {
                showToast("Failed to create job: " + err.message, "error");
            } finally {
                btn.textContent = "Submit Order";
                btn.disabled = false;
            }
        });

        // Logout button (if present)
        document.getElementById("logout-btn")?.addEventListener("click", () => {
            api.logout();
            location.reload();
        });
    }

    // ==========================================
    // UI NAVIGATION
    // ==========================================
    function toggleSidebar() {
        sidebarCollapsed = !sidebarCollapsed;
        sidebar.classList.toggle("collapsed", sidebarCollapsed);
        lucide.createIcons();
    }

    function switchScreen(screenId) {
        activeScreen = screenId;
        navItems.forEach(item => {
            item.classList.toggle("active", item.getAttribute("data-screen") === screenId);
        });
        screens.forEach(screen => {
            screen.classList.toggle("active", screen.getAttribute("id") === `screen-${screenId}`);
        });
        if (screenId === "dashboard")   renderDashboard();
        else if (screenId === "print-queue") renderQueueTable();
    }

    // ==========================================
    // PRINTER FETCHING
    // ==========================================
    async function populatePrintersDropdown() {
        try {
            printers = await ipcRenderer.invoke("get-printers");
            if (!printers || printers.length === 0) {
                detailPrinterSelect.innerHTML = `<option disabled selected>No printers found on OS</option>`;
                return;
            }
            detailPrinterSelect.innerHTML = printers
                .map(p => `<option value="${p.name}">${p.name}${p.isDefault ? " (Default)" : ""}</option>`)
                .join("");
        } catch (error) {
            console.error("get-printers IPC error:", error);
            detailPrinterSelect.innerHTML = `<option disabled selected>Error loading printers</option>`;
        }
    }

    function updateSelectedPrinterBox() {
        const p = printers.find(x => x.name === detailPrinterSelect.value);
        if (p && detailSpoolPrinterName) detailSpoolPrinterName.textContent = p.name;
    }

    // ==========================================
    // DASHBOARD & QUEUE UI RENDERING
    // ==========================================
    function renderDashboard() {
        const totalToday = jobs.length;
        const pending    = jobs.filter(j => j.status === "pending").length;
        const revenue    = jobs.reduce((sum, j) => sum + (j.amount || 0), 0);

        const statTotal   = document.getElementById("stat-total-orders");
        const statPending = document.getElementById("stat-pending-jobs");
        const statRevenue = document.getElementById("stat-revenue");

        if (statTotal)   statTotal.textContent   = totalToday;
        if (statPending) statPending.textContent  = pending;
        if (statRevenue) statRevenue.textContent  = `$${revenue.toFixed(2)}`;

        const incomingContainer = document.getElementById("incoming-jobs-list");
        const pill              = document.getElementById("incoming-jobs-pill");
        const pillCount         = document.getElementById("incoming-jobs-count");

        if (!incomingContainer) return;

        if (incomingJobs.length === 0) {
            incomingContainer.innerHTML = `<div style="padding:40px;text-align:center;color:#64748B;">No incoming files</div>`;
            if (pill) pill.style.display = "none";
            return;
        }

        if (pill) pill.style.display = "flex";
        if (pillCount) pillCount.textContent = `${incomingJobs.length} New Jobs`;

        let html = '<div class="job-widget-list">';
        incomingJobs.forEach((job, idx) => {
            html += `
                <div class="job-widget-item">
                    <div class="job-widget-details">
                        <span class="job-widget-client">${job.client}</span>
                        <span style="font-size:11px;color:#64748B;">${job.source} · ${job.pages}p · ${job.time}</span>
                    </div>
                    <div class="job-widget-right">
                        <button class="btn-primary" onclick="acceptIncomingJob(${idx})" style="padding:4px 10px;font-size:11px;">Accept</button>
                    </div>
                </div>`;
        });
        incomingContainer.innerHTML = html + "</div>";
        lucide.createIcons();
    }

    window.acceptIncomingJob = function (index) {
        const incoming = incomingJobs[index];
        if (!incoming) return;

        // If it came from a real socket event, it may already be in DB
        // Just move it to queue locally
        const normalized = incoming.rawData
            ? api.normalizeJob({
                job_id: incoming.jobId,
                customer_name: incoming.client,
                sender_phone: incoming.client,
                source: incoming.source,
                total_pages: incoming.pages,
                file_count: incoming.filesCount,
                status: "pending",
                cost_of_job: 0,
                created_at: new Date().toISOString()
            })
            : {
                id: `INC-${Date.now()}`,
                customer: incoming.client,
                phone: "N/A",
                fileName: incoming.preview || "document",
                filePath: null,
                fileType: "pdf",
                fileSize: "N/A",
                pages: incoming.pages,
                copies: 1,
                amount: 0,
                source: incoming.source,
                time: "Just Now",
                status: "pending",
                priority: "medium",
                notes: "",
                settings: {
                    printer: printers.length > 0 ? printers[0].name : "",
                    copies: 1, color: "bw", duplex: "double",
                    pageselect: "all", pagerange: "All", size: "a4",
                    orientation: "portrait", quality: "standard",
                    pagesPerSheet: "1", scaleType: "fit", scalePct: 100
                },
                timeline: [{ time: "Just Now", text: `Accepted from ${incoming.source}` }]
            };

        recalculateJobCosts(normalized);
        jobs.unshift(normalized);
        incomingJobs.splice(index, 1);
        renderDashboard();
        renderQueueTable();
    };

    function renderQueueTable() {
        const tableBody = document.getElementById("queue-table-body");
        if (!tableBody) return;

        const searchVal = (document.getElementById("queue-search-input")?.value || "").trim().toLowerCase();
        const filteredJobs = jobs.filter(job =>
            job.customer.toLowerCase().includes(searchVal) ||
            job.id.toLowerCase().includes(searchVal) ||
            (job.fileName || "").toLowerCase().includes(searchVal)
        );

        if (filteredJobs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px 0;color:#64748B;">No print jobs found</td></tr>`;
            return;
        }

        let tableRows = "";
        filteredJobs.forEach(job => {
            const isSelected = selectedJobIds.includes(job.id);
            tableRows += `
                <tr data-id="${job.id}" ${isSelected ? 'class="selected"' : ""}>
                    <td><label class="checkbox-container" onclick="event.stopPropagation();">
                        <input type="checkbox" class="row-checkbox" data-id="${job.id}" ${isSelected ? "checked" : ""}>
                        <span class="checkmark"></span></label></td>
                    <td style="font-weight:600;">${job.id}</td>
                    <td>${job.phone}</td>
                    <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${job.customer}</td>
                    <td>${job.fileType}</td>
                    <td>${job.pages}</td>
                    <td>${job.time}</td>
                    <td><span class="status-badge ${job.status}">${job.status}</span></td>
                    <td style="font-weight:700;">$${(job.amount || 0).toFixed(2)}</td>
                    <td><span class="priority-badge ${job.priority}">${job.priority}</span></td>
                    <td onclick="event.stopPropagation();">
                        <div class="table-actions" style="justify-content:center;">
                            <button class="btn-icon-sm btn-row-view" data-id="${job.id}">
                                <i data-lucide="sliders-horizontal"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        });

        tableBody.innerHTML = tableRows;

        const bulkActions = document.getElementById("queue-bulk-actions");
        if (bulkActions) {
            bulkActions.style.display = selectedJobIds.length > 0 ? "flex" : "none";
            const countEl = document.getElementById("bulk-selected-count");
            if (countEl) countEl.textContent = `${selectedJobIds.length} items selected`;
        }

        const selectAllCb = document.getElementById("queue-select-all");
        if (selectAllCb) {
            selectAllCb.checked = selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0;
            selectAllCb.onchange = (e) => {
                selectedJobIds = e.target.checked ? filteredJobs.map(j => j.id) : [];
                renderQueueTable();
                selectedJobIds.length > 0 ? openDetailsPanel() : closeDetailsPanel();
            };
        }

        tableBody.querySelectorAll(".row-checkbox").forEach(cb => {
            cb.addEventListener("change", (e) => {
                const id = e.target.getAttribute("data-id");
                if (e.target.checked && !selectedJobIds.includes(id)) selectedJobIds.push(id);
                else selectedJobIds = selectedJobIds.filter(jobId => jobId !== id);
                renderQueueTable();
                selectedJobIds.length > 0 ? openDetailsPanel() : closeDetailsPanel();
            });
        });

        tableBody.querySelectorAll("tr[data-id]").forEach(row => {
            row.addEventListener("click", () => {
                const id = row.getAttribute("data-id");
                if (id) {
                    selectedJobIds = [id];
                    renderQueueTable();
                    openDetailsPanel();
                }
            });
        });

        tableBody.querySelectorAll(".btn-row-view").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-id");
                if (id) {
                    selectedJobIds = [id];
                    renderQueueTable();
                    openDetailsPanel();
                }
            });
        });

        lucide.createIcons();
    }

    // ==========================================
    // REAL-TIME SPOOLING & PRINTING
    // ==========================================
    async function dispatchActiveJobSpooler() {
        if (selectedJobIds.length === 0) return;
        const printerName = detailPrinterSelect.value;
        if (!printerName) return showToast("No valid printer selected.", "error");

        savePanelInputsToJob();
        detailActionPrintNow.disabled = true;

        for (const id of selectedJobIds) {
            const activeJob = jobs.find(j => j.id === id);
            if (!activeJob || activeJob.status === "completed") continue;

            activeJob.status = "printing";
            if (detailSpoolProgressLabel) detailSpoolProgressLabel.textContent = `Spooling...`;
            if (detailSpoolProgressBar) detailSpoolProgressBar.style.width = "50%";

            // Persist status to backend
            try { await api.updateStatus(id, "printing"); } catch (_) {}
            renderQueueTable();

            // If there's a real file, print it
            const filePath = activeJob.filePath;
            if (filePath) {
                try {
                    await ipcRenderer.invoke("print-job", {
                        filePath,
                        printerName,
                        copies: parseInt(activeJob.settings.copies),
                        duplex: activeJob.settings.duplex,
                        color: activeJob.settings.color
                    });
                    activeJob.status = "completed";
                    try { await api.updateStatus(id, "completed"); } catch (_) {}
                } catch (err) {
                    console.error("Print IPC error:", err);
                    activeJob.status = "pending";
                    try { await api.updateStatus(id, "pending"); } catch (_) {}
                    showToast(`Print failed for job ${id}: ${err}`, "error");
                }
            } else {
                // No local file (WhatsApp job without downloaded file)
                activeJob.status = "completed";
                try { await api.updateStatus(id, "completed"); } catch (_) {}
            }
        }

        if (detailSpoolProgressLabel) detailSpoolProgressLabel.textContent = "Batch Spooling Finished";
        if (detailSpoolProgressBar) detailSpoolProgressBar.style.width = "100%";
        detailActionPrintNow.disabled = false;

        renderQueueTable();
        renderDashboard();
        openDetailsPanel();
    }

    // ==========================================
    // PANEL UTILITIES
    // ==========================================
    function openDetailsPanel() {
        if (selectedJobIds.length === 0) return closeDetailsPanel();
        const primaryJob = jobs.find(j => j.id === selectedJobIds[0]);
        if (!primaryJob) return;

        if (selectedJobIds.length > 1) {
            detailJobId.textContent       = `Batch Edit (${selectedJobIds.length} Jobs)`;
            detailCustomerName.textContent = "Multiple Customers";
            detailPhoneNumber.textContent  = "---";
            detailDocName.textContent      = "Multiple Documents Selected";
            detailDocMeta.textContent      = "Mixed Formats";
            detailStatusBadge.textContent  = "BATCH MODE";
            detailStatusBadge.className    = "status-badge pending";
            detailCostTotal.textContent    = "Calculated at Print";
        } else {
            detailJobId.textContent        = `Job #${primaryJob.id}`;
            detailCustomerName.textContent = primaryJob.customer;
            detailPhoneNumber.textContent  = primaryJob.phone;
            detailTimestamp.textContent    = primaryJob.time;
            detailStatusBadge.textContent  = primaryJob.status.toUpperCase();
            detailStatusBadge.className    = `status-badge ${primaryJob.status}`;
            detailSource.textContent       = primaryJob.source;
            detailSource.className         = `source-badge ${primaryJob.source}`;
            detailDocName.textContent      = primaryJob.fileName;
            detailDocMeta.textContent      = `${primaryJob.fileType.toUpperCase()}`;
            recalculatePanelCosts(primaryJob);
        }

        detailPrinterSelect.value = primaryJob.settings.printer || (printers.length > 0 ? printers[0].name : "");
        updateSelectedPrinterBox();
        detailConfigCopies.value      = primaryJob.settings.copies;
        detailConfigColor.value       = primaryJob.settings.color;
        detailConfigDuplex.value      = primaryJob.settings.duplex;
        detailConfigPageselect.value  = primaryJob.settings.pageselect;
        detailConfigSize.value        = primaryJob.settings.size;
        detailConfigOrientation.value = primaryJob.settings.orientation;
        detailConfigQuality.value     = primaryJob.settings.quality;

        renderPanelPreviewCanvas(primaryJob);
        detailsPanel.classList.add("open");
        lucide.createIcons();

        // Lazy-load job files if not yet loaded (for WhatsApp jobs)
        if (!primaryJob.filePath && primaryJob.id && !primaryJob.id.startsWith("LOCAL-")) {
            api.getJobFiles(primaryJob.id).then(files => {
                if (files.length > 0) {
                    primaryJob.fileName = files[0].file_name;
                    primaryJob.filePath = api.getFileUrl(files[0].file_path);
                    primaryJob.fileType = files[0].file_type || "document";
                    primaryJob.pages    = files[0].pages || primaryJob.pages;
                    detailDocName.textContent = primaryJob.fileName;
                    detailDocMeta.textContent = primaryJob.fileType.toUpperCase();
                    renderPanelPreviewCanvas(primaryJob);
                }
            }).catch(() => {});
        }
    }

    function savePanelInputsToJob() {
        selectedJobIds.forEach(id => {
            const job = jobs.find(j => j.id === id);
            if (!job) return;
            job.settings.printer     = detailPrinterSelect.value;
            job.settings.copies      = parseInt(detailConfigCopies.value) || 1;
            job.settings.color       = detailConfigColor.value;
            job.settings.duplex      = detailConfigDuplex.value;
            job.settings.pageselect  = detailConfigPageselect.value;
            job.settings.size        = detailConfigSize.value;
            job.settings.orientation = detailConfigOrientation.value;
            job.settings.quality     = detailConfigQuality.value;
            recalculateJobCosts(job);
        });
    }

    function renderPanelPreviewCanvas(primaryJob) {
        if (!detailPreviewCanvas || !primaryJob) return;
        if (detailPreviewPageIndicator) {
            detailPreviewPageIndicator.textContent =
                selectedJobIds.length > 1
                    ? `Previewing 1 of ${selectedJobIds.length} files`
                    : `File Preview`;
        }

        if (primaryJob.filePath) {
            // HTTP URL (from backend) or local file path
            const src = primaryJob.filePath.startsWith("http")
                ? primaryJob.filePath
                : `file:///${primaryJob.filePath.replace(/\\/g, "/")}#toolbar=0&navpanes=0`;
            detailPreviewCanvas.innerHTML = `
                <iframe src="${src}" style="width:100%;height:100%;border:none;border-radius:4px;"></iframe>`;
        } else {
            detailPreviewCanvas.innerHTML = `
                <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                    color:#64748B;font-size:13px;flex-direction:column;gap:8px;">
                    <i data-lucide="file" style="width:32px;height:32px;"></i>
                    <span>File preview unavailable</span>
                </div>`;
            lucide.createIcons();
        }
        applyPanelPreviewTransforms();
    }

    function applyPanelPreviewTransforms() {
        if (detailPreviewCanvas) {
            detailPreviewCanvas.style.transform = `scale(${drawerPreviewState.zoom / 100})`;
        }
    }

    function closeDetailsPanel() {
        detailsPanel.classList.remove("open");
        document.querySelectorAll("#queue-table tbody tr").forEach(r => r.classList.remove("selected"));
    }

    function recalculatePanelCosts(job) {
        const sheets   = Math.ceil(job.pages / (job.settings.duplex === "double" ? 2 : 1));
        const baseRate = job.settings.size === "a3" ? 0.15 : 0.05;
        const colorAdd = job.settings.color === "color" ? 0.35 : 0;
        const subtotal = sheets * (baseRate + colorAdd) * job.settings.copies;
        const gst      = subtotal * 0.18;
        const final    = subtotal + gst;

        if (selectedJobIds.length === 1 && selectedJobIds[0] === job.id) {
            if (detailCostBw)    detailCostBw.textContent    = job.settings.color === "bw"    ? `$${subtotal.toFixed(2)}` : "$0.00";
            if (detailCostColor) detailCostColor.textContent = job.settings.color === "color" ? `$${subtotal.toFixed(2)}` : "$0.00";
            if (detailCostGst)   detailCostGst.textContent   = `$${gst.toFixed(2)}`;
            if (detailCostTotal) detailCostTotal.textContent = `$${final.toFixed(2)}`;
        }
        job.amount = parseFloat(final.toFixed(2));
    }

    function recalculateJobCosts(job) {
        recalculatePanelCosts(job);
    }

    async function updateJobStatusField(jobId, status) {
        const job = jobs.find(j => j.id === jobId);
        if (!job) return;

        job.status = status;

        // Persist to backend
        try {
            await api.updateStatus(jobId, status);
        } catch (err) {
            console.warn(`Failed to update status for job ${jobId}:`, err.message);
            showToast(`Status saved locally. Sync pending.`, "info");
        }

        renderQueueTable();
        renderDashboard();
    }

    function updateCostCalculator() {
        const pages  = parseInt(document.getElementById("calc-pages")?.value) || 1;
        const copies = parseInt(document.getElementById("calc-copies")?.value) || 1;

        const sidesVal = document.querySelector("[data-input=\"calc-sides\"].selected")?.getAttribute("data-value");
        const colorVal = document.querySelector("[data-input=\"calc-color\"].selected")?.getAttribute("data-value");
        const sizeVal  = document.querySelector("[data-input=\"calc-size\"].selected")?.getAttribute("data-value");

        if (!sidesVal) return;

        const sheets      = sidesVal === "double" ? Math.ceil(pages / 2) : pages;
        const baseRate    = sizeVal === "a3" ? 0.15 : 0.05;
        const colorAdd    = colorVal === "color" ? 0.30 : 0;
        const totalAmount = parseFloat((sheets * (baseRate + colorAdd) * copies).toFixed(2));

        const display = document.getElementById("calc-total-display");
        if (display) display.textContent = `$${totalAmount.toFixed(2)}`;
    }

    init();
});
