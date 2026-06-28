const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  let sidebarCollapsed = false;
  let activeScreen = 'dashboard';
  let activeSettingsTab = 'general';
  
  let isAuthenticated = false; // Auth state flag

  let printers = [];

  // Mock Data
  let jobs = [
    {
      id: 'PF-1082', customer: 'Siddharth Rao', phone: '+91 98765 43210', fileName: 'resume_siddharth.pdf',
      filePath: __dirname + '/dummy.pdf', fileType: 'pdf', fileSize: '1.2 MB', pages: 18, copies: 1, amount: 2.12, 
      source: 'whatsapp', time: '12:31 PM', status: 'pending', priority: 'high', notes: 'Please print on 80GSM.',
      settings: { printer: '', copies: 1, color: 'bw', duplex: 'double', pageselect: 'all', pagerange: 'All', size: 'a4', orientation: 'portrait', quality: 'standard', pagesPerSheet: '1', scaleType: 'fit', scalePct: 100 },
      timeline: [{ time: '12:31 PM', text: 'Job received via WhatsApp' }]
    },
    {
      id: 'PF-1081', customer: 'Anya Chen', phone: '+1 (555) 019-2834', fileName: 'tax_return_2025.pdf',
      filePath: __dirname + '/dummy.pdf', fileType: 'pdf', fileSize: '4.5 MB', pages: 12, copies: 2, amount: 9.91,
      source: 'email', time: '11:15 AM', status: 'printing', priority: 'medium', notes: 'Confidential.',
      settings: { printer: '', copies: 2, color: 'color', duplex: 'single', pageselect: 'all', pagerange: 'All', size: 'a4', orientation: 'portrait', quality: 'high', pagesPerSheet: '1', scaleType: 'actual', scalePct: 100 },
      timeline: [{ time: '11:15 AM', text: 'Job received via Email attachment' }]
    }
  ];

  let incomingJobs = [
    { client: 'Sarah Jenkins', source: 'whatsapp', time: 'Just now', filesCount: 3, pages: 12, preview: 'poster_draft_a3.pdf' },
    { client: 'James Sterling', source: 'email', time: '5 mins ago', filesCount: 1, pages: 42, preview: 'contract_lease.pdf' }
  ];

  let activities = [
    { time: '12:31 PM', type: 'pending', text: 'Job <strong>#PF-1082</strong> queued from Siddharth Rao (WhatsApp)' }
  ];

  let selectedJobIds = []; // CRITICAL FIX: Renamed to selectedJobIds
  let activePreviewFile = { name: 'invoice_template.pdf', type: 'pdf', zoom: 100, rotation: 0, page: 1, maxPages: 1 };
  let drawerPreviewState = { page: 1, maxPages: 1, zoom: 100 };

  // ==========================================
  // DOM ELEMENT SELECTORS
  // ==========================================
  const appContainer = document.getElementById('main-app-container');
  const authContainer = document.getElementById('auth-container');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const toggleToSignup = document.getElementById('toggle-to-signup');
  const toggleToLogin = document.getElementById('toggle-to-login');

  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const screens = document.querySelectorAll('.screen-view');
  
  const detailsPanel = document.getElementById('details-panel');
  const detailsCloseBtn = document.getElementById('details-close-btn');
  const detailJobId = document.getElementById('detail-job-id');
  const detailStatusBadge = document.getElementById('detail-status-badge');
  const detailCustomerName = document.getElementById('detail-customer-name');
  const detailPhoneNumber = document.getElementById('detail-phone-number');
  const detailSource = document.getElementById('detail-source');
  const detailTimestamp = document.getElementById('detail-timestamp');
  
  const detailPrinterSelect = document.getElementById('detail-printer-select');
  const detailPrinterRefresh = document.getElementById('detail-printer-refresh');
  const detailPrinterTest = document.getElementById('detail-printer-test');
  const detailSelectedPrinterInfo = document.getElementById('detail-selected-printer-info');

  const detailConfigCopies = document.getElementById('detail-config-copies');
  const detailConfigColor = document.getElementById('detail-config-color');
  const detailConfigDuplex = document.getElementById('detail-config-duplex');
  const detailConfigPageselect = document.getElementById('detail-config-pageselect');
  const detailConfigPagerange = document.getElementById('detail-config-pagerange');
  const detailCustomPagesGroup = document.getElementById('detail-custom-pages-group');
  const detailConfigSize = document.getElementById('detail-config-size');
  const detailConfigOrientation = document.getElementById('detail-config-orientation');
  const detailConfigQuality = document.getElementById('detail-config-quality');
  const detailConfigPagesPerSheet = document.getElementById('detail-config-pages-per-sheet');
  const detailConfigScaleType = document.getElementById('detail-config-scale-type');
  const detailConfigScalePct = document.getElementById('detail-config-scale-pct');

  const detailCostBw = document.getElementById('detail-cost-bw');
  const detailCostColor = document.getElementById('detail-cost-color');
  const detailCostExtra = document.getElementById('detail-cost-extra');
  const detailCostGst = document.getElementById('detail-cost-gst');
  const detailCostTotal = document.getElementById('detail-cost-total');

  const detailDocName = document.getElementById('detail-doc-name');
  const detailDocMeta = document.getElementById('detail-doc-meta');
  const detailPreviewCanvas = document.getElementById('detail-preview-canvas');
  const detailPreviewPageIndicator = document.getElementById('detail-preview-page-indicator');
  const detailPreviewZoomIn = document.getElementById('detail-preview-zoom-in');
  const detailPreviewZoomOut = document.getElementById('detail-preview-zoom-out');

  const detailSpoolPrinterName = document.getElementById('detail-spool-printer-name');
  const detailSpoolProgressLabel = document.getElementById('detail-spool-progress-label');
  const detailSpoolProgressBar = document.getElementById('detail-spool-progress-bar');

  const detailActionPrintNow = document.getElementById('detail-action-print-now');
  const detailActionPreviewMain = document.getElementById('detail-action-preview-main');
  const detailActionPause = document.getElementById('detail-action-pause');
  const detailActionResume = document.getElementById('detail-action-resume');
  const detailActionCancel = document.getElementById('detail-action-cancel');
  const detailActionComplete = document.getElementById('detail-action-complete');
  const detailActionReprint = document.getElementById('detail-action-reprint');
  const detailActionDownload = document.getElementById('detail-action-download');
  const detailActionSaveSettings = document.getElementById('detail-action-save-settings');

  const clockDisplay = document.getElementById('date-time-clock');

  // ==========================================
  // INITIALIZATION & BOOTSTRAP
  // ==========================================
  async function init() {
    lucide.createIcons();
    bindAuthEvents();
    
    if (!isAuthenticated) {
      showAuthScreen('login');
      return;
    }
    startApp();
  }

  async function startApp() {
    authContainer.style.display = 'none';
    appContainer.style.display = 'flex';

    updateClock();
    setInterval(updateClock, 1000);
    
    jobs.forEach(job => recalculateJobCosts(job));
    await populatePrintersDropdown();

    renderDashboard();
    renderQueueTable();
    updateCostCalculator();
    
    bindEvents(); // This will now successfully execute
  }

  // ==========================================
  // AUTHENTICATION LOGIC
  // ==========================================
  function bindAuthEvents() {
    if (toggleToSignup) toggleToSignup.addEventListener('click', (e) => { e.preventDefault(); showAuthScreen('signup'); });
    if (toggleToLogin) toggleToLogin.addEventListener('click', (e) => { e.preventDefault(); showAuthScreen('login'); });

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        isAuthenticated = true; 
        startApp();
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        isAuthenticated = true; 
        startApp();
      });
    }
  }

  function showAuthScreen(type) {
    document.getElementById('login-section').style.display = type === 'login' ? 'block' : 'none';
    document.getElementById('signup-section').style.display = type === 'signup' ? 'block' : 'none';
  }

  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; 
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    clockDisplay.textContent = `${hours}:${minutes} ${ampm} - ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function bindEvents() {
    sidebarToggle.addEventListener('click', toggleSidebar);

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        switchScreen(item.getAttribute('data-screen'));
      });
    });

    detailsCloseBtn.addEventListener('click', closeDetailsPanel);

    detailPrinterRefresh.addEventListener('click', async () => {
      detailPrinterRefresh.classList.add('loading');
      await populatePrintersDropdown();
      updateSelectedPrinterBox();
      detailPrinterRefresh.classList.remove('loading');
      alert('Local hardware ports scanned. Printers refreshed.');
    });

    // Updated to support batch mode
    detailPrinterSelect.addEventListener('change', () => {
      selectedJobIds.forEach(id => {
        const job = jobs.find(j => j.id === id);
        if (job) { job.settings.printer = detailPrinterSelect.value; recalculateJobCosts(job); }
      });
      updateSelectedPrinterBox();
      if(selectedJobIds.length === 1) recalculatePanelCosts(jobs.find(j => j.id === selectedJobIds[0]));
    });

    detailPrinterTest.addEventListener('click', () => {
      if(!detailPrinterSelect.value) return alert('No printer selected');
      alert(`Sent mock calibration test page to ${detailPrinterSelect.value}.`);
    });

    const printConfigInputs = [
      detailConfigCopies, detailConfigColor, detailConfigDuplex, detailConfigPageselect, 
      detailConfigPagerange, detailConfigSize, detailConfigOrientation, detailConfigQuality, 
      detailConfigPagesPerSheet, detailConfigScaleType, detailConfigScalePct
    ];

    printConfigInputs.forEach(input => {
      input.addEventListener('input', () => {
        detailCustomPagesGroup.style.display = detailConfigPageselect.value === 'custom' ? 'block' : 'none';
        detailConfigScalePct.style.display = detailConfigScaleType.value === 'custom' ? 'block' : 'none';
        
        savePanelInputsToJob();
        if(selectedJobIds.length === 1) recalculatePanelCosts(jobs.find(j => j.id === selectedJobIds[0]));
      });
    });

    detailPreviewZoomIn.addEventListener('click', () => {
      if (drawerPreviewState.zoom < 200) { drawerPreviewState.zoom += 10; applyPanelPreviewTransforms(); }
    });

    detailPreviewZoomOut.addEventListener('click', () => {
      if (drawerPreviewState.zoom > 50) { drawerPreviewState.zoom -= 10; applyPanelPreviewTransforms(); }
    });

    detailActionPrintNow.addEventListener('click', dispatchActiveJobSpooler);
    
    detailActionSaveSettings.addEventListener('click', () => {
      savePanelInputsToJob();
      renderQueueTable();
      alert(`Settings saved successfully for ${selectedJobIds.length} job(s).`);
    });

    // Batch Action Operator Updates
    detailActionPause.addEventListener('click', () => selectedJobIds.forEach(id => updateJobStatusField(id, 'paused')));
    detailActionResume.addEventListener('click', () => selectedJobIds.forEach(id => updateJobStatusField(id, 'printing')));
    detailActionCancel.addEventListener('click', () => selectedJobIds.forEach(id => updateJobStatusField(id, 'cancelled')));
    detailActionComplete.addEventListener('click', () => selectedJobIds.forEach(id => updateJobStatusField(id, 'completed')));

    detailActionReprint.addEventListener('click', () => {
      selectedJobIds.forEach(id => {
        const orig = jobs.find(j => j.id === id);
        if (orig) {
          const cloneId = `PF-${Math.floor(1000 + Math.random() * 9000)}`;
          const cloned = { ...orig, id: cloneId, time: 'Just Now', status: 'pending', timeline: [{ time: 'Just Now', text: `Reprint cloned from #${orig.id}` }] };
          jobs.unshift(cloned);
        }
      });
      closeDetailsPanel();
      renderQueueTable();
      renderDashboard();
      alert(`Cloned ${selectedJobIds.length} jobs for reprinting!`);
    });

    detailActionDownload.addEventListener('click', () => alert(`Downloading files to local machine...`));

    const calcInputs = document.querySelectorAll('#cost-calc-form input');
    calcInputs.forEach(input => input.addEventListener('input', updateCostCalculator));

    const calcButtons = document.querySelectorAll('#cost-calc-form .option-button');
    calcButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const siblings = btn.parentElement.querySelectorAll('.option-button');
        siblings.forEach(s => s.classList.remove('selected'));
        btn.classList.add('selected');
        updateCostCalculator();
      });
    });

    // New Order Modal Toggles
    const newOrderModal = document.getElementById('modal-new-order');
    document.getElementById('dash-new-order-btn')?.addEventListener('click', () => newOrderModal.classList.add('open'));
    document.getElementById('queue-new-order-btn')?.addEventListener('click', () => newOrderModal.classList.add('open'));
    document.getElementById('modal-new-order-close')?.addEventListener('click', () => newOrderModal.classList.remove('open'));
    document.getElementById('new-order-cancel-btn')?.addEventListener('click', () => newOrderModal.classList.remove('open'));
    
    document.getElementById('new-order-submit-btn')?.addEventListener('click', () => {
      const name = document.getElementById('new-order-customer').value.trim() || 'Walk-in Customer';
      const pages = parseInt(document.getElementById('new-order-pages').value) || 1;
      if (pages <= 0) return;

      const newJobId = `PF-${1080 + jobs.length + 1}`;
      const newJob = {
        id: newJobId, customer: name, phone: document.getElementById('new-order-phone').value.trim() || 'N/A',
        fileName: `submitted_document_${newJobId.toLowerCase()}.pdf`, fileType: 'pdf', filePath: __dirname + '/dummy.pdf', 
        fileSize: '1.0 MB', pages: pages, copies: parseInt(document.getElementById('new-order-copies').value) || 1, amount: 0.0,
        source: 'manual', time: 'Just Now', status: 'pending', priority: 'medium', notes: '',
        settings: {
          printer: detailPrinterSelect.options.length > 0 ? detailPrinterSelect.options[0].value : '',
          copies: parseInt(document.getElementById('new-order-copies').value) || 1,
          color: document.getElementById('new-order-color').value,
          duplex: document.getElementById('new-order-sides').value,
          pageselect: 'all', pagerange: 'All', size: document.getElementById('new-order-size').value,
          orientation: 'portrait', quality: 'standard', pagesPerSheet: '1', scaleType: 'fit', scalePct: 100
        },
        timeline: [{ time: 'Just Now', text: 'Job entered manually' }]
      };

      recalculateJobCosts(newJob);
      jobs.unshift(newJob);
      newOrderModal.classList.remove('open');
      renderDashboard();
      renderQueueTable();
    });
  }

  // ==========================================
  // UI NAVIGATION
  // ==========================================
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
    lucide.createIcons();
  }

  function switchScreen(screenId) {
    activeScreen = screenId;
    navItems.forEach(item => {
      if (item.getAttribute('data-screen') === screenId) item.classList.add('active');
      else item.classList.remove('active');
    });
    screens.forEach(screen => {
      if (screen.getAttribute('id') === `screen-${screenId}`) screen.classList.add('active');
      else screen.classList.remove('active');
    });
    if (screenId === 'dashboard') renderDashboard();
    else if (screenId === 'print-queue') renderQueueTable();
  }

  // ==========================================
  // REAL PRINTERS FETCHING & POPULATION
  // ==========================================
  async function populatePrintersDropdown() {
    try {
      printers = await ipcRenderer.invoke('get-printers');
      if (printers.length === 0) {
        detailPrinterSelect.innerHTML = `<option disabled selected>No printers found on OS</option>`;
        return;
      }
      let options = '';
      printers.forEach(p => {
        options += `<option value="${p.name}">${p.name}${p.isDefault ? ' (Default)' : ''}</option>`;
      });
      detailPrinterSelect.innerHTML = options;
    } catch (error) {
      detailPrinterSelect.innerHTML = `<option disabled selected>Error loading printers</option>`;
    }
  }

  function updateSelectedPrinterBox() {
    const p = printers.find(x => x.name === detailPrinterSelect.value);
    if (!p) return;
    detailSpoolPrinterName.textContent = p.name;
  }

  // ==========================================
  // DASHBOARD & QUEUE UI RENDERING
  // ==========================================
  function renderDashboard() {
    const totalToday = jobs.length;
    const pending = jobs.filter(j => j.status === 'pending').length;
    
    document.getElementById('stat-total-orders').textContent = totalToday;
    document.getElementById('stat-pending-jobs').textContent = pending;
    
    const incomingContainer = document.getElementById('incoming-jobs-list');
    if (incomingJobs.length === 0) {
      incomingContainer.innerHTML = `<div style="padding: 40px; text-align: center;">No incoming files</div>`;
      document.getElementById('incoming-jobs-pill').style.display = 'none';
      return;
    }
    
    document.getElementById('incoming-jobs-pill').style.display = 'flex';
    document.getElementById('incoming-jobs-count').textContent = `${incomingJobs.length} New Jobs`;

    let html = '<div class="job-widget-list">';
    incomingJobs.forEach((job, idx) => {
      html += `
        <div class="job-widget-item">
          <div class="job-widget-details"><span class="job-widget-client">${job.client}</span></div>
          <div class="job-widget-right"><button class="btn-primary" onclick="acceptIncomingJob(${idx})" style="padding: 4px 10px; font-size: 11px;">Accept</button></div>
        </div>
      `;
    });
    incomingContainer.innerHTML = html + '</div>';
    lucide.createIcons();
  }

  window.acceptIncomingJob = function(index) {
    const job = incomingJobs[index];
    const newId = `PF-${1080 + jobs.length + 1}`;
    
    const newJob = {
      id: newId, customer: job.client, phone: 'N/A', fileName: job.preview,
      filePath: __dirname + '/dummy.pdf', fileType: 'pdf', fileSize: '1MB', pages: job.pages, copies: 1, amount: 0.0,
      source: job.source, time: 'Just Now', status: 'pending', priority: 'medium', notes: '',
      settings: { printer: printers.length > 0 ? printers[0].name : '', copies: 1, color: 'bw', duplex: 'double', pageselect: 'all', pagerange: 'All', size: 'a4', orientation: 'portrait', quality: 'standard', pagesPerSheet: '1', scaleType: 'fit', scalePct: 100 },
      timeline: []
    };
    recalculateJobCosts(newJob);
    jobs.unshift(newJob);
    incomingJobs.splice(index, 1);
    renderDashboard();
  }

  function renderQueueTable() {
    const tableBody = document.getElementById('queue-table-body');
    const searchVal = (document.getElementById('queue-search-input')?.value || '').trim().toLowerCase();
    
    const filteredJobs = jobs.filter(job => job.customer.toLowerCase().includes(searchVal) || job.fileName.toLowerCase().includes(searchVal));

    if (filteredJobs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 40px 0;">No print jobs found</td></tr>`;
      return;
    }

    let tableRows = '';
    filteredJobs.forEach(job => {
      const isSelected = selectedJobIds.includes(job.id); // Valid reference now!
      tableRows += `
        <tr data-id="${job.id}" ${isSelected ? 'class="selected"' : ''}>
          <td><label class="checkbox-container" onclick="event.stopPropagation();"><input type="checkbox" class="row-checkbox" data-id="${job.id}" ${isSelected ? 'checked' : ''}><span class="checkmark"></span></label></td>
          <td style="font-weight: 600;">${job.id}</td>
          <td>${job.phone}</td>
          <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${job.fileName}</td>
          <td>${job.fileType}</td>
          <td>${job.pages}</td>
          <td>${job.time}</td>
          <td><span class="status-badge ${job.status}">${job.status}</span></td>
          <td style="font-weight: 700;">$${job.amount.toFixed(2)}</td>
          <td><span class="priority-badge ${job.priority}">${job.priority}</span></td>
          <td onclick="event.stopPropagation();">
            <div class="table-actions" style="justify-content: center;">
              <button class="btn-icon-sm btn-row-view" data-id="${job.id}"><i data-lucide="sliders-horizontal"></i></button>
            </div>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = tableRows;

    const bulkActions = document.getElementById('queue-bulk-actions');
    if (selectedJobIds.length > 0) {
      bulkActions.style.display = 'flex';
      document.getElementById('bulk-selected-count').textContent = `${selectedJobIds.length} items selected`;
    } else {
      bulkActions.style.display = 'none';
    }

    const selectAllCb = document.getElementById('queue-select-all');
    if (selectAllCb) {
      selectAllCb.checked = selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0;
      selectAllCb.onchange = (e) => {
        selectedJobIds = e.target.checked ? filteredJobs.map(j => j.id) : [];
        renderQueueTable();
        selectedJobIds.length > 0 ? openDetailsPanel() : closeDetailsPanel();
      };
    }

    tableBody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        if (e.target.checked && !selectedJobIds.includes(id)) selectedJobIds.push(id);
        else selectedJobIds = selectedJobIds.filter(jobId => jobId !== id);
        
        renderQueueTable();
        selectedJobIds.length > 0 ? openDetailsPanel() : closeDetailsPanel();
      });
    });

    tableBody.querySelectorAll('tbody tr, .btn-row-view').forEach(row => {
      row.addEventListener('click', () => {
        selectedJobIds = [row.getAttribute('data-id')];
        renderQueueTable();
        openDetailsPanel();
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
    if (!printerName) return alert("No valid printer selected.");

    savePanelInputsToJob();
    detailActionPrintNow.disabled = true;

    for (const id of selectedJobIds) {
      const activeJob = jobs.find(j => j.id === id);
      if (!activeJob || activeJob.status === 'completed') continue;

      activeJob.status = 'printing';
      detailSpoolProgressLabel.textContent = `Spooling ${activeJob.fileName}...`;
      detailSpoolProgressBar.style.width = '50%';
      renderQueueTable();

      try {
        await ipcRenderer.invoke('print-job', {
          filePath: activeJob.filePath, 
          printerName: printerName,
          copies: parseInt(activeJob.settings.copies),
          duplex: activeJob.settings.duplex,
          color: activeJob.settings.color
        });
        activeJob.status = 'completed';
      } catch (err) {
        activeJob.status = 'pending';
      }
    }

    detailSpoolProgressLabel.textContent = 'Batch Spooling Finished';
    detailSpoolProgressBar.style.width = '100%';
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
      detailJobId.textContent = `Batch Edit (${selectedJobIds.length} Jobs)`;
      detailCustomerName.textContent = "Multiple Customers";
      detailPhoneNumber.textContent = "---";
      detailDocName.textContent = "Multiple Documents Selected";
      detailDocMeta.textContent = "Mixed Formats";
      detailStatusBadge.textContent = "BATCH MODE";
      detailStatusBadge.className = `status-badge pending`;
      detailCostTotal.textContent = "Calculated at Print";
    } else {
      detailJobId.textContent = `Job #${primaryJob.id}`;
      detailCustomerName.textContent = primaryJob.customer;
      detailPhoneNumber.textContent = primaryJob.phone;
      detailTimestamp.textContent = primaryJob.time;
      detailStatusBadge.textContent = primaryJob.status.toUpperCase();
      detailStatusBadge.className = `status-badge ${primaryJob.status}`;
      detailSource.textContent = primaryJob.source;
      detailSource.className = `source-badge ${primaryJob.source}`;
      detailDocName.textContent = primaryJob.fileName;
      detailDocMeta.textContent = `${primaryJob.fileType.toUpperCase()} (${primaryJob.fileSize})`;
      recalculatePanelCosts(primaryJob);
    }

    detailPrinterSelect.value = primaryJob.settings.printer || (printers.length > 0 ? printers[0].name : '');
    updateSelectedPrinterBox();
    detailConfigCopies.value = primaryJob.settings.copies;
    detailConfigColor.value = primaryJob.settings.color;
    detailConfigDuplex.value = primaryJob.settings.duplex;
    detailConfigPageselect.value = primaryJob.settings.pageselect;
    detailConfigSize.value = primaryJob.settings.size;
    detailConfigOrientation.value = primaryJob.settings.orientation;
    detailConfigQuality.value = primaryJob.settings.quality;

    renderPanelPreviewCanvas(primaryJob);
    detailsPanel.classList.add('open');
    lucide.createIcons();
  }

  function savePanelInputsToJob() {
    selectedJobIds.forEach(id => {
      const job = jobs.find(j => j.id === id);
      if (job) {
        job.settings.printer = detailPrinterSelect.value;
        job.settings.copies = parseInt(detailConfigCopies.value) || 1;
        job.settings.color = detailConfigColor.value;
        job.settings.duplex = detailConfigDuplex.value;
        job.settings.pageselect = detailConfigPageselect.value;
        job.settings.size = detailConfigSize.value;
        job.settings.orientation = detailConfigOrientation.value;
        job.settings.quality = detailConfigQuality.value;
        recalculateJobCosts(job);
      }
    });
  }

  function renderPanelPreviewCanvas(primaryJob) {
    if (!primaryJob) return;
    detailPreviewPageIndicator.textContent = selectedJobIds.length > 1 ? `Previewing 1 of ${selectedJobIds.length} files` : `Local File Preview`;
    detailPreviewCanvas.innerHTML = `<iframe src="file:///${primaryJob.filePath.replace(/\\/g, '/')}#toolbar=0&navpanes=0" style="width:100%; height:100%; border:none; border-radius:4px;"></iframe>`;
    applyPanelPreviewTransforms();
  }

  function applyPanelPreviewTransforms() {
    detailPreviewCanvas.style.transform = `scale(${drawerPreviewState.zoom / 100})`;
  }

  function closeDetailsPanel() {
    detailsPanel.classList.remove('open');
    document.querySelectorAll('#queue-table tbody tr').forEach(r => r.classList.remove('selected'));
  }

  function recalculatePanelCosts(job) {
    const sheets = Math.ceil(job.pages / (job.settings.duplex === 'double' ? 2 : 1));
    const subtotal = sheets * (job.settings.size === 'a3' ? 0.15 : 0.05 + (job.settings.color === 'color' ? 0.35 : 0)) * job.settings.copies;
    const final = subtotal + (subtotal * 0.18);
    
    if (selectedJobIds.length === 1 && selectedJobIds[0] === job.id) {
      detailCostBw.textContent = job.settings.color === 'bw' ? `$${subtotal.toFixed(2)}` : '$0.00';
      detailCostColor.textContent = job.settings.color === 'color' ? `$${subtotal.toFixed(2)}` : '$0.00';
      detailCostGst.textContent = `$${(subtotal * 0.18).toFixed(2)}`;
      detailCostTotal.textContent = `$${final.toFixed(2)}`;
    }
    job.amount = parseFloat(final.toFixed(2));
  }

  function recalculateJobCosts(job) { recalculatePanelCosts(job); }

  function updateJobStatusField(jobId, status) {
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      renderQueueTable();
      renderDashboard();
    }
  }

  function updateCostCalculator() {
    const pages = parseInt(document.getElementById('calc-pages')?.value) || 1;
    const copies = parseInt(document.getElementById('calc-copies')?.value) || 1;
    
    const sidesVal = document.querySelector('[data-input="calc-sides"].selected')?.getAttribute('data-value');
    const colorVal = document.querySelector('[data-input="calc-color"].selected')?.getAttribute('data-value');
    const sizeVal = document.querySelector('[data-input="calc-size"].selected')?.getAttribute('data-value');
    
    if(!sidesVal) return;

    const sheets = sidesVal === 'double' ? Math.ceil(pages / 2) : pages;
    const baseRate = sizeVal === 'a3' ? 0.15 : 0.05;
    const totalAmount = parseFloat((sheets * (baseRate + (colorVal === 'color' ? 0.30 : 0)) * copies).toFixed(2));
    
    if (document.getElementById('calc-total-display')) document.getElementById('calc-total-display').textContent = `$${totalAmount.toFixed(2)}`;
  }

  init();
});