/**
 * TrackFlow — Job Application Tracker Frontend & API Inspector
 */

(function () {
  'use strict';

  // ─── State Management ──────────────────────────────────────────────────
  const state = {
    apiKey: localStorage.getItem('trackflow_api_key') || 'my-secret-key-123',
    viewMode: 'kanban', // 'kanban' | 'table'
    page: 1,
    limit: 10,
    sort: '-appliedDate',
    statusFilter: '',
    searchQuery: '',
    applications: [],
    pagination: null,
    stats: null,
    editingApp: null,
    inspectorLogs: [],
    selectedLogId: null,
    apiHealth: false,
    dbState: 'disconnected',
  };

  // Valid status transitions matching backend applicationController.js
  const STATUS_TRANSITIONS = {
    Applied: ['Interview', 'Rejected'],
    Interview: ['Offer', 'Rejected'],
    Offer: ['Accepted', 'Rejected'],
    Rejected: [],
    Accepted: [],
  };

  // ─── API Client Wrapper ────────────────────────────────────────────────
  async function apiRequest(endpoint, method = 'GET', body = null) {
    const url = endpoint.startsWith('http') ? endpoint : `${window.location.origin}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Attach API key for protected routes
    if (endpoint.startsWith('/api/applications')) {
      headers['x-api-key'] = state.apiKey;
    }

    const logEntry = {
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toLocaleTimeString(),
      method,
      url,
      headers: { ...headers },
      body,
      status: null,
      statusText: '',
      response: null,
      durationMs: 0,
    };

    const startTime = performance.now();

    try {
      const config = { method, headers };
      if (body) {
        config.body = JSON.stringify(body);
      }

      const res = await fetch(url, config);
      logEntry.durationMs = Math.round(performance.now() - startTime);
      logEntry.status = res.status;
      logEntry.statusText = res.statusText;

      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = { parseError: 'Invalid JSON response from server' };
      }

      logEntry.response = data;
      logApiRequest(logEntry);

      return { status: res.status, ok: res.ok, data };
    } catch (err) {
      logEntry.durationMs = Math.round(performance.now() - startTime);
      logEntry.status = 0;
      logEntry.statusText = 'Network Error';
      logEntry.response = { error: err.message };
      logApiRequest(logEntry);
      return { status: 0, ok: false, data: { message: err.message } };
    }
  }

  // Log API request to inspector
  function logApiRequest(logEntry) {
    state.inspectorLogs.unshift(logEntry);
    if (state.inspectorLogs.length > 50) state.inspectorLogs.pop();
    renderInspectorLogs();
    if (!state.selectedLogId) {
      selectInspectorLog(logEntry.id);
    }
  }

  // ─── DOM Element References ────────────────────────────────────────────
  const el = {
    apiStatusBadge: document.getElementById('api-status-badge'),
    dbStatusBadge: document.getElementById('db-status-badge'),
    keyPreview: document.getElementById('key-preview'),
    btnSeedData: document.getElementById('btn-seed-data'),
    btnApiKeyConfig: document.getElementById('btn-api-key-config'),
    btnToggleInspector: document.getElementById('btn-toggle-inspector'),

    // Stats
    statTotal: document.getElementById('stat-total'),
    statRecentSub: document.getElementById('stat-recent-sub'),
    statApplied: document.getElementById('stat-applied'),
    statInterview: document.getElementById('stat-interview'),
    statOffer: document.getElementById('stat-offer'),
    statAccepted: document.getElementById('stat-accepted'),
    statRejected: document.getElementById('stat-rejected'),
    barApplied: document.getElementById('bar-applied'),
    barInterview: document.getElementById('bar-interview'),
    barOffer: document.getElementById('bar-offer'),
    barAccepted: document.getElementById('bar-accepted'),
    barRejected: document.getElementById('bar-rejected'),

    // Toolbar
    inputSearch: document.getElementById('input-search'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    selectStatusFilter: document.getElementById('select-status-filter'),
    selectSort: document.getElementById('select-sort'),
    btnViewKanban: document.getElementById('btn-view-kanban'),
    btnViewTable: document.getElementById('btn-view-table'),
    btnOpenCreateModal: document.getElementById('btn-open-create-modal'),

    // Views
    kanbanView: document.getElementById('kanban-view'),
    tableView: document.getElementById('table-view'),
    tableBody: document.getElementById('table-body'),
    paginationInfo: document.getElementById('pagination-info'),
    selectPageLimit: document.getElementById('select-page-limit'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),
    pageNumDisplay: document.getElementById('page-num-display'),

    // Modal Application
    modalApplication: document.getElementById('modal-application'),
    modalAppTitle: document.getElementById('modal-app-title'),
    formApplication: document.getElementById('form-application'),
    appId: document.getElementById('app-id'),
    appCompany: document.getElementById('app-company'),
    appJobTitle: document.getElementById('app-jobTitle'),
    appLocation: document.getElementById('app-location'),
    appStatus: document.getElementById('app-status'),
    appAppliedDate: document.getElementById('app-appliedDate'),
    appNotes: document.getElementById('app-notes'),
    workflowBanner: document.getElementById('workflow-banner'),
    workflowAllowedText: document.getElementById('workflow-allowed-text'),
    modalErrorAlert: document.getElementById('modal-error-alert'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    btnCancelModal: document.getElementById('btn-cancel-modal'),

    // Modal API Key
    modalApiKey: document.getElementById('modal-api-key'),
    inputApiKey: document.getElementById('input-api-key'),
    btnToggleKey: document.getElementById('btn-toggle-key'),
    keyTestResult: document.getElementById('key-test-result'),
    btnTestApiKey: document.getElementById('btn-test-api-key'),
    btnSaveApiKey: document.getElementById('btn-save-api-key'),
    btnCloseKeyModal: document.getElementById('btn-close-key-modal'),

    // Inspector
    apiInspector: document.getElementById('api-inspector'),
    drawerToggle: document.getElementById('drawer-toggle'),
    btnMinimizeInspector: document.getElementById('btn-minimize-inspector'),
    btnClearInspector: document.getElementById('btn-clear-inspector'),
    inspectorCountBadge: document.getElementById('inspector-count-badge'),
    inspectorLogList: document.getElementById('inspector-log-list'),
    inspectorLogDetail: document.getElementById('inspector-log-detail'),

    toastContainer: document.getElementById('toast-container'),
  };

  // ─── Initialization ────────────────────────────────────────────────────
  async function init() {
    updateApiKeyDisplay();
    bindEvents();
    await checkHealth();
    await refreshData();

    // Periodically check health every 15s
    setInterval(checkHealth, 15000);
  }

  function updateApiKeyDisplay() {
    if (state.apiKey) {
      const masked = state.apiKey.length > 4 
        ? '••••' + state.apiKey.slice(-4) 
        : state.apiKey;
      el.keyPreview.textContent = masked;
    } else {
      el.keyPreview.textContent = 'None';
    }
  }

  // ─── Backend Health Check ──────────────────────────────────────────────
  async function checkHealth() {
    const res = await apiRequest('/api/health');
    if (res.ok && res.data.success) {
      state.apiHealth = true;
      state.dbState = res.data.dbState || 'connected';
      
      el.apiStatusBadge.innerHTML = `
        <span class="status-dot online"></span>
        <span class="status-label">API Online</span>
      `;

      if (state.dbState === 'connected') {
        el.dbStatusBadge.innerHTML = `
          <span class="status-dot online"></span>
          <span class="status-label">DB Connected</span>
        `;
      } else {
        el.dbStatusBadge.innerHTML = `
          <span class="status-dot yellow"></span>
          <span class="status-label">DB Reconnecting...</span>
        `;
      }
    } else {
      state.apiHealth = false;
      el.apiStatusBadge.innerHTML = `
        <span class="status-dot offline"></span>
        <span class="status-label">API Offline</span>
      `;
      el.dbStatusBadge.innerHTML = `
        <span class="status-dot offline"></span>
        <span class="status-label">DB Offline</span>
      `;
    }
  }

  // ─── Refresh All Data ──────────────────────────────────────────────────
  async function refreshData() {
    await Promise.all([loadStats(), loadApplications()]);
  }

  // Load Dashboard Statistics
  async function loadStats() {
    const res = await apiRequest('/api/applications/stats');
    if (res.ok && res.data.success) {
      state.stats = res.data.data;
      renderStats();
    } else if (res.status === 401) {
      showToast('Unauthorized — Invalid API key. Click API Key button to configure.', 'error');
    }
  }

  function renderStats() {
    if (!state.stats) return;

    const { total, statusSummary, mostRecentApplication } = state.stats;

    el.statTotal.textContent = total;
    el.statApplied.textContent = statusSummary.Applied || 0;
    el.statInterview.textContent = statusSummary.Interview || 0;
    el.statOffer.textContent = statusSummary.Offer || 0;
    el.statAccepted.textContent = statusSummary.Accepted || 0;
    el.statRejected.textContent = statusSummary.Rejected || 0;

    // Subtitle recent
    if (mostRecentApplication) {
      const dateStr = new Date(mostRecentApplication.appliedDate || mostRecentApplication.createdAt).toLocaleDateString();
      el.statRecentSub.textContent = `Latest: ${mostRecentApplication.company} (${dateStr})`;
    } else {
      el.statRecentSub.textContent = 'No applications recorded';
    }

    // Bar percentages
    const maxVal = total > 0 ? total : 1;
    el.barApplied.style.width = `${((statusSummary.Applied || 0) / maxVal) * 100}%`;
    el.barInterview.style.width = `${((statusSummary.Interview || 0) / maxVal) * 100}%`;
    el.barOffer.style.width = `${((statusSummary.Offer || 0) / maxVal) * 100}%`;
    el.barAccepted.style.width = `${((statusSummary.Accepted || 0) / maxVal) * 100}%`;
    el.barRejected.style.width = `${((statusSummary.Rejected || 0) / maxVal) * 100}%`;
  }

  // Load Applications List
  async function loadApplications() {
    const queryParams = new URLSearchParams();
    queryParams.append('page', state.page);
    queryParams.append('limit', state.limit);
    queryParams.append('sort', state.sort);

    if (state.statusFilter) queryParams.append('status', state.statusFilter);
    if (state.searchQuery) {
      // API supports searching by company or jobTitle
      queryParams.append('company', state.searchQuery);
    }

    const res = await apiRequest(`/api/applications?${queryParams.toString()}`);
    if (res.ok && res.data.success) {
      state.applications = res.data.data;
      state.pagination = res.data.pagination;
      renderCurrentView();
    } else if (res.status === 401) {
      state.applications = [];
      renderCurrentView();
    }
  }

  function renderCurrentView() {
    if (state.viewMode === 'kanban') {
      renderKanbanView();
    } else {
      renderTableView();
    }
  }

  // ─── Render Kanban View ────────────────────────────────────────────────
  function renderKanbanView() {
    const statuses = ['Applied', 'Interview', 'Offer', 'Accepted', 'Rejected'];

    statuses.forEach((status) => {
      const cardsContainer = document.getElementById(`cards-${status}`);
      const countEl = document.getElementById(`count-col-${status.toLowerCase()}`);
      if (!cardsContainer) return;

      const items = state.applications.filter((a) => a.status === status);
      if (countEl) countEl.textContent = items.length;

      if (items.length === 0) {
        cardsContainer.innerHTML = `<div class="empty-col-message">No ${status} applications</div>`;
        return;
      }

      cardsContainer.innerHTML = items
        .map((app) => {
          const allowedTransitions = STATUS_TRANSITIONS[app.status] || [];
          const dateFormatted = app.appliedDate 
            ? new Date(app.appliedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : 'No date';

          let transitionButtonsHtml = '';
          if (allowedTransitions.length > 0) {
            transitionButtonsHtml = allowedTransitions
              .map(
                (target) => `
                <button type="button" class="btn-transition btn-trans-${target.toLowerCase()}" 
                  data-action="transition" data-id="${app._id}" data-target="${target}">
                  ➜ ${target}
                </button>
              `
              )
              .join('');
          } else {
            transitionButtonsHtml = `<span class="terminal-badge">Terminal Status</span>`;
          }

          return `
            <div class="app-card" data-id="${app._id}">
              <div class="card-company">${escapeHtml(app.company)}</div>
              <div class="card-role">${escapeHtml(app.jobTitle)}</div>
              <div class="card-meta">
                <span class="card-location">📍 ${escapeHtml(app.location || 'Remote/Unspecified')}</span>
                <span>📅 ${dateFormatted}</span>
              </div>
              ${
                app.notes
                  ? `<div class="card-notes">${escapeHtml(app.notes)}</div>`
                  : ''
              }
              <div class="card-actions">
                <div class="transition-group">
                  ${transitionButtonsHtml}
                </div>
                <div class="card-btn-group">
                  <button type="button" class="btn-card-icon" data-action="edit" data-id="${app._id}" title="Edit Application">✏️</button>
                  <button type="button" class="btn-card-icon danger" data-action="delete" data-id="${app._id}" title="Delete Application">🗑️</button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    });
  }

  // ─── Render Table View ─────────────────────────────────────────────────
  function renderTableView() {
    if (!state.applications.length) {
      el.tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center" style="padding: 3rem; color: var(--text-dim);">
            No applications match your filter. Click "+ New Application" to add one!
          </td>
        </tr>
      `;
      el.paginationInfo.textContent = 'Showing 0 of 0 applications';
      el.btnPrevPage.disabled = true;
      el.btnNextPage.disabled = true;
      return;
    }

    el.tableBody.innerHTML = state.applications
      .map((app) => {
        const allowedTransitions = STATUS_TRANSITIONS[app.status] || [];
        const dateFormatted = app.appliedDate
          ? new Date(app.appliedDate).toLocaleDateString()
          : '-';

        let transitionButtonsHtml = '';
        if (allowedTransitions.length > 0) {
          transitionButtonsHtml = allowedTransitions
            .map(
              (target) => `
              <button type="button" class="btn-transition btn-trans-${target.toLowerCase()}" 
                data-action="transition" data-id="${app._id}" data-target="${target}">
                ➜ ${target}
              </button>
            `
            )
            .join(' ');
        } else {
          transitionButtonsHtml = `<span class="terminal-badge">Terminal</span>`;
        }

        return `
          <tr>
            <td><strong>${escapeHtml(app.company)}</strong></td>
            <td>${escapeHtml(app.jobTitle)}</td>
            <td>${escapeHtml(app.location || '-')}</td>
            <td><span class="stat-pill pill-${app.status.toLowerCase()}">${app.status}</span></td>
            <td>${dateFormatted}</td>
            <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(app.notes || '-')}
            </td>
            <td class="text-right">
              <div style="display: inline-flex; align-items: center; gap: 0.5rem;">
                ${transitionButtonsHtml}
                <button type="button" class="btn-card-icon" data-action="edit" data-id="${app._id}" title="Edit">✏️</button>
                <button type="button" class="btn-card-icon danger" data-action="delete" data-id="${app._id}" title="Delete">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    // Pagination
    if (state.pagination) {
      const { page, totalPages, totalCount } = state.pagination;
      el.paginationInfo.textContent = `Showing page ${page} of ${totalPages} (${totalCount} total applications)`;
      el.pageNumDisplay.textContent = `Page ${page} of ${totalPages || 1}`;
      el.btnPrevPage.disabled = page <= 1;
      el.btnNextPage.disabled = page >= totalPages;
    }
  }

  // ─── Status Transition Handler ─────────────────────────────────────────
  async function transitionStatus(appId, newStatus) {
    const res = await apiRequest(`/api/applications/${appId}`, 'PUT', { status: newStatus });
    if (res.ok && res.data.success) {
      showToast(`Status updated to "${newStatus}"`, 'success');
      await refreshData();
    } else {
      const errMsg = res.data.message || 'Failed to update status';
      showToast(errMsg, 'error');
    }
  }

  // ─── Delete Application ────────────────────────────────────────────────
  async function deleteApp(appId) {
    const app = state.applications.find((a) => a._id === appId);
    const compName = app ? app.company : 'this application';

    if (!confirm(`Are you sure you want to delete application for "${compName}"?`)) {
      return;
    }

    const res = await apiRequest(`/api/applications/${appId}`, 'DELETE');
    if (res.ok && res.data.success) {
      showToast(`Deleted application for "${compName}"`, 'info');
      await refreshData();
    } else {
      showToast(res.data.message || 'Failed to delete application', 'error');
    }
  }

  // ─── Modal Create/Edit Application ────────────────────────────────────
  function openCreateModal() {
    state.editingApp = null;
    el.modalAppTitle.textContent = 'New Job Application';
    el.formApplication.reset();
    el.appId.value = '';
    el.appAppliedDate.value = new Date().toISOString().split('T')[0];
    el.workflowBanner.style.display = 'none';
    el.modalErrorAlert.style.display = 'none';

    // Enable all status options for creation
    Array.from(el.appStatus.options).forEach((opt) => {
      opt.disabled = false;
    });
    el.appStatus.value = 'Applied';

    el.modalApplication.style.display = 'flex';
  }

  function openEditModal(appId) {
    const app = state.applications.find((a) => a._id === appId);
    if (!app) return;

    state.editingApp = app;
    el.modalAppTitle.textContent = `Edit Application — ${app.company}`;
    el.appId.value = app._id;
    el.appCompany.value = app.company;
    el.appJobTitle.value = app.jobTitle;
    el.appLocation.value = app.location || '';
    el.appNotes.value = app.notes || '';
    el.appAppliedDate.value = app.appliedDate ? app.appliedDate.split('T')[0] : '';
    el.modalErrorAlert.style.display = 'none';

    // Status Workflow Enforcement UI
    const allowed = STATUS_TRANSITIONS[app.status] || [];
    el.workflowBanner.style.display = 'flex';

    if (allowed.length > 0) {
      el.workflowAllowedText.textContent = `From "${app.status}", allowed moves are: [${allowed.join(', ')}]`;
    } else {
      el.workflowAllowedText.textContent = `"${app.status}" is a terminal status — no further status changes allowed.`;
    }

    // Configure status select dropdown: keep current status or allowed transitions
    Array.from(el.appStatus.options).forEach((opt) => {
      if (opt.value === app.status || allowed.includes(opt.value)) {
        opt.disabled = false;
      } else {
        opt.disabled = true;
      }
    });

    el.appStatus.value = app.status;
    el.modalApplication.style.display = 'flex';
  }

  function closeModal() {
    el.modalApplication.style.display = 'none';
  }

  async function handleSaveApplication(e) {
    e.preventDefault();
    el.modalErrorAlert.style.display = 'none';

    const payload = {
      company: el.appCompany.value.trim(),
      jobTitle: el.appJobTitle.value.trim(),
      location: el.appLocation.value.trim(),
      status: el.appStatus.value,
      notes: el.appNotes.value.trim(),
      appliedDate: el.appAppliedDate.value ? new Date(el.appAppliedDate.value).toISOString() : undefined,
    };

    let res;
    if (state.editingApp) {
      res = await apiRequest(`/api/applications/${state.editingApp._id}`, 'PUT', payload);
    } else {
      res = await apiRequest('/api/applications', 'POST', payload);
    }

    if (res.ok && res.data.success) {
      showToast(
        state.editingApp
          ? `Application updated successfully`
          : `Created application for "${payload.company}"`,
        'success'
      );
      closeModal();
      await refreshData();
    } else {
      // Render validation error messages
      if (res.data.errors && Array.isArray(res.data.errors)) {
        const errorItems = res.data.errors
          .map((err) => `<li><strong>${err.field}</strong>: ${err.message}</li>`)
          .join('');
        el.modalErrorAlert.innerHTML = `<ul>${errorItems}</ul>`;
      } else {
        el.modalErrorAlert.textContent = res.data.message || 'Validation failed. Please check fields.';
      }
      el.modalErrorAlert.style.display = 'block';
    }
  }

  // ─── Seed Demo Data Feature ────────────────────────────────────────────
  async function seedDemoData() {
    const sampleApps = [
      {
        company: 'Google',
        jobTitle: 'Senior Frontend Engineer',
        location: 'Mountain View, CA (Hybrid)',
        status: 'Interview',
        notes: 'Technical screen passed. System design round scheduled for next Thursday.',
        appliedDate: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      {
        company: 'Stripe',
        jobTitle: 'Full Stack Infrastructure Engineer',
        location: 'Remote',
        status: 'Offer',
        notes: 'Received initial offer package ($195k base + equity). Reviewing terms.',
        appliedDate: new Date(Date.now() - 14 * 86400000).toISOString(),
      },
      {
        company: 'Microsoft',
        jobTitle: 'Cloud Solutions Architect',
        location: 'Redmond, WA',
        status: 'Applied',
        notes: 'Submitted via employee referral portal for Azure Developer Experience team.',
        appliedDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        company: 'Meta',
        jobTitle: 'Product Software Engineer',
        location: 'New York, NY',
        status: 'Accepted',
        notes: 'Signed offer letter! Start date confirmed for next month.',
        appliedDate: new Date(Date.now() - 21 * 86400000).toISOString(),
      },
      {
        company: 'Airbnb',
        jobTitle: 'Staff UI Architect',
        location: 'Remote',
        status: 'Rejected',
        notes: 'Role closed due to head-count restructuring.',
        appliedDate: new Date(Date.now() - 30 * 86400000).toISOString(),
      },
    ];

    let count = 0;
    for (const sample of sampleApps) {
      const res = await apiRequest('/api/applications', 'POST', sample);
      if (res.ok) count++;
    }

    showToast(`Seeded ${count} demo job applications!`, 'success');
    await refreshData();
  }

  // ─── API Key Modal Handlers ────────────────────────────────────────────
  function openKeyModal() {
    el.inputApiKey.value = state.apiKey;
    el.keyTestResult.innerHTML = '';
    el.modalApiKey.style.display = 'flex';
  }

  function closeKeyModal() {
    el.modalApiKey.style.display = 'none';
  }

  async function testApiKey() {
    const testKey = el.inputApiKey.value.trim();
    const tempKey = state.apiKey;
    state.apiKey = testKey;

    const res = await apiRequest('/api/applications/stats');
    if (res.ok && res.data.success) {
      el.keyTestResult.innerHTML = `<span style="color: var(--success);">✓ Key valid! Server accepted request (200 OK).</span>`;
    } else {
      el.keyTestResult.innerHTML = `<span style="color: var(--danger);">✗ Invalid key! Server returned 401 Unauthorized.</span>`;
    }

    state.apiKey = tempKey; // restore until saved
  }

  function saveApiKey() {
    state.apiKey = el.inputApiKey.value.trim();
    localStorage.setItem('trackflow_api_key', state.apiKey);
    updateApiKeyDisplay();
    closeKeyModal();
    showToast('API Key saved successfully', 'info');
    refreshData();
  }

  // ─── Live API Inspector Drawer ─────────────────────────────────────────
  function renderInspectorLogs() {
    el.inspectorCountBadge.textContent = `${state.inspectorLogs.length} requests`;

    if (state.inspectorLogs.length === 0) {
      el.inspectorLogList.innerHTML = `<div class="inspector-empty-log">No API requests captured yet.</div>`;
      return;
    }

    el.inspectorLogList.innerHTML = state.inspectorLogs
      .map((log) => {
        const activeClass = log.id === state.selectedLogId ? 'active' : '';
        const urlPath = log.url.replace(window.location.origin, '');
        const statusClass = log.status >= 200 && log.status < 300 
          ? 'status-2xx' 
          : log.status >= 400 && log.status < 500 
          ? 'status-4xx' 
          : 'status-5xx';

        return `
          <div class="log-item ${activeClass}" data-id="${log.id}">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="method-tag method-${log.method}">${log.method}</span>
              <span class="log-path" title="${urlPath}">${urlPath}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="log-status ${statusClass}">${log.status || 'ERR'}</span>
              <span style="font-size: 0.68rem; color: var(--text-dim);">${log.durationMs}ms</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function selectInspectorLog(logId) {
    state.selectedLogId = logId;
    renderInspectorLogs();

    const log = state.inspectorLogs.find((l) => l.id === logId);
    if (!log) {
      el.inspectorLogDetail.innerHTML = `
        <div class="empty-detail-placeholder">
          <span>Select a request on the left to view HTTP headers and JSON response.</span>
        </div>
      `;
      return;
    }

    const headersFormatted = JSON.stringify(log.headers, null, 2);
    const bodyFormatted = log.body ? JSON.stringify(log.body, null, 2) : 'No request body';
    const responseFormatted = log.response ? JSON.stringify(log.response, null, 2) : 'No response body';

    el.inspectorLogDetail.innerHTML = `
      <div style="margin-bottom: 0.75rem;">
        <span class="method-tag method-${log.method}">${log.method}</span>
        <strong style="margin-left: 0.5rem; font-size: 0.85rem;">${log.url}</strong>
        <span style="margin-left: 0.5rem; color: var(--text-muted);">[Status: ${log.status} ${log.statusText} • ${log.durationMs}ms]</span>
      </div>

      <div class="detail-section-title">Request Headers</div>
      <pre class="json-code">${escapeHtml(headersFormatted)}</pre>

      ${
        log.body
          ? `<div class="detail-section-title">Request Body</div><pre class="json-code">${escapeHtml(bodyFormatted)}</pre>`
          : ''
      }

      <div class="detail-section-title">Backend Response JSON</div>
      <pre class="json-code">${escapeHtml(responseFormatted)}</pre>
    `;
  }

  // ─── Toast System ──────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️',
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ─── Event Listeners Binding ───────────────────────────────────────────
  function bindEvents() {
    // Toolbar Search & Filters
    el.inputSearch.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      el.btnClearSearch.style.display = state.searchQuery ? 'block' : 'none';
      state.page = 1;
      debounce(loadApplications, 300)();
    });

    el.btnClearSearch.addEventListener('click', () => {
      el.inputSearch.value = '';
      state.searchQuery = '';
      el.btnClearSearch.style.display = 'none';
      state.page = 1;
      loadApplications();
    });

    el.selectStatusFilter.addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      state.page = 1;
      loadApplications();
    });

    el.selectSort.addEventListener('change', (e) => {
      state.sort = e.target.value;
      state.page = 1;
      loadApplications();
    });

    // View Switcher
    el.btnViewKanban.addEventListener('click', () => {
      state.viewMode = 'kanban';
      el.btnViewKanban.classList.add('active');
      el.btnViewTable.classList.remove('active');
      el.kanbanView.style.display = 'grid';
      el.tableView.style.display = 'none';
      renderCurrentView();
    });

    el.btnViewTable.addEventListener('click', () => {
      state.viewMode = 'table';
      el.btnViewTable.classList.add('active');
      el.btnViewKanban.classList.remove('active');
      el.kanbanView.style.display = 'none';
      el.tableView.style.display = 'block';
      renderCurrentView();
    });

    // Pagination
    el.selectPageLimit.addEventListener('change', (e) => {
      state.limit = parseInt(e.target.value, 10);
      state.page = 1;
      loadApplications();
    });

    el.btnPrevPage.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadApplications();
      }
    });

    el.btnNextPage.addEventListener('click', () => {
      if (state.pagination && state.page < state.pagination.totalPages) {
        state.page++;
        loadApplications();
      }
    });

    // Modal Application Actions
    el.btnOpenCreateModal.addEventListener('click', openCreateModal);
    el.btnCloseModal.addEventListener('click', closeModal);
    el.btnCancelModal.addEventListener('click', closeModal);
    el.formApplication.addEventListener('submit', handleSaveApplication);

    // Dynamic Card Actions (Transition, Edit, Delete) via Event Delegation
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const appId = btn.dataset.id;

      if (action === 'transition') {
        const targetStatus = btn.dataset.target;
        transitionStatus(appId, targetStatus);
      } else if (action === 'edit') {
        openEditModal(appId);
      } else if (action === 'delete') {
        deleteApp(appId);
      }
    });

    // Seed Data
    el.btnSeedData.addEventListener('click', seedDemoData);

    // API Key Config
    el.btnApiKeyConfig.addEventListener('click', openKeyModal);
    el.btnCloseKeyModal.addEventListener('click', closeKeyModal);
    el.btnTestApiKey.addEventListener('click', testApiKey);
    el.btnSaveApiKey.addEventListener('click', saveApiKey);
    el.btnToggleKey.addEventListener('click', () => {
      el.inputApiKey.type = el.inputApiKey.type === 'password' ? 'text' : 'password';
    });

    // API Inspector Toggle & Events
    el.btnToggleInspector.addEventListener('click', toggleInspector);
    el.drawerToggle.addEventListener('click', toggleInspector);
    el.btnMinimizeInspector.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleInspector();
    });

    el.btnClearInspector.addEventListener('click', (e) => {
      e.stopPropagation();
      state.inspectorLogs = [];
      state.selectedLogId = null;
      renderInspectorLogs();
      selectInspectorLog(null);
    });

    el.inspectorLogList.addEventListener('click', (e) => {
      const logItem = e.target.closest('.log-item');
      if (logItem) {
        selectInspectorLog(logItem.dataset.id);
      }
    });
  }

  function toggleInspector() {
    el.apiInspector.classList.toggle('collapsed');
  }

  // ─── Utilities ─────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let debounceTimer;
  function debounce(func, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // Bootstrap Application
  document.addEventListener('DOMContentLoaded', init);
})();
