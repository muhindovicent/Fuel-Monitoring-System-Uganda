/* MafutaWatch MVP integration: preserve legacy demo but never treat it as authoritative. */
(function () {
  'use strict';
  const root = (window.MAFUTA_API_BASE || '/api/v1').replace(/\/$/, '');
  let live = false;
  let accessToken = null;
  let role = null;
  let sessionExpiresAt = 0;

  async function request(path, options = {}) {
    const headers = { 'Accept': 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken && Date.now() < sessionExpiresAt) headers.Authorization = 'Bearer ' + accessToken;
    const response = await fetch(root + path, { ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(Array.isArray(payload.message) ? payload.message.join('; ') : (payload.message || 'API request failed (' + response.status + ')'));
    }
    return response.json();
  }
  function setBanner(message, connected) {
    const banner = document.getElementById('mafutaModeBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.background = connected ? '#d1fae5' : '#fef3c7';
    banner.style.color = connected ? '#064e3b' : '#422006';
  }
  function safeToast(message) { if (typeof showToast === 'function') showToast(message); }
  async function refreshStations() {
    try {
      const payload = await request('/stations');
      if (!Array.isArray(payload.data) || payload.source !== 'server_verified_only') throw new Error('Unexpected station response');
      live = true;
      const mapped = payload.data.map(s => ({
        id: Number(s.id), name: String(s.name), district: String(s.district),
        area: String(s.district), region: 'Uganda', op: 0,
        lat: s.latitude === null ? null : Number(s.latitude),
        lng: s.longitude === null ? null : Number(s.longitude),
        petrol: s.petrol === null ? null : Number(s.petrol),
        diesel: s.diesel === null ? null : Number(s.diesel)
      }));
      STATIONS_DATA.splice(0, STATIONS_DATA.length, ...mapped);
      setBanner('CONNECTED — Real stations from the server. Only moderated prices are published. Local community, tickets and analytics features remain demonstrations and are not official.', true);
      ['populateReportForm','initC2GForm','renderStationList','renderActivity','renderRegionCards','updateHeroCount','renderMapMarkers'].forEach(name => {
        try { if (typeof window[name] === 'function') window[name](); } catch (_) { /* Some views load lazily. */ }
      });
    } catch (_) {
      live = false;
      setBanner('DEMO MODE — Server unavailable. All station prices and dashboards are illustrative; no submissions are sent to the government or backend.', false);
    }
  }
  async function submitPrice() {
    if (!live) return safeToast('Server unavailable; no price report was submitted.');
    const stationId = Number(document.getElementById('reportStation')?.value || 0);
    const fuel = document.getElementById('reportFuel')?.value || '';
    const price = Number(document.getElementById('reportPrice')?.value || 0);
    const location = document.getElementById('reportLocation')?.value?.trim() || '';
    if (!Number.isInteger(stationId) || stationId < 1) return safeToast('Choose a server-listed station.');
    if (!['petrol','diesel'].includes(fuel) || !Number.isInteger(price) || price < 500 || price > 50000) return safeToast('Enter a valid fuel type and integer UGX price.');
    try {
      const result = await request('/reports', { method: 'POST', body: JSON.stringify({ stationId, fuel, price, location }) });
      safeToast('Report ' + result.id + ' received as PENDING. It is not yet a published price.');
      document.getElementById('reportPrice').value = '';
      document.getElementById('reportLocation').value = '';
    } catch (e) { safeToast('Submission failed: ' + e.message); }
  }
  function make(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  async function loadPending() {
    const box = document.getElementById('mafutaServerReports');
    if (!box) return;
    box.replaceChildren(make('p', 'Loading server reports…'));
    try {
      const result = await request('/admin/reports');
      if (!result.data.length) { box.replaceChildren(make('p', 'No pending reports.')); return; }
      box.replaceChildren();
      for (const report of result.data) {
        const item = make('div', undefined, 'tool-card');
        item.appendChild(make('strong', '#' + report.id + ' · ' + report.station_name));
        item.appendChild(make('p', report.fuel_type + ': UGX ' + Number(report.reported_price).toLocaleString() + ' · ' + (report.reported_location || 'Location not supplied')));
        item.appendChild(make('p', 'Submitted: ' + new Date(report.created_at).toLocaleString()));
        if (['admin','inspector'].includes(role)) {
          for (const decision of ['verify', 'reject']) {
            const button = make('button', decision === 'verify' ? 'Verify and publish' : 'Reject', 'btn-tool btn-tool-outline btn-tool-sm');
            button.type = 'button';
            button.style.marginRight = '8px';
            button.addEventListener('click', async () => {
              button.disabled = true;
              try {
                await request('/admin/reports/' + encodeURIComponent(report.id) + '/' + decision, { method: 'POST', body: JSON.stringify({}) });
                await loadPending();
                if (decision === 'verify') await refreshStations();
              } catch (e) { safeToast('Review failed: ' + e.message); button.disabled = false; }
            });
            item.appendChild(button);
          }
        }
        box.appendChild(item);
      }
    } catch (e) { box.replaceChildren(make('p', 'Unable to fetch moderation queue: ' + e.message)); }
  }
  function renderServerDashboard(user) {
    const page = document.getElementById('page-admin');
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminDash').style.display = 'none'; // old dashboard is an untrusted simulation
    const existing = document.getElementById('mafutaServerDashboard');
    if (existing) existing.remove();
    const panel = make('section', undefined, 'tool-card');
    panel.id = 'mafutaServerDashboard';
    panel.appendChild(make('h3', 'Server dashboard — ' + user.role));
    panel.appendChild(make('p', 'Signed in as ' + user.email + '. Actions below are recorded in PostgreSQL. Legacy analytics and API-token consoles are disabled.'));
    const logout = make('button', 'Sign out', 'btn-tool btn-tool-outline btn-tool-sm');
    logout.addEventListener('click', () => {
      accessToken = null; role = null; sessionExpiresAt = 0;
      panel.remove(); document.getElementById('adminLogin').style.display = 'block';
      document.getElementById('adminPass').value = '';
    });
    panel.appendChild(logout);
    if (role === 'admin') {
      const heading = make('h4', 'Register a verified station');
      heading.style.marginTop = '15px';
      panel.appendChild(heading);
      const name = make('input'); name.placeholder = 'Station name'; name.maxLength = 160;
      const district = make('input'); district.placeholder = 'District'; district.maxLength = 100;
      const create = make('button', 'Add station', 'btn-tool btn-tool-primary btn-tool-sm');
      create.addEventListener('click', async () => {
        create.disabled = true;
        try {
          await request('/stations', { method: 'POST', body: JSON.stringify({ name: name.value.trim(), district: district.value.trim() }) });
          name.value = ''; district.value = '';
          safeToast('Station added to authoritative directory');
          await refreshStations();
        } catch (e) { safeToast(e.message); } finally { create.disabled = false; }
      });
      for (const node of [name, district, create]) { node.style.marginRight = '8px'; node.style.marginTop = '8px'; panel.appendChild(node); }
    }
    const reportsTitle = make('h4', 'Pending citizen price reports');
    reportsTitle.style.marginTop = '18px';
    panel.appendChild(reportsTitle);
    const list = make('div'); list.id = 'mafutaServerReports';
    panel.appendChild(list);
    page.appendChild(panel);
    loadPending();
  }
  async function login() {
    const email = document.getElementById('adminUser')?.value?.trim() || '';
    const password = document.getElementById('adminPass')?.value || '';
    if (!email || !password) return safeToast('Enter your account email and password.');
    const button = document.getElementById('adminLoginBtn');
    button.disabled = true;
    try {
      const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (!['admin','inspector','analyst'].includes(result.user.role)) throw new Error('This login is for administrators and inspectors only');
      accessToken = result.accessToken; role = result.user.role;
      sessionExpiresAt = Date.now() + Math.max(0, result.expiresInSeconds - 30) * 1000;
      document.getElementById('adminPass').value = '';
      renderServerDashboard(result.user);
    } catch (e) { accessToken = null; role = null; safeToast('Login failed: ' + e.message); }
    finally { button.disabled = false; }
  }
  document.addEventListener('click', event => {
    if (event.target?.id === 'adminLoginBtn') { event.preventDefault(); login(); }
    if (event.target?.id === 'opLoginBtn') {
      event.preventDefault();
      safeToast('Operator OTP login requires server integration and is not available.');
    }
  });
  window.MafutaApi = Object.freeze({ isLive: () => live, submitPrice, refreshStations });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshStations);
  else refreshStations();
})();
