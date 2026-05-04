const app = document.getElementById('app');

const state = {
  route: localStorage.getItem('aqua.tester.route') || 'overview',
  nodeUrl: localStorage.getItem('aqua.nodeUrl') || 'http://localhost:7001',
  identity: null,
  balance: null,
  nodeState: null,
  peers: [],
  dex: null,
  events: [],
  bundle: null,
  status: { ok: false, text: 'Not checked' },
  outputs: {},
  forms: {
    identityName: localStorage.getItem('aqua.tester.identityName') || 'local-human',
    pohwStatus: 'locally_verified',
    sendTo: '',
    sendAmount: '100',
    proposalTitle: 'Test proposal',
    proposalBody: '',
    proposalId: '',
    voteChoice: 'yes',
    proxyKey: '',
    quoteSide: 'sell',
    quoteAmount: '10',
    quotePrice: '1',
    escrowSeller: '',
    escrowAmount: '10',
    escrowId: '',
    escrowBuyer: '',
    witnessSubject: '',
    witnessStatement: 'off-chain condition observed',
    peerUrl: 'ws://localhost:7002',
    bundleText: '',
    chatRoom: 'harbour',
    chatRoomName: 'Harbour',
    chatRoomTopic: 'Local-first room for protocol testing',
    chatText: ''
  }
};

const screens = [
  { id: 'overview', label: 'Overview', icon: 'dashboard', title: 'Node overview', detail: 'Live state for the selected Aqua node.' },
  { id: 'identity', label: 'Identity', icon: 'user', title: 'Identity', detail: 'Create and inspect the local node identity.' },
  { id: 'send', label: 'Send', icon: 'send', title: 'Send Aqua', detail: 'Move Aqua from this node identity to another public key.' },
  { id: 'governance', label: 'Vote', icon: 'vote', title: 'Governance', detail: 'Create proposals, vote, and test proxy delegation.' },
  { id: 'dex', label: 'DEX', icon: 'swap', title: 'DEX', detail: 'Exercise quotes, escrow open, release, and refund actions.' },
  { id: 'chat', label: 'Chat', icon: 'chat', title: 'Chat bridge', detail: 'Check chat readiness without mixing chat code into the protocol.' },
  { id: 'peers', label: 'Peers', icon: 'network', title: 'Peers and bundles', detail: 'Connect nodes and import or export event bundles.' },
  { id: 'events', label: 'Events', icon: 'list', title: 'Event log', detail: 'Inspect raw signed events stored by the node.' }
];

const icons = {
  dashboard: '<path d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-12h8V3h-8v6Z"/>',
  user: '<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
  vote: '<path d="m9 12 2 2 4-4"/><path d="M7 4h10l3 6v10H4V10l3-6Z"/><path d="M4 10h16"/>',
  swap: '<path d="M17 1 21 5l-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  network: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="m8.5 8.2 2 6.1M15.5 8.2l-2 6.1M9 6h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M16 8h5V3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><rect x="2" y="2" width="13" height="13" rx="2"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>'
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.dashboard}</svg>`;
}

function short(value, left = 8, right = 6) {
  if (!value) return '-';
  return value.length > left + right + 3 ? `${value.slice(0, left)}...${value.slice(-right)}` : value;
}

function pretty(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function setForm(key, value) {
  state.forms[key] = value;
  if (key === 'identityName') localStorage.setItem('aqua.tester.identityName', value);
}

function setRoute(route) {
  state.route = route;
  localStorage.setItem('aqua.tester.route', route);
  render();
  refresh();
}

async function api(path, options = {}) {
  const res = await fetch(`${state.nodeUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new Error(typeof data === 'string' ? data : JSON.stringify(data));
  return data;
}

function toast(message, error = false) {
  const existing = document.querySelector('.toast');
  existing?.remove();
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3600);
}

async function runAction(outputKey, task, refreshAfter = true) {
  try {
    state.outputs[outputKey] = 'Working...';
    render();
    const result = await task();
    state.outputs[outputKey] = result;
    toast('Action completed');
    if (refreshAfter) await refresh(false);
    else render();
  } catch (error) {
    state.outputs[outputKey] = { error: String(error.message || error) };
    toast(String(error.message || error), true);
    render();
  }
}

async function refresh(showToast = false) {
  try {
    const [identity, events, nodeState, peers, dex] = await Promise.all([
      api('/identity'),
      api('/events'),
      api('/state'),
      api('/peers').catch(() => []),
      api('/dex').catch(() => null)
    ]);
    const balance = identity?.publicKey ? await api(`/balance/${encodeURIComponent(identity.publicKey)}`) : null;
    state.identity = identity;
    state.events = Array.isArray(events) ? events : [];
    state.nodeState = nodeState;
    state.peers = Array.isArray(peers) ? peers : [];
    state.dex = dex;
    state.balance = balance;
    state.status = { ok: true, text: 'Connected' };
    if (showToast) toast('Node refreshed');
  } catch (error) {
    state.status = { ok: false, text: String(error.message || error) };
  }
  render();
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
}

function output(key) {
  return `<pre>${escapeHtml(pretty(state.outputs[key] ?? 'No output yet.'))}</pre>`;
}

function panel(title, body, tools = '') {
  return `<section class="panel"><div class="panel-head"><h3>${title}</h3>${tools}</div>${body}</section>`;
}

function field(label, key, attrs = '') {
  const value = escapeAttr(state.forms[key] ?? '');
  return `<label>${label}<input data-form="${key}" value="${value}" ${attrs} /></label>`;
}

function area(label, key, attrs = '') {
  return `<label>${label}<textarea data-form="${key}" ${attrs}>${escapeHtml(state.forms[key] ?? '')}</textarea></label>`;
}

function selectField(label, key, options) {
  const opts = options.map((option) => {
    const selected = state.forms[key] === option ? ' selected' : '';
    return `<option value="${escapeAttr(option)}"${selected}>${escapeHtml(option)}</option>`;
  }).join('');
  return `<label>${label}<select data-form="${key}">${opts}</select></label>`;
}

function actionButton(label, action, iconName = 'plus', variant = '') {
  return `<button class="${variant}" data-action="${action}">${icon(iconName)} ${label}</button>`;
}

function copyButton(value, label = 'Copy') {
  return `<button class="secondary icon-only" title="${label}" data-copy="${escapeAttr(value || '')}">${icon('copy')}</button>`;
}

function overviewScreen() {
  const id = state.identity;
  const balance = state.balance;
  const eventTypes = summarizeTypes(state.events);
  const latest = state.events.slice(-6).reverse();
  return `
    <section class="grid">
      <div class="span-3">${metric('Aqua', balance?.aqua ?? 0, 'accent')}</div>
      <div class="span-3">${metric('Fire paid', balance?.firePaid ?? 0, 'fire')}</div>
      <div class="span-3">${metric('Sump', balance?.sump ?? 0, 'sump')}</div>
      <div class="span-3">${metric('Events', state.events.length, 'blue')}</div>
      <div class="span-7">${panel('Local identity', `
        <div class="copy-row">
          <span class="pill ${id?.verified ? 'ok' : 'bad'}">${icon('shield')} ${id?.pohwStatus ?? 'unknown'}</span>
          <span class="mono">${escapeHtml(id?.publicKey ?? '-')}</span>
          ${copyButton(id?.publicKey, 'Copy public key')}
        </div>
        <div class="button-row">
          ${actionButton('Start', 'startFlow', 'play')}
          ${actionButton('Refresh', 'refresh', 'refresh', 'secondary')}
        </div>
        ${output('start')}
      `)}</div>
      <div class="span-5">${panel('Module snapshot', `
        <div class="event-list">
          ${eventTypes.map((item) => `<div class="event-item"><div class="event-head"><strong>${escapeHtml(item.type)}</strong><span class="pill">${item.count}</span></div></div>`).join('') || '<div class="empty">No events yet.</div>'}
        </div>
      `)}</div>
      <div class="span-12">${panel('Recent events', eventList(latest))}</div>
    </section>
  `;
}

function identityScreen() {
  const id = state.identity;
  return `
    <section class="grid">
      <div class="span-5">${panel('Create or attest identity', `
        <div class="form-grid">
          ${field('Name', 'identityName')}
          ${selectField('PoHW status', 'pohwStatus', ['locally_verified', 'unverified', 'vouched', 'challenged', 'archived'])}
        </div>
        <div class="button-row">${actionButton('Create identity', 'createIdentity', 'user')}</div>
        ${output('identity')}
      `)}</div>
      <div class="span-7">${panel('Current identity', `
        <div class="metric-row">
          <span class="pill ${id?.verified ? 'ok' : 'bad'}">${id?.verified ? 'Verified' : 'Unverified'}</span>
          ${copyButton(id?.publicKey, 'Copy public key')}
        </div>
        <pre>${escapeHtml(pretty(id ?? {}))}</pre>
      `)}</div>
    </section>
  `;
}

function sendScreen() {
  return `
    <section class="grid">
      <div class="span-5">${panel('Transfer', `
        <div class="form-grid">
          <div class="full">${area('Receiver public key', 'sendTo')}</div>
          ${field('Amount', 'sendAmount', 'type="number" min="0" step="1"')}
        </div>
        <div class="button-row">
          ${actionButton('Send Aqua', 'sendAqua', 'send')}
          ${actionButton('Issue weekly', 'issueWeekly', 'download', 'secondary')}
        </div>
        ${output('send')}
      `)}</div>
      <div class="span-7">${panel('Wallet state', `
        <div class="grid">
          <div class="span-4">${metric('Aqua', state.balance?.aqua ?? 0, 'accent')}</div>
          <div class="span-4">${metric('Locked', state.balance?.locked ?? 0)}</div>
          <div class="span-4">${metric('Fire paid', state.balance?.firePaid ?? 0, 'fire')}</div>
        </div>
        <pre>${escapeHtml(pretty(state.balance ?? {}))}</pre>
      `)}</div>
    </section>
  `;
}

function governanceScreen() {
  return `
    <section class="grid">
      <div class="span-6">${panel('Proposal', `
        <div class="form-grid">
          ${field('Title', 'proposalTitle')}
          <div></div>
          <div class="full">${area('Body', 'proposalBody')}</div>
        </div>
        <div class="button-row">${actionButton('Create proposal', 'createProposal', 'plus')}</div>
        ${output('proposal')}
      `)}</div>
      <div class="span-6">${panel('Vote and proxy', `
        <div class="form-grid">
          ${field('Proposal ID', 'proposalId')}
          ${selectField('Choice', 'voteChoice', ['yes', 'no', 'abstain'])}
          <div class="full">${area('Proxy public key', 'proxyKey')}</div>
        </div>
        <div class="button-row">
          ${actionButton('Cast vote', 'castVote', 'vote')}
          ${actionButton('View tally', 'refreshTally', 'list', 'secondary')}
          ${actionButton('Publish outcome', 'publishOutcome', 'upload', 'secondary')}
          ${actionButton('Set proxy', 'setProxy', 'network', 'secondary')}
          ${actionButton('Revoke proxy', 'revokeProxy', 'refresh', 'secondary')}
        </div>
        ${output('vote')}
      `)}</div>
      <div class="span-12">${panel('Known proposals', eventList(state.events.filter((event) => event.type === 'governance.proposal_create' || event.type === 'governance.outcome_publish').slice(-8).reverse()))}</div>
    </section>
  `;
}

function dexScreen() {
  return `
    <section class="grid">
      <div class="span-5">${panel('Quote', `
        <div class="form-grid">
          ${selectField('Side', 'quoteSide', ['sell', 'buy'])}
          ${field('Amount', 'quoteAmount', 'type="number" min="0" step="1"')}
          ${field('Price', 'quotePrice', 'type="number" min="0" step="0.01"')}
        </div>
        <div class="button-row">${actionButton('Create quote', 'createQuote', 'swap')}</div>
        ${output('quote')}
      `)}</div>
      <div class="span-7">${panel('Escrow', `
        <div class="form-grid">
          <div class="full">${area('Seller public key', 'escrowSeller')}</div>
          ${field('Amount', 'escrowAmount', 'type="number" min="0" step="1"')}
          ${field('Escrow ID', 'escrowId')}
          ${field('Witness subject ID', 'witnessSubject')}
          <div class="full">${area('Buyer public key', 'escrowBuyer')}</div>
          <div class="full">${area('Witness statement', 'witnessStatement')}</div>
        </div>
        <div class="button-row">
          ${actionButton('Open escrow', 'openEscrow', 'plus')}
          ${actionButton('Release', 'releaseEscrow', 'upload', 'secondary')}
          ${actionButton('Refund', 'refundEscrow', 'download', 'secondary')}
          ${actionButton('Verify', 'witnessDex', 'shield', 'secondary')}
          ${actionButton('Refresh DEX', 'refreshDex', 'refresh', 'secondary')}
        </div>
        ${output('dex')}
      `)}</div>
      <div class="span-12">${panel('DEX state', `<pre>${escapeHtml(pretty(state.dex ?? {}))}</pre>`)}</div>
    </section>
  `;
}

function chatScreen() {
  const chatEvents = state.events.filter((event) => event.type?.includes('chat') || event.module === 'chat');
  return `
    <section class="grid">
      <div class="span-5">${panel('Chat bridge probe', `
        <div class="form-grid">
          ${field('Room ID', 'chatRoom')}
          ${field('Room name', 'chatRoomName')}
          <div class="full">${field('Topic', 'chatRoomTopic')}</div>
          <div class="full">${area('Message', 'chatText')}</div>
        </div>
        <div class="button-row">
          ${actionButton('Create room', 'createChatRoom', 'plus')}
          ${actionButton('Send chat', 'sendChat', 'chat')}
          ${actionButton('Check events', 'refresh', 'refresh', 'secondary')}
        </div>
        ${output('chat')}
      `)}</div>
      <div class="span-7">${panel('Chat-shaped events', eventList(chatEvents.slice(-10).reverse()))}</div>
    </section>
  `;
}

function peersScreen() {
  return `
    <section class="grid">
      <div class="span-5">${panel('Peer connection', `
        <div class="form-grid">
          <div class="full">${field('Peer WebSocket URL', 'peerUrl')}</div>
        </div>
        <div class="button-row">${actionButton('Connect peer', 'connectPeer', 'network')}</div>
        ${output('peers')}
      `)}</div>
      <div class="span-7">${panel('Bundles', `
        <div class="button-row">
          ${actionButton('Export bundle', 'exportBundle', 'download')}
          ${actionButton('Import bundle', 'importBundle', 'upload', 'secondary')}
        </div>
        ${area('Bundle JSON', 'bundleText')}
        ${output('bundle')}
      `)}</div>
      <div class="span-12">${panel('Peer book', `<pre>${escapeHtml(pretty(state.peers))}</pre>`)}</div>
    </section>
  `;
}

function eventsScreen() {
  return `
    <section class="grid">
      <div class="span-12">${panel('Raw event log', `
        <div class="button-row">${actionButton('Refresh events', 'refresh', 'refresh', 'secondary')}</div>
        ${eventList(state.events.slice().reverse())}
      `)}</div>
    </section>
  `;
}

function eventList(events) {
  if (!events?.length) return '<div class="empty">No matching events.</div>';
  return `<div class="event-list">${events.map((event) => `
    <article class="event-item">
      <div class="event-head">
        <div>
          <p class="event-title">${escapeHtml(event.type ?? 'unknown')}</p>
          <div class="small">${escapeHtml(event.module ?? 'module')} | ${new Date(event.createdAt ?? Date.now()).toLocaleString()}</div>
        </div>
        <span class="pill">${escapeHtml(short(event.id ?? 'no-id'))}</span>
      </div>
      <div class="mono">${escapeHtml(event.author ? `by ${short(event.author)}` : 'no author')}</div>
    </article>
  `).join('')}</div>`;
}

function summarizeTypes(events) {
  const counts = new Map();
  for (const event of events) counts.set(event.type ?? 'unknown', (counts.get(event.type ?? 'unknown') ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .slice(0, 8);
}

function screenBody() {
  if (state.route === 'identity') return identityScreen();
  if (state.route === 'send') return sendScreen();
  if (state.route === 'governance') return governanceScreen();
  if (state.route === 'dex') return dexScreen();
  if (state.route === 'chat') return chatScreen();
  if (state.route === 'peers') return peersScreen();
  if (state.route === 'events') return eventsScreen();
  return overviewScreen();
}

function render() {
  const active = screens.find((screen) => screen.id === state.route) || screens[0];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">A</div>
          <div>
            <h1>Aqua Tester</h1>
            <span>separate web client</span>
          </div>
        </div>
        <nav class="nav">
          ${screens.map((screen) => `<button class="${screen.id === state.route ? 'active' : ''}" data-route="${screen.id}">${icon(screen.icon)} ${screen.label}</button>`).join('')}
        </nav>
        <div class="node-card">
          <div class="status-line">
            <strong>Node</strong>
            <span class="status-dot ${state.status.ok ? 'ok' : 'bad'}"></span>
          </div>
          <div class="small">${escapeHtml(state.status.text)}</div>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="screen-title">
            <h2>${active.title}</h2>
            <p class="small">${active.detail}</p>
          </div>
          <label>Node URL<input id="nodeUrl" value="${escapeAttr(state.nodeUrl)}" /></label>
          <button class="secondary icon-only" title="Refresh" data-action="refresh">${icon('refresh')}</button>
        </header>
        <div class="content">
          <section class="screen active">${screenBody()}</section>
        </div>
      </main>
    </div>
  `;
  bind();
}

function bind() {
  document.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => setRoute(button.dataset.route));
  });
  document.querySelectorAll('[data-form]').forEach((input) => {
    input.addEventListener('input', () => setForm(input.dataset.form, input.value));
  });
  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => actions[button.dataset.action]?.());
  });
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy || '');
      toast('Copied');
    });
  });
  const nodeUrl = document.getElementById('nodeUrl');
  nodeUrl?.addEventListener('change', () => {
    state.nodeUrl = nodeUrl.value.trim() || 'http://localhost:7001';
    localStorage.setItem('aqua.nodeUrl', state.nodeUrl);
    refresh(true);
  });
}

const actions = {
  refresh: () => refresh(true),
  startFlow: () => runAction('start', async () => {
    const steps = [];
    let identity = state.identity;
    if (!identity?.verified) {
      const created = await api('/identity/create', {
        method: 'POST',
        body: JSON.stringify({ name: state.forms.identityName, pohwStatus: 'locally_verified' })
      });
      identity = { publicKey: created.publicKey, verified: true, pohwStatus: 'locally_verified' };
      steps.push({ step: 'identity.create', result: created });
    } else {
      steps.push({ step: 'identity.create', skipped: 'already verified', publicKey: identity.publicKey });
    }
    if (!Number(state.balance?.aqua ?? 0)) {
      const issued = await api('/money/issue-weekly', { method: 'POST', body: '{}' });
      steps.push({ step: 'money.issue-weekly', result: issued });
    } else {
      steps.push({ step: 'money.issue-weekly', skipped: 'wallet already has Aqua', aqua: state.balance.aqua });
    }
    return { started: true, steps };
  }),
  createIdentity: () => runAction('identity', () => api('/identity/create', {
    method: 'POST',
    body: JSON.stringify({ name: state.forms.identityName, pohwStatus: state.forms.pohwStatus })
  })),
  issueWeekly: () => runAction('send', () => api('/money/issue-weekly', { method: 'POST', body: '{}' })),
  sendAqua: () => runAction('send', () => api('/money/transfer', {
    method: 'POST',
    body: JSON.stringify({ to: state.forms.sendTo.trim(), amount: Number(state.forms.sendAmount) })
  })),
  createProposal: () => runAction('proposal', async () => {
    const event = await api('/governance/proposal', {
      method: 'POST',
      body: JSON.stringify({ title: state.forms.proposalTitle, body: state.forms.proposalBody, choices: ['yes', 'no', 'abstain'] })
    });
    setForm('proposalId', event.id);
    return event;
  }),
  castVote: () => runAction('vote', () => api('/governance/vote', {
    method: 'POST',
    body: JSON.stringify({ proposalId: state.forms.proposalId.trim(), choice: state.forms.voteChoice })
  })),
  refreshTally: () => runAction('vote', () => api(`/governance/tally/${encodeURIComponent(state.forms.proposalId.trim())}`), false),
  publishOutcome: () => runAction('vote', () => api('/governance/outcome', {
    method: 'POST',
    body: JSON.stringify({ proposalId: state.forms.proposalId.trim(), note: 'Published from Aqua tester.' })
  })),
  setProxy: () => runAction('vote', () => api('/governance/proxy', {
    method: 'POST',
    body: JSON.stringify({ proxy: state.forms.proxyKey.trim() })
  })),
  revokeProxy: () => runAction('vote', () => api('/governance/proxy', {
    method: 'POST',
    body: JSON.stringify({ revoke: true })
  })),
  createQuote: () => runAction('quote', () => api('/dex/quote', {
    method: 'POST',
    body: JSON.stringify({ side: state.forms.quoteSide, amount: Number(state.forms.quoteAmount), price: Number(state.forms.quotePrice) })
  })),
  openEscrow: () => runAction('dex', () => api('/dex/escrow', {
    method: 'POST',
    body: JSON.stringify({ seller: state.forms.escrowSeller.trim(), amount: Number(state.forms.escrowAmount) })
  })),
  releaseEscrow: () => runAction('dex', () => api('/dex/escrow', {
    method: 'POST',
    body: JSON.stringify({
      action: 'release',
      escrowId: state.forms.escrowId.trim(),
      buyer: state.forms.escrowBuyer.trim(),
      seller: state.forms.escrowSeller.trim(),
      amount: Number(state.forms.escrowAmount)
    })
  })),
  refundEscrow: () => runAction('dex', () => api('/dex/escrow', {
    method: 'POST',
    body: JSON.stringify({
      action: 'refund',
      escrowId: state.forms.escrowId.trim(),
      buyer: state.forms.escrowBuyer.trim(),
      amount: Number(state.forms.escrowAmount)
    })
  })),
  witnessDex: () => runAction('dex', () => api('/dex/witness', {
    method: 'POST',
    body: JSON.stringify({
      subjectEventId: (state.forms.witnessSubject || state.forms.escrowId).trim(),
      statement: state.forms.witnessStatement.trim()
    })
  })),
  refreshDex: () => runAction('dex', () => api('/dex'), false),
  createChatRoom: () => runAction('chat', () => api('/chat/room', {
    method: 'POST',
    body: JSON.stringify({
      roomId: state.forms.chatRoom.trim(),
      name: state.forms.chatRoomName.trim(),
      topic: state.forms.chatRoomTopic.trim()
    })
  })),
  sendChat: () => runAction('chat', () => api('/chat/message', {
    method: 'POST',
    body: JSON.stringify({ roomId: state.forms.chatRoom.trim(), text: state.forms.chatText.trim() })
  })),
  connectPeer: () => runAction('peers', () => api('/peers/connect', {
    method: 'POST',
    body: JSON.stringify({ url: state.forms.peerUrl.trim() })
  })),
  exportBundle: () => runAction('bundle', async () => {
    const bundle = await api('/bundle/export');
    setForm('bundleText', JSON.stringify(bundle, null, 2));
    return bundle;
  }, false),
  importBundle: () => runAction('bundle', () => api('/bundle/import', {
    method: 'POST',
    body: state.forms.bundleText
  }))
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('\n', '&#10;');
}

render();
refresh();
