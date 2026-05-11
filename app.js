const BASE_PROTOCOL = 'aqua.base.v0.1';
const MODULE_VERSION = 'v0.1';
const STORE_KEY = 'aqua.field.v1';

const initialStore = {
  account: null,
  events: [],
  pending: [],
  nodeUrl: localStorage.getItem('aqua.field.nodeUrl') || 'http://localhost:7001',
  route: localStorage.getItem('aqua.field.route') || 'home',
  forms: {
    name: '',
    passphrase: '',
    to: '',
    amount: '25',
    proposalTitle: 'Field proposal',
    proposalBody: '',
    proposalId: '',
    voteChoice: 'yes',
    proxy: '',
    chatRoom: 'chaos-harbour',
    chatRoomName: 'Chaos Harbour',
    chatText: '',
    quoteSide: 'sell',
    quoteAmount: '10',
    quotePrice: '1',
    quoteId: '',
    escrowSeller: '',
    escrowAmount: '10',
    escrowId: '',
    escrowBuyer: '',
    importText: ''
  },
  lastSync: null,
  lastError: ''
};

let store = loadStore();
const app = document.getElementById('app');

const routes = [
  ['home', 'Home'],
  ['account', 'Account'],
  ['money', 'Money'],
  ['civic', 'Civic'],
  ['chat', 'Chat'],
  ['dex', 'DEX'],
  ['sync', 'Sync']
];

function loadStore() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return structuredClone(initialStore);
  return { ...structuredClone(initialStore), ...JSON.parse(raw), forms: { ...initialStore.forms, ...(JSON.parse(raw).forms || {}) } };
}

function saveStore() {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  localStorage.setItem('aqua.field.nodeUrl', store.nodeUrl);
  localStorage.setItem('aqua.field.route', store.route);
}

function setForm(key, value) {
  store.forms[key] = value;
  saveStore();
}

function setRoute(route) {
  store.route = route;
  saveStore();
  render();
}

function toast(message, bad = false) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = `toast${bad ? ' bad' : ''}`;
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 3500);
}

async function run(task) {
  try {
    await task();
    store.lastError = '';
    saveStore();
    render();
  } catch (error) {
    store.lastError = String(error.message || error);
    saveStore();
    render();
    toast(store.lastError, true);
  }
}

function render() {
  const state = deriveState(store.events);
  const account = store.account;
  app.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">
          <div class="brand-lock">
            <div class="mark">A</div>
            <div>
              <h1>Aqua Field</h1>
              <p class="small">${account ? short(account.publicKey) : 'No account yet'}</p>
            </div>
          </div>
          <div class="status"><span class="dot ${account ? 'ok' : ''}"></span>${account ? 'Ready' : 'Start here'}</div>
        </div>
        <nav class="tabs">
          ${routes.map(([id, label]) => `<button class="${store.route === id ? 'active' : ''}" data-route="${id}">${label}</button>`).join('')}
        </nav>
      </header>
      <main class="content">${screen(store.route, state)}</main>
      <footer class="footer">Aqua Field stores keys and events in this browser on this phone.</footer>
    </div>
  `;
  bind();
}

function screen(route, state) {
  if (route === 'account') return accountScreen();
  if (route === 'money') return moneyScreen(state);
  if (route === 'civic') return civicScreen(state);
  if (route === 'chat') return chatScreen(state);
  if (route === 'dex') return dexScreen(state);
  if (route === 'sync') return syncScreen(state);
  return homeScreen(state);
}

function homeScreen(state) {
  const balance = currentBalance(state);
  return `
    <section class="metrics">
      ${metric('Aqua', balance.aqua, 'accent')}
      ${metric('Locked', balance.locked, 'blue')}
      ${metric('Events', store.events.length)}
      ${metric('Pending', store.pending.length, 'warn')}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Field Test</h2><span class="pill ${store.account ? 'ok' : 'bad'}">${store.account ? 'Account ready' : 'Create account'}</span></div>
      <p class="small">Use this on several phones. Create one account per phone, sync each phone to the same reachable Aqua node, then try transfers, proposals, votes, proxy votes, chat rooms, and DEX escrow.</p>
      <div class="actions">
        <button data-route="account">Create account</button>
        <button class="secondary" data-route="sync">Sync</button>
        <button class="secondary" data-route="money">Send</button>
      </div>
    </section>
    ${eventPanel('Recent local events', store.events.slice(-6).reverse())}
  `;
}

function accountScreen() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Account</h2><span class="pill ${store.account ? 'ok' : 'bad'}">${store.account ? 'Created' : 'Missing'}</span></div>
      <div class="grid two">
        ${field('Name', 'name')}
        ${field('Passphrase', 'passphrase', 'type="password" autocomplete="new-password"')}
      </div>
      <div class="actions">
        <button data-action="createAccount">Create New Account</button>
        <button class="secondary" data-action="copyPubkey" ${store.account ? '' : 'disabled'}>Copy Public Key</button>
      </div>
      <pre>${escapeHtml(JSON.stringify(publicAccount(), null, 2))}</pre>
    </section>
  `;
}

function moneyScreen(state) {
  const balance = currentBalance(state);
  return `
    <section class="metrics">
      ${metric('Aqua', balance.aqua, 'accent')}
      ${metric('Fire Paid', balance.firePaid, 'warn')}
      ${metric('Sump', balance.sump)}
      ${metric('Earth', balance.earthReserve, 'blue')}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Transfer</h2><span class="pill">4% Fire</span></div>
      <div class="grid">
        ${area('Receiver public key', 'to')}
        ${field('Amount', 'amount', 'type="number" min="0" step="1"')}
      </div>
      <div class="actions">
        <button data-action="sendAqua">Create Transfer</button>
        <button class="secondary" data-action="claimAqua">Claim Weekly Aqua From Node</button>
      </div>
    </section>
  `;
}

function civicScreen(state) {
  const tally = store.forms.proposalId ? tallyProposal(store.events, store.forms.proposalId) : null;
  return `
    <section class="panel">
      <div class="panel-head"><h2>Proposal</h2><span class="pill">one verified human, one vote</span></div>
      <div class="grid">
        ${field('Title', 'proposalTitle')}
        ${area('Body', 'proposalBody')}
      </div>
      <div class="actions"><button data-action="createProposal">Create Proposal</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Vote / Proxy / Outcome</h2><span class="pill">${tally ? `${Object.keys(tally.counted).length} counted` : 'No tally'}</span></div>
      <div class="grid two">
        ${field('Proposal ID', 'proposalId')}
        ${selectField('Choice', 'voteChoice', ['yes', 'no', 'abstain'])}
      </div>
      ${area('Proxy public key', 'proxy')}
      <div class="actions">
        <button data-action="castVote">Vote</button>
        <button class="secondary" data-action="setProxy">Set Proxy</button>
        <button class="secondary" data-action="publishOutcome">Publish Outcome</button>
      </div>
      <pre>${escapeHtml(JSON.stringify(tally || {}, null, 2))}</pre>
    </section>
    ${eventPanel('Governance events', store.events.filter((event) => event.module === 'governance').slice(-8).reverse())}
  `;
}

function chatScreen(state) {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Chaos Chat</h2><span class="pill">${state.chat.rooms.size} rooms</span></div>
      <div class="grid two">
        ${field('Room ID', 'chatRoom')}
        ${field('Room name', 'chatRoomName')}
      </div>
      ${area('Message', 'chatText')}
      <div class="actions">
        <button data-action="createRoom">Create Room</button>
        <button class="secondary" data-action="sendChat">Send Message</button>
      </div>
    </section>
    ${eventPanel('Chat events', store.events.filter((event) => event.module === 'chat').slice(-12).reverse())}
  `;
}

function dexScreen(state) {
  return `
    <section class="panel">
      <div class="panel-head"><h2>List Exchange</h2><span class="pill">${state.dex.quotes.length} active quotes</span></div>
      <div class="grid two">
        ${selectField('Side', 'quoteSide', ['sell', 'buy'])}
        ${field('Amount', 'quoteAmount', 'type="number" min="0" step="1"')}
        ${field('Price', 'quotePrice', 'type="number" min="0" step="0.01"')}
      </div>
      <div class="actions"><button data-action="createQuote">List Exchange</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Verify / Swap</h2><span class="pill">${state.dex.escrows.size} escrows</span></div>
      <div class="grid">
        ${field('Quote ID', 'quoteId')}
        ${area('Seller public key', 'escrowSeller')}
        ${field('Escrow amount', 'escrowAmount', 'type="number" min="0" step="1"')}
        ${field('Escrow ID', 'escrowId')}
        ${area('Buyer public key', 'escrowBuyer')}
      </div>
      <div class="actions">
        <button data-action="openEscrow">Open Escrow</button>
        <button class="secondary" data-action="verifyDex">Verify</button>
        <button class="secondary" data-action="releaseEscrow">Release / Swap</button>
      </div>
    </section>
    ${eventPanel('DEX events', store.events.filter((event) => event.module === 'dex').slice(-12).reverse())}
  `;
}

function syncScreen() {
  const bluetooth = 'bluetooth' in navigator;
  return `
    <section class="panel">
      <div class="panel-head"><h2>Network Sync</h2><span class="pill ${store.lastSync ? 'ok' : ''}">${store.lastSync ? 'synced' : 'not synced'}</span></div>
      <label>Node URL<input id="nodeUrl" value="${escapeAttr(store.nodeUrl)}" /></label>
      <div class="actions">
        <button data-action="syncNode">Push / Pull Node</button>
        <button class="secondary" data-action="pullNode">Pull Only</button>
      </div>
      <p class="small">For real phones, use a node URL the phone can reach, such as an HTTPS tunnel or a computer LAN IP.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Nearby Exchange</h2><span class="pill ${bluetooth ? 'ok' : 'bad'}">Bluetooth API ${bluetooth ? 'visible' : 'missing'}</span></div>
      <div class="actions">
        <button data-action="exportBundle">Export Bundle File</button>
        <button class="secondary" data-action="copyBundle">Copy Bundle Text</button>
        <button class="secondary" data-action="checkBluetooth">Check Bluetooth</button>
      </div>
      ${area('Import bundle text', 'importText')}
      <div class="actions"><button class="secondary" data-action="importBundle">Import Bundle Text</button></div>
      <p class="small">Browser Bluetooth is BLE device access, not reliable phone-to-phone Aqua sync. For now, use file share, QR/text handoff, or network sync for field tests.</p>
    </section>
  `;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function field(label, key, attrs = '') {
  return `<label>${label}<input data-form="${key}" value="${escapeAttr(store.forms[key] || '')}" ${attrs} /></label>`;
}

function area(label, key) {
  return `<label>${label}<textarea data-form="${key}">${escapeHtml(store.forms[key] || '')}</textarea></label>`;
}

function selectField(label, key, options) {
  return `<label>${label}<select data-form="${key}">${options.map((option) => `<option value="${escapeAttr(option)}"${store.forms[key] === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function eventPanel(title, events) {
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2><span class="pill">${events.length}</span></div>${eventList(events)}</section>`;
}

function eventList(events) {
  if (!events.length) return '<p class="small">No events yet.</p>';
  return `<div class="event-list">${events.map((event) => `
    <article class="event">
      <strong>${escapeHtml(event.type)}</strong>
      <span class="small">${escapeHtml(event.module)} | ${new Date(event.createdAt).toLocaleString()}</span>
      <span class="mono">${escapeHtml(short(event.id))}</span>
    </article>
  `).join('')}</div>`;
}

function bind() {
  document.querySelectorAll('[data-route]').forEach((el) => el.addEventListener('click', () => setRoute(el.dataset.route)));
  document.querySelectorAll('[data-form]').forEach((el) => el.addEventListener('input', () => setForm(el.dataset.form, el.value)));
  document.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', () => actions[el.dataset.action]?.()));
  document.getElementById('nodeUrl')?.addEventListener('change', (event) => {
    store.nodeUrl = event.target.value.trim();
    saveStore();
  });
}

const actions = {
  createAccount: () => run(async () => {
    requireSecureCrypto();
    const passphrase = store.forms.passphrase;
    if (!passphrase || passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
    const keypair = await generateIdentityKeypair();
    store.account = {
      publicKey: keypair.publicKey,
      encryptedPrivateKey: await encryptText(keypair.privateKey, passphrase),
      name: store.forms.name || 'field-human',
      createdAt: Date.now()
    };
    await addLocalEvent(await createEvent('identity', 'identity.claim', { name: store.account.name, privacy: 'no private personal data on ledger' }));
    await addLocalEvent(await createEvent('identity', 'identity.pohw_attest', { subject: store.account.publicKey, status: 'locally_verified', method: 'field-local-attestation', biometricData: false }));
    toast('Account created');
  }),
  copyPubkey: () => run(async () => {
    if (!store.account) throw new Error('Create an account first.');
    await navigator.clipboard.writeText(store.account.publicKey);
    toast('Public key copied');
  }),
  claimAqua: () => run(async () => {
    await syncNode();
    if (!store.account) throw new Error('Create an account first.');
    const res = await fetch(`${store.nodeUrl}/money/issue-weekly`, postBody({ pubkey: store.account.publicKey }));
    if (!res.ok) throw new Error(await res.text());
    await pullNode();
    toast('Weekly Aqua requested');
  }),
  sendAqua: () => run(async () => {
    await addLocalEvent(await createEvent('money', 'money.transfer', transferPayload(store.forms.to.trim(), Number(store.forms.amount))));
    toast('Transfer queued');
  }),
  createProposal: () => run(async () => {
    const event = await createEvent('governance', 'governance.proposal_create', { title: store.forms.proposalTitle, body: store.forms.proposalBody, choices: ['yes', 'no', 'abstain'] });
    await addLocalEvent(event);
    store.forms.proposalId = event.id;
    toast('Proposal created');
  }),
  castVote: () => run(async () => {
    await addLocalEvent(await createEvent('governance', 'governance.vote_cast', { proposalId: store.forms.proposalId.trim(), choice: store.forms.voteChoice }));
    toast('Vote queued');
  }),
  setProxy: () => run(async () => {
    await addLocalEvent(await createEvent('governance', 'governance.proxy_set', { proxy: store.forms.proxy.trim() }));
    toast('Proxy queued');
  }),
  publishOutcome: () => run(async () => {
    const tally = tallyProposal(store.events, store.forms.proposalId.trim());
    await addLocalEvent(await createEvent('governance', 'governance.outcome_publish', { proposalId: store.forms.proposalId.trim(), tally: tally.tally, note: 'Published from Aqua Field.' }));
    toast('Outcome queued');
  }),
  createRoom: () => run(async () => {
    await addLocalEvent(await createEvent('chat', 'chat.room_create', { roomId: store.forms.chatRoom.trim(), name: store.forms.chatRoomName.trim(), topic: 'Field room' }));
    toast('Room queued');
  }),
  sendChat: () => run(async () => {
    await addLocalEvent(await createEvent('chat', 'chat.message_create', { roomId: store.forms.chatRoom.trim(), text: store.forms.chatText.trim() }));
    toast('Message queued');
  }),
  createQuote: () => run(async () => {
    const event = await createEvent('dex', 'dex.quote_create', { side: store.forms.quoteSide, base: 'AQUA', quote: 'LOCAL', amount: Number(store.forms.quoteAmount), price: Number(store.forms.quotePrice), expiresAt: Date.now() + 3600_000, binding: false, note: 'signed speech until escrow opens' });
    await addLocalEvent(event);
    store.forms.quoteId = event.id;
    toast('Quote queued');
  }),
  openEscrow: () => run(async () => {
    const payload = { buyer: store.account?.publicKey, seller: store.forms.escrowSeller.trim(), amount: Number(store.forms.escrowAmount), quoteId: store.forms.quoteId.trim() || undefined };
    const event = await createEvent('dex', 'dex.escrow_open', payload);
    await addLocalEvent(event);
    store.forms.escrowId = event.id;
    toast('Escrow queued');
  }),
  verifyDex: () => run(async () => {
    await addLocalEvent(await createEvent('dex', 'dex.witness_attest', { subjectEventId: store.forms.escrowId.trim() || store.forms.quoteId.trim(), statement: 'off-chain condition observed', bondedIdentity: store.account?.publicKey, stub: true }));
    toast('Witness queued');
  }),
  releaseEscrow: () => run(async () => {
    await addLocalEvent(await createEvent('dex', 'dex.escrow_release', { escrowId: store.forms.escrowId.trim(), buyer: store.forms.escrowBuyer.trim(), seller: store.account?.publicKey, amount: Number(store.forms.escrowAmount) }));
    toast('Release queued');
  }),
  syncNode: () => run(syncNode),
  pullNode: () => run(pullNode),
  exportBundle: () => run(exportBundleFile),
  copyBundle: () => run(async () => {
    await navigator.clipboard.writeText(JSON.stringify(bundle(), null, 2));
    toast('Bundle copied');
  }),
  importBundle: () => run(async () => {
    await importEvents(JSON.parse(store.forms.importText));
    toast('Bundle imported');
  }),
  checkBluetooth: () => run(async () => {
    if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth is not available in this browser.');
    const available = await navigator.bluetooth.getAvailability();
    toast(`Bluetooth API available: ${available}`);
  })
};

async function addLocalEvent(event) {
  await assertValidEvent(event, store.events);
  if (!store.events.some((item) => item.id === event.id)) store.events.push(event);
  if (!store.pending.includes(event.id)) store.pending.push(event.id);
  saveStore();
}

async function syncNode() {
  if (!store.nodeUrl) throw new Error('Set a node URL first.');
  for (const id of [...store.pending]) {
    const event = store.events.find((item) => item.id === id);
    if (!event) continue;
    const res = await fetch(`${store.nodeUrl}/event`, postBody(event));
    if (res.ok) store.pending = store.pending.filter((item) => item !== id);
    else throw new Error(await res.text());
  }
  await pullNode();
  store.lastSync = new Date().toISOString();
  toast('Synced');
}

async function pullNode() {
  const res = await fetch(`${store.nodeUrl}/events`);
  if (!res.ok) throw new Error(await res.text());
  await importEvents(await res.json(), false);
  store.lastSync = new Date().toISOString();
  saveStore();
}

async function importEvents(input, markPending = false) {
  const events = Array.isArray(input) ? input : input.events;
  if (!Array.isArray(events)) throw new Error('Invalid bundle.');
  const accepted = [...store.events].sort(compareEvents);
  for (const event of events.slice().sort(compareEvents)) {
    if (!store.events.some((item) => item.id === event.id)) {
      await assertValidEvent(event, accepted);
      store.events.push(event);
      accepted.push(event);
      accepted.sort(compareEvents);
      if (markPending) store.pending.push(event.id);
    }
  }
  store.events.sort(compareEvents);
  saveStore();
}

function bundle() {
  return { protocol: BASE_PROTOCOL, exportedAt: Date.now(), events: store.events };
}

function exportBundleFile() {
  const blob = new Blob([JSON.stringify(bundle(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aqua-field-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function postBody(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

async function assertValidEvent(event, currentEvents) {
  const check = await validateEvent(event, currentEvents);
  if (!check.ok) throw new Error(`Rejected event ${short(event?.id || 'unknown')}: ${check.reason}`);
}

async function validateEvent(event, currentEvents) {
  if (!event || typeof event !== 'object') return fail('event-not-object');
  if (event.protocol !== BASE_PROTOCOL) return fail('unsupported-protocol');
  if (!['system', 'identity', 'money', 'governance', 'dex', 'chat'].includes(event.module)) return fail('unknown-module');
  if (event.moduleVersion !== MODULE_VERSION) return fail('unsupported-module-version');
  if (typeof event.type !== 'string' || !event.type) return fail('event-type-required');
  if (!Number.isFinite(event.createdAt)) return fail('invalid-created-at');
  if (typeof event.author !== 'string' || !event.author) return fail('event-author-required');
  if (!Array.isArray(event.parents) || event.parents.length > 2) return fail('invalid-parents');
  if (!event.parents.every((parent) => typeof parent === 'string')) return fail('invalid-parent-id');
  if (!event.parents.every((parent) => currentEvents.some((item) => item.id === parent))) return fail('unknown-parent');
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return fail('invalid-payload');
  if (event.id !== await eventIdFor(event)) return fail('event-id-mismatch');
  if (!await verifyEventSignature(event)) return fail('invalid-signature');
  return validateModuleEvent(event, currentEvents);
}

async function eventIdFor(event) {
  return sha256Hex(canonicalJson(eventSigningBody(event)));
}

async function verifyEventSignature(event) {
  try {
    const publicKey = await crypto.subtle.importKey('spki', base64ToArrayBuffer(event.author), { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, publicKey, base64ToArrayBuffer(event.signature), textBytes(canonicalJson(eventSigningBody(event))));
  } catch {
    return false;
  }
}

function eventSigningBody(event) {
  return {
    protocol: event.protocol ?? BASE_PROTOCOL,
    module: event.module ?? 'system',
    moduleVersion: event.moduleVersion ?? MODULE_VERSION,
    type: event.type ?? 'system.unknown',
    createdAt: event.createdAt ?? Date.now(),
    author: event.author ?? '',
    parents: event.parents ?? [],
    payload: event.payload ?? {}
  };
}

function validateModuleEvent(event, currentEvents) {
  if (event.module === 'identity') return validateIdentityEvent(event);
  if (event.module === 'money') return validateMoneyEvent(event, currentEvents);
  if (event.module === 'governance') return validateGovernanceEvent(event, currentEvents);
  if (event.module === 'chat') return validateChatEvent(event, currentEvents);
  if (event.module === 'dex') return validateDexEvent(event, currentEvents);
  return { ok: true };
}

function validateIdentityEvent(event) {
  if (event.type === 'identity.claim') {
    if (typeof event.payload.name !== 'string' || !event.payload.name.trim()) return fail('identity-name-required');
    return { ok: true };
  }
  if (event.type === 'identity.pohw_attest') {
    if (typeof event.payload.subject !== 'string' || !event.payload.subject) return fail('pohw-subject-required');
    if (!['unverified', 'locally_verified', 'vouched', 'challenged', 'archived'].includes(event.payload.status)) return fail('invalid-pohw-status');
    return { ok: true };
  }
  return fail('identity-type-not-allowed');
}

function validateMoneyEvent(event, currentEvents) {
  const ids = identityState(currentEvents).verified;
  if (event.type === 'money.genesis') {
    if (!positive(event.payload.earthTotal)) return fail('invalid-earth-total');
    if (currentEvents.some((item) => item.type === 'money.genesis')) return fail('duplicate-genesis');
    return { ok: true };
  }
  if (event.type === 'money.issue_aqua') {
    if (!positive(event.payload.amount)) return fail('invalid-issue-amount');
    if (!ids.includes(event.payload.to)) return fail('issue-recipient-not-verified');
    return { ok: true };
  }
  if (event.type === 'money.transfer') {
    if (event.payload.from && event.payload.from !== event.author) return fail('transfer-from-author-mismatch');
    if (typeof event.payload.to !== 'string' || !event.payload.to) return fail('transfer-recipient-required');
    if (!positive(event.payload.amount)) return fail('invalid-transfer-amount');
    const fire = round(event.payload.amount * 0.04);
    if (round(event.payload.fireAmount) !== fire) return fail('invalid-fire-amount');
    if (round(event.payload.netAmount) !== round(event.payload.amount - fire)) return fail('invalid-net-amount');
    if (!canSpend(currentEvents, event.author, event.payload.amount)) return fail('insufficient-balance');
    return { ok: true };
  }
  return fail('money-type-not-allowed');
}

function validateGovernanceEvent(event, currentEvents) {
  const ids = identityState(currentEvents).verified;
  const gov = governanceState(currentEvents);
  if (event.type === 'governance.proposal_create') {
    if (!ids.includes(event.author)) return fail('proposal-author-not-verified');
    if (typeof event.payload.title !== 'string' || !event.payload.title.trim()) return fail('proposal-title-required');
    if (!Array.isArray(event.payload.choices) || event.payload.choices.length < 2) return fail('proposal-choices-required');
    return { ok: true };
  }
  if (event.type === 'governance.vote_cast') {
    const proposal = gov.proposals.get(event.payload.proposalId);
    if (!ids.includes(event.author)) return fail('vote-author-not-verified');
    if (!proposal) return fail('proposal-not-found');
    if (!proposal.payload.choices.includes(event.payload.choice)) return fail('invalid-vote-choice');
    return { ok: true };
  }
  if (event.type === 'governance.proxy_set') {
    if (!ids.includes(event.author)) return fail('proxy-author-not-verified');
    if (!ids.includes(event.payload.proxy)) return fail('proxy-target-not-verified');
    if (event.payload.proxy === event.author) return fail('self-proxy-not-allowed');
    return { ok: true };
  }
  if (event.type === 'governance.outcome_publish') {
    if (!ids.includes(event.author)) return fail('outcome-author-not-verified');
    if (!gov.proposals.has(event.payload.proposalId)) return fail('proposal-not-found');
    if (!event.payload.tally || typeof event.payload.tally !== 'object') return fail('outcome-tally-required');
    return { ok: true };
  }
  return fail('governance-type-not-allowed');
}

function validateChatEvent(event, currentEvents) {
  const ids = identityState(currentEvents).verified;
  const chat = chatState(currentEvents);
  if (!ids.includes(event.author)) return fail('chat-author-not-verified');
  if (event.type === 'chat.room_create') {
    if (typeof event.payload.roomId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,48}$/i.test(event.payload.roomId)) return fail('invalid-room-id');
    if (chat.rooms.has(event.payload.roomId)) return fail('room-already-exists');
    return { ok: true };
  }
  if (event.type === 'chat.message_create') {
    if (!chat.rooms.has(event.payload.roomId)) return fail('room-not-found');
    if (typeof event.payload.text !== 'string' || !event.payload.text.trim()) return fail('chat-message-required');
    return { ok: true };
  }
  return fail('chat-type-not-allowed');
}

function validateDexEvent(event, currentEvents) {
  const dex = dexState(currentEvents);
  if (event.type === 'dex.quote_create') {
    if (!['buy', 'sell'].includes(event.payload.side)) return fail('invalid-quote-side');
    if (!positive(event.payload.amount) || !positive(event.payload.price)) return fail('invalid-quote');
    if (!Number.isFinite(event.payload.expiresAt) || event.payload.expiresAt <= event.createdAt) return fail('quote-expired-at-create');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_open') {
    if (event.payload.buyer !== event.author) return fail('escrow-buyer-author-mismatch');
    if (typeof event.payload.seller !== 'string' || !event.payload.seller) return fail('escrow-seller-required');
    if (!positive(event.payload.amount)) return fail('invalid-escrow-amount');
    if (event.payload.quoteId && !dex.quotes.some((quote) => quote.id === event.payload.quoteId)) return fail('quote-not-active');
    if (!canSpend(currentEvents, event.author, event.payload.amount)) return fail('insufficient-balance');
    return { ok: true };
  }
  if (event.type === 'dex.witness_attest') {
    if (typeof event.payload.subjectEventId !== 'string' || !event.payload.subjectEventId) return fail('witness-subject-required');
    return { ok: true };
  }
  if (event.type === 'dex.escrow_release' || event.type === 'dex.escrow_refund') {
    const escrow = dex.escrows.get(event.payload.escrowId);
    if (!escrow) return fail('escrow-not-found');
    if (escrow.status !== 'open') return fail('escrow-already-settled');
    if (escrow.buyer !== event.payload.buyer) return fail('escrow-buyer-mismatch');
    if (event.payload.amount !== escrow.amount) return fail('escrow-amount-mismatch');
    if (event.type === 'dex.escrow_release') {
      if (event.author !== escrow.seller) return fail('escrow-release-author-not-seller');
      if (event.payload.seller !== escrow.seller) return fail('escrow-seller-mismatch');
    }
    return { ok: true };
  }
  return fail('dex-type-not-allowed');
}

function canSpend(events, pubkey, amount) {
  return (moneyState(events).aqua.get(pubkey) || 0) >= amount;
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function fail(reason) {
  return { ok: false, reason };
}

async function generateIdentityKeypair() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = arrayBufferToBase64(await crypto.subtle.exportKey('spki', pair.publicKey));
  const privateKey = arrayBufferToBase64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { publicKey, privateKey };
}

async function createEvent(module, type, payload = {}) {
  if (!store.account) throw new Error('Create an account first.');
  const body = signingBody({ module, type, author: store.account.publicKey, parents: recentParentIds(), payload });
  const text = canonicalJson(body);
  const privateKeyBase64 = await unlockPrivateKey();
  const privateKey = await crypto.subtle.importKey('pkcs8', base64ToArrayBuffer(privateKeyBase64), { name: 'Ed25519' }, false, ['sign']);
  return { ...body, id: await sha256Hex(text), signature: arrayBufferToBase64(await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, textBytes(text))) };
}

async function unlockPrivateKey() {
  if (!store.forms.passphrase) throw new Error('Enter your passphrase to sign.');
  if (!store.account?.encryptedPrivateKey) throw new Error('Missing encrypted private key.');
  return decryptText(store.account.encryptedPrivateKey, store.forms.passphrase);
}

function signingBody(event) {
  return {
    protocol: event.protocol || BASE_PROTOCOL,
    module: event.module || 'system',
    moduleVersion: event.moduleVersion || MODULE_VERSION,
    type: event.type || 'system.unknown',
    createdAt: event.createdAt || Date.now(),
    author: event.author || '',
    parents: event.parents || [],
    payload: event.payload || {}
  };
}

function recentParentIds() {
  return store.events.slice().sort(compareEvents).slice(-2).map((event) => event.id);
}

function transferPayload(to, amount) {
  const fire = round(amount * 0.04);
  return { from: store.account?.publicKey, to, amount, netAmount: round(amount - fire), fireAmount: fire, fireTaxRate: 0.04 };
}

function deriveState(events) {
  const state = { identity: identityState(events), money: moneyState(events), governance: governanceState(events), chat: chatState(events), dex: dexState(events) };
  return state;
}

function identityState(events) {
  const pohw = new Map();
  const claims = new Map();
  for (const event of events) {
    if (event.module !== 'identity') continue;
    if (event.type === 'identity.claim') {
      claims.set(event.author, event);
      if (!pohw.has(event.author)) pohw.set(event.author, 'unverified');
    }
    if (event.type === 'identity.pohw_attest') pohw.set(event.payload.subject || event.author, event.payload.status);
  }
  const verified = [...pohw.entries()].filter(([, status]) => status === 'locally_verified' || status === 'vouched').map(([pubkey]) => pubkey).sort();
  return { claims, pohw, verified };
}

function moneyState(events) {
  const aqua = new Map();
  const locked = new Map();
  const firePaid = new Map();
  let sump = 0;
  let earthReserve = 0;
  for (const event of events.slice().sort(compareEvents)) {
    if (event.type === 'money.genesis') earthReserve = event.payload.earthTotal;
    if (event.type === 'money.issue_aqua') add(aqua, event.payload.to, event.payload.amount);
    if (event.type === 'money.transfer') {
      add(aqua, event.author, -event.payload.amount);
      add(aqua, event.payload.to, event.payload.netAmount);
      add(firePaid, event.author, event.payload.fireAmount);
      sump = round(sump + event.payload.fireAmount);
    }
    if (event.type === 'dex.escrow_open') {
      add(aqua, event.payload.buyer, -event.payload.amount);
      add(locked, event.payload.buyer, event.payload.amount);
    }
    if (event.type === 'dex.escrow_release') {
      add(locked, event.payload.buyer, -event.payload.amount);
      add(aqua, event.payload.seller, event.payload.amount);
    }
    if (event.type === 'dex.escrow_refund') {
      add(locked, event.payload.buyer, -event.payload.amount);
      add(aqua, event.payload.buyer, event.payload.amount);
    }
  }
  return { aqua, locked, firePaid, sump, earthReserve };
}

function governanceState(events) {
  const proposals = new Map();
  const votes = new Map();
  const proxies = new Map();
  for (const event of events) {
    if (event.module !== 'governance') continue;
    if (event.type === 'governance.proposal_create') proposals.set(event.id, event);
    if (event.type === 'governance.vote_cast') {
      if (!votes.has(event.payload.proposalId)) votes.set(event.payload.proposalId, new Map());
      votes.get(event.payload.proposalId).set(event.author, event);
    }
    if (event.type === 'governance.proxy_set') proxies.set(event.author, event.payload.proxy);
    if (event.type === 'governance.proxy_revoke') proxies.delete(event.author);
  }
  return { proposals, votes, proxies };
}

function tallyProposal(events, proposalId) {
  const ids = identityState(events).verified;
  const gov = governanceState(events);
  const directVotes = gov.votes.get(proposalId) || new Map();
  const tally = {};
  const counted = {};
  for (const voter of ids) {
    const direct = directVotes.get(voter);
    if (direct) {
      tally[direct.payload.choice] = (tally[direct.payload.choice] || 0) + 1;
      counted[voter] = `direct:${direct.payload.choice}`;
      continue;
    }
    const proxy = gov.proxies.get(voter);
    const proxyVote = proxy ? directVotes.get(proxy) : undefined;
    if (proxyVote) {
      tally[proxyVote.payload.choice] = (tally[proxyVote.payload.choice] || 0) + 1;
      counted[voter] = `proxy:${proxy}:${proxyVote.payload.choice}`;
    }
  }
  return { proposalId, tally, counted, verifiedHumans: ids.length };
}

function chatState(events) {
  const rooms = new Map();
  const messages = new Map();
  for (const event of events) {
    if (event.module !== 'chat') continue;
    if (event.type === 'chat.room_create') {
      rooms.set(event.payload.roomId, event);
      if (!messages.has(event.payload.roomId)) messages.set(event.payload.roomId, []);
    }
    if (event.type === 'chat.message_create') {
      if (!messages.has(event.payload.roomId)) messages.set(event.payload.roomId, []);
      messages.get(event.payload.roomId).push(event);
    }
  }
  return { rooms, messages };
}

function dexState(events) {
  const quotes = [];
  const cancelled = new Set();
  const escrows = new Map();
  const witnesses = [];
  for (const event of events) {
    if (event.type === 'dex.quote_cancel') cancelled.add(event.payload.quoteId);
    if (event.type === 'dex.quote_create' && event.payload.expiresAt > Date.now()) quotes.push(event);
    if (event.type === 'dex.escrow_open') escrows.set(event.id, { ...event.payload, id: event.id, status: 'open' });
    if (event.type === 'dex.escrow_release') escrows.get(event.payload.escrowId) && (escrows.get(event.payload.escrowId).status = 'released');
    if (event.type === 'dex.escrow_refund') escrows.get(event.payload.escrowId) && (escrows.get(event.payload.escrowId).status = 'refunded');
    if (event.type === 'dex.witness_attest') witnesses.push(event);
  }
  return { quotes: quotes.filter((quote) => !cancelled.has(quote.id)), escrows, witnesses };
}

function currentBalance(state) {
  const key = store.account?.publicKey || '';
  return {
    aqua: round(state.money.aqua.get(key) || 0),
    locked: round(state.money.locked.get(key) || 0),
    firePaid: round(state.money.firePaid.get(key) || 0),
    sump: round(state.money.sump),
    earthReserve: round(state.money.earthReserve)
  };
}

function publicAccount() {
  if (!store.account) return {};
  return { publicKey: store.account.publicKey, name: store.account.name, createdAt: store.account.createdAt };
}

async function encryptText(text, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textBytes(text));
  return { salt: arrayBufferToBase64(salt), iv: arrayBufferToBase64(iv), cipher: arrayBufferToBase64(cipher) };
}

async function decryptText(blob, passphrase) {
  const salt = new Uint8Array(base64ToArrayBuffer(blob.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(blob.iv));
  const key = await passphraseKey(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToArrayBuffer(blob.cipher));
  return new TextDecoder().decode(plain);
}

async function passphraseKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey('raw', textBytes(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function add(map, key, amount) {
  map.set(key, round((map.get(key) || 0) + amount));
}

function round(value) {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function compareEvents(a, b) {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

async function sha256Hex(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', textBytes(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function textBytes(text) {
  return new TextEncoder().encode(text);
}

function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(value) {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes.buffer;
}

function short(value) {
  if (!value) return '-';
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function requireSecureCrypto() {
  if (!crypto?.subtle) throw new Error('Web Crypto is unavailable. Serve this app over HTTPS or localhost.');
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('\n', '&#10;');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

render();
