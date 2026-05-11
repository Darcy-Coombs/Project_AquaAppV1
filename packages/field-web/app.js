import {
  createEvent,
  generateIdentityKeypair,
  normalizeEvent,
  sha256Hex,
  signEvent,
  textBytes
} from './protocol/events.js';
import {
  BETA_OVERRIDE,
  applyEvent,
  compareEvents,
  deterministicCommittee,
  getAquaBalance,
  getIdentity,
  isVerifiedIdentity,
  replayEvents,
  round,
  tallyProposal
} from './protocol/state.js';
import { validateEvent } from './protocol/validator.js';

const STORE_KEY = 'aqua.field.v2';
const OLD_STORE_KEY = 'aqua.field.v1';
const POHW_PHRASE = 'Aqua field beta';
const WITNESS_THRESHOLD = 1;

const initialStore = {
  account: null,
  events: [],
  pending: [],
  nodeUrl: localStorage.getItem('aqua.field.nodeUrl') || 'http://localhost:7001',
  route: localStorage.getItem('aqua.field.route') || 'home',
  importSummary: null,
  lastSync: null,
  lastError: '',
  forms: {
    email: '',
    passphrase: '',
    pohwPhrase: '',
    pohwAnswer: '',
    betaCode: '',
    to: '',
    amount: '25',
    issueAmount: '480',
    proposalTitle: 'Field proposal',
    proposalBody: '',
    proposalId: '',
    voteChoice: 'yes',
    proxy: '',
    committeeRound: 'round-1',
    committeeCount: '3',
    chatRoom: 'chaos-harbour',
    chatRoomName: 'Chaos Harbour',
    chatText: '',
    roomCreditTo: '',
    roomCreditAmount: '5',
    quoteSide: 'sell',
    quoteAmount: '10',
    quotePrice: '1',
    quoteId: '',
    escrowSeller: '',
    escrowAmount: '10',
    escrowId: '',
    escrowBuyer: '',
    importText: ''
  }
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
  const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY);
  if (!raw) return structuredClone(initialStore);
  const parsed = JSON.parse(raw);
  return {
    ...structuredClone(initialStore),
    ...parsed,
    forms: { ...initialStore.forms, ...(parsed.forms || {}) },
    importSummary: parsed.importSummary || null
  };
}

function saveStore() {
  const safeStore = { ...store, forms: { ...store.forms, betaCode: '' } };
  localStorage.setItem(STORE_KEY, JSON.stringify(safeStore));
  localStorage.setItem('aqua.field.nodeUrl', store.nodeUrl);
  localStorage.setItem('aqua.field.route', store.route);
}

function stateNow() {
  return replayEvents(store.events, { now: Date.now() });
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
  const state = stateNow();
  const identity = currentIdentity(state);
  app.innerHTML = `
    <div class="shell">
      <header class="top">
        <div class="brand">
          <div class="brand-lock">
            <div class="mark">A</div>
            <div>
              <h1>Aqua Field</h1>
              <p class="small">${store.account ? short(store.account.publicKey) : 'No account yet'}</p>
            </div>
          </div>
          <div class="status"><span class="dot ${store.account ? 'ok' : ''}"></span>${identityLabel(identity)}</div>
        </div>
        <nav class="tabs">
          ${routes.map(([id, label]) => `<button class="${store.route === id ? 'active' : ''}" data-route="${id}">${label}</button>`).join('')}
        </nav>
      </header>
      <main class="content">${screen(store.route, state)}</main>
      <footer class="footer">Aqua Field keeps raw email and encrypted keys only in this browser. Protocol events contain hashes and signatures.</footer>
    </div>
  `;
  bind();
}

function screen(route, state) {
  if (route === 'account') return accountScreen(state);
  if (route === 'money') return moneyScreen(state);
  if (route === 'civic') return civicScreen(state);
  if (route === 'chat') return chatScreen(state);
  if (route === 'dex') return dexScreen(state);
  if (route === 'sync') return syncScreen();
  return homeScreen(state);
}

function homeScreen(state) {
  const balance = currentBalance(state);
  const identity = currentIdentity(state);
  return `
    <section class="metrics">
      ${metric('Aqua', balance.aqua, 'accent')}
      ${metric('Fire Paid', balance.firePaid, 'warn')}
      ${metric('Sump', balance.sump)}
      ${metric('Earth', balance.earth, 'blue')}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Field Machine</h2>${identityBadge(identity)}</div>
      ${identity.betaOverrideActive ? '<span class="pill warn">BETA OVERRIDE ACTIVE</span>' : ''}
      <p class="small">Validator is active for local events, imports, and node sync. LEVEL_0 can chat. Verified PoHW or temporary beta override is required for UBI, voting, proxying, committee actions, and DEX witness work.</p>
      <div class="actions">
        <button data-route="account">Account</button>
        <button class="secondary" data-route="money">Send</button>
        <button class="secondary" data-route="sync">Sync</button>
      </div>
    </section>
    ${eventPanel('Recent accepted events', store.events.slice(-6).reverse())}
  `;
}

function accountScreen(state) {
  const identity = currentIdentity(state);
  return `
    <section class="panel">
      <div class="panel-head"><h2>Identity</h2>${identityBadge(identity)}</div>
      ${identity.betaOverrideActive ? '<span class="pill warn">BETA OVERRIDE ACTIVE</span>' : ''}
      <div class="grid two">
        ${field('Email', 'email', 'type="email" autocomplete="email"')}
        ${field('Passphrase', 'passphrase', 'type="password" autocomplete="new-password"')}
      </div>
      <div class="actions">
        <button data-action="createAccount">Start Account</button>
        <button class="secondary" data-action="copyPubkey" ${store.account ? '' : 'disabled'}>Copy Public Key</button>
      </div>
      <pre>${escapeHtml(JSON.stringify(publicAccount(identity), null, 2))}</pre>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Simple PoHW</h2><span class="pill">beta human check</span></div>
      <p class="small">Phrase: ${escapeHtml(POHW_PHRASE)}</p>
      <div class="grid two">
        ${field('Type phrase exactly', 'pohwPhrase')}
        ${field('Answer one simple prompt', 'pohwAnswer')}
      </div>
      <div class="actions"><button data-action="completePohw">Complete PoHW</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Beta Override</h2><span class="pill bad">temporary</span></div>
      ${field('Override code', 'betaCode', 'type="password" autocomplete="off"')}
      <div class="actions"><button class="warn" data-action="applyBetaOverride">Apply Override</button></div>
    </section>
  `;
}

function moneyScreen(state) {
  const balance = currentBalance(state);
  return `
    <section class="metrics">
      ${metric('Aqua', balance.aqua, 'accent')}
      ${metric('Locked', balance.locked, 'blue')}
      ${metric('Fire Paid', balance.firePaid, 'warn')}
      ${metric('Sump', balance.sump)}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Transfer</h2><span class="pill">4% Fire to Sump</span></div>
      <div class="grid">
        ${area('Receiver public key', 'to')}
        ${field('Amount', 'amount', 'type="number" min="0" step="1"')}
      </div>
      <div class="actions">
        <button data-action="sendAqua">Send Aqua</button>
        <button class="secondary" data-action="issueBetaAqua">Issue Beta Aqua</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Reserve</h2><span class="pill">Earth ${escapeHtml(balance.earth)}</span></div>
      ${field('Beta issue amount', 'issueAmount', 'type="number" min="0" step="1"')}
      <p class="small">Beta issue events are explicitly marked beta/dev. Production issuance must reduce Earth.</p>
    </section>
  `;
}

function civicScreen(state) {
  const proposalId = store.forms.proposalId.trim();
  const tally = proposalId ? tallyProposal(state, proposalId) : null;
  const optedIn = store.account ? state.governance.committeeOptIn.has(store.account.publicKey) : false;
  return `
    <section class="panel">
      <div class="panel-head"><h2>Proposal</h2><span class="pill">verified only</span></div>
      <div class="grid">
        ${field('Title', 'proposalTitle')}
        ${area('Body', 'proposalBody')}
      </div>
      <div class="actions"><button data-action="createProposal">Create Proposal</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Vote / Proxy</h2><span class="pill">${tally ? `${Object.keys(tally.counted).length} counted` : 'No tally'}</span></div>
      <div class="grid two">
        ${field('Proposal ID', 'proposalId')}
        ${selectField('Choice', 'voteChoice', ['yes', 'no', 'abstain'])}
      </div>
      ${area('Proxy public key', 'proxy')}
      <div class="actions">
        <button data-action="castVote">Vote</button>
        <button class="secondary" data-action="setProxy">Set Proxy</button>
        <button class="secondary" data-action="revokeProxy">Revoke Proxy</button>
        <button class="secondary" data-action="copyOutcome">Publish Outcome</button>
      </div>
      <pre>${escapeHtml(JSON.stringify(tally || {}, null, 2))}</pre>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Committee</h2><span class="pill ${optedIn ? 'ok' : ''}">${optedIn ? 'opted in' : 'not opted in'}</span></div>
      <div class="grid two">
        ${field('Round ID', 'committeeRound')}
        ${field('Count', 'committeeCount', 'type="number" min="1" step="1"')}
      </div>
      <div class="actions">
        <button data-action="committeeOptIn">Opt In</button>
        <button class="secondary" data-action="committeeOptOut">Opt Out</button>
        <button class="secondary" data-action="committeeSelect">Select Committee</button>
      </div>
    </section>
    ${eventPanel('Governance events', store.events.filter((event) => event.module === 'governance').slice(-8).reverse())}
  `;
}

function chatScreen(state) {
  const messages = state.chat.messages.filter((event) => event.payload.roomId === store.forms.chatRoom);
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
        <button class="secondary" data-action="joinRoom">Join</button>
        <button class="secondary" data-action="sendChat">Send Chat</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Room Credits</h2><span class="pill">verified or beta/dev</span></div>
      <div class="grid two">
        ${area('Credit recipient', 'roomCreditTo')}
        ${field('Amount', 'roomCreditAmount', 'type="number" min="0" step="1"')}
      </div>
      <div class="actions">
        <button class="secondary" data-action="issueRoomCredit">Issue Credit</button>
        <button class="secondary" data-action="sendRoomCredit">Transfer Credit</button>
      </div>
    </section>
    ${messagePanel(messages)}
    ${eventPanel('Chat events', store.events.filter((event) => event.module === 'chat').slice(-10).reverse())}
  `;
}

function dexScreen(state) {
  const escrow = store.forms.escrowId.trim() ? state.dex.escrows.get(store.forms.escrowId.trim()) : null;
  const witnesses = escrow?.witnesses?.size ?? 0;
  return `
    <section class="panel">
      <div class="panel-head"><h2>List Exchange</h2><span class="pill">${state.dex.quotes.size} quotes</span></div>
      <div class="grid two">
        ${selectField('Side', 'quoteSide', ['sell', 'buy'])}
        ${field('Amount', 'quoteAmount', 'type="number" min="0" step="1"')}
        ${field('Price', 'quotePrice', 'type="number" min="0" step="0.01"')}
      </div>
      <div class="actions"><button data-action="createQuote">List Exchange</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Verify / Swap</h2><span class="pill">threshold ${witnesses}/${WITNESS_THRESHOLD}</span></div>
      <div class="grid">
        ${field('Quote ID', 'quoteId')}
        ${area('Seller public key', 'escrowSeller')}
        ${field('Escrow amount', 'escrowAmount', 'type="number" min="0" step="1"')}
        ${field('Escrow ID', 'escrowId')}
        ${area('Buyer public key', 'escrowBuyer')}
      </div>
      <div class="actions">
        <button data-action="openEscrow">Open Escrow</button>
        <button class="secondary" data-action="witnessEscrow">Witness</button>
        <button class="secondary" data-action="releaseEscrow">Release / Swap</button>
        <button class="secondary" data-action="cancelEscrow">Cancel</button>
        <button class="secondary" data-action="refundEscrow">Refund</button>
      </div>
      <pre>${escapeHtml(JSON.stringify(escrow ? printableEscrow(escrow) : {}, null, 2))}</pre>
    </section>
    ${eventPanel('DEX events', store.events.filter((event) => event.module === 'dex').slice(-10).reverse())}
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
      <p class="small">Use HTTPS or a reachable LAN/tunnel URL for real phones.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Import / Export</h2><span class="pill ${bluetooth ? 'ok' : 'bad'}">Bluetooth API ${bluetooth ? 'visible' : 'missing'}</span></div>
      <div class="actions">
        <button data-action="exportBundle">Export Bundle</button>
        <button class="secondary" data-action="copyBundle">Copy Bundle</button>
        <button class="secondary" data-action="checkBluetooth">Check Bluetooth</button>
      </div>
      ${area('Import bundle text', 'importText')}
      <div class="actions"><button class="secondary" data-action="importBundle">Import Bundle</button></div>
      <pre>${escapeHtml(JSON.stringify(store.importSummary || { accepted: 0, rejected: 0, reasons: [] }, null, 2))}</pre>
    </section>
  `;
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
    const email = cleanEmail(store.forms.email);
    const passphrase = store.forms.passphrase;
    if (!email) throw new Error('Enter an email first.');
    if (!passphrase || passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.');
    const keypair = await generateIdentityKeypair();
    store.account = {
      publicKey: keypair.publicKey,
      encryptedPrivateKey: await encryptText(keypair.privateKey, passphrase),
      email,
      createdAt: Date.now()
    };
    await addLocalEvent(await signedEvent('identity.email_claim', {
      emailHash: await hashLocal(email),
      createdAt: Date.now()
    }));
    toast('Account started at LEVEL_0_EMAIL');
  }),
  copyPubkey: () => run(async () => {
    requireAccount();
    await navigator.clipboard.writeText(store.account.publicKey);
    toast('Public key copied');
  }),
  completePohw: () => run(async () => {
    requireAccount();
    const email = cleanEmail(store.account.email || store.forms.email);
    if (!email) throw new Error('Email is required for PoHW.');
    if (store.forms.pohwPhrase !== POHW_PHRASE) throw new Error('Phrase does not match.');
    if (!store.forms.pohwAnswer.trim()) throw new Error('Answer the simple prompt.');
    await addLocalEvent(await signedEvent('identity.pohw_simple', {
      emailHash: await hashLocal(email),
      challengeText: POHW_PHRASE,
      responseHash: await hashLocal(`${store.forms.pohwPhrase}|${store.forms.pohwAnswer.trim()}`),
      completedAt: Date.now(),
      score: 1,
      method: 'simple-beta-pohw'
    }));
    toast('PoHW completed: LEVEL_1_POHW');
  }),
  applyBetaOverride: () => run(async () => {
    requireAccount();
    if (!isValidBetaOverride(store.forms.betaCode)) throw new Error('Invalid beta override code.');
    await addLocalEvent(await signedEvent('identity.beta_override', {
      codeHash: await hashLocal(BETA_OVERRIDE),
      reason: 'beta testing only',
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    }));
    store.forms.betaCode = '';
    toast('BETA OVERRIDE ACTIVE');
  }),
  issueBetaAqua: () => run(async () => {
    requireAccount();
    await addLocalEvent(await signedEvent('money.issue_aqua', {
      to: store.account.publicKey,
      amount: amountFrom('issueAmount'),
      betaDev: true
    }));
    toast('Beta Aqua issued');
  }),
  sendAqua: () => run(async () => {
    requireAccount();
    const amount = amountFrom('amount');
    const fire = round(amount * 0.04);
    await addLocalEvent(await signedEvent('money.transfer', {
      from: store.account.publicKey,
      to: store.forms.to.trim(),
      amount,
      netAmount: round(amount - fire),
      fireAmount: fire,
      fireTaxRate: 0.04
    }));
    toast('Transfer queued');
  }),
  createProposal: () => run(async () => {
    const event = await signedEvent('governance.proposal_create', {
      title: store.forms.proposalTitle.trim(),
      body: store.forms.proposalBody.trim(),
      choices: ['yes', 'no', 'abstain']
    });
    await addLocalEvent(event);
    store.forms.proposalId = event.id;
    toast('Proposal created');
  }),
  castVote: () => run(async () => {
    await addLocalEvent(await signedEvent('governance.vote_cast', {
      proposalId: store.forms.proposalId.trim(),
      choice: store.forms.voteChoice
    }));
    toast('Vote queued');
  }),
  setProxy: () => run(async () => {
    await addLocalEvent(await signedEvent('governance.proxy_set', { proxy: store.forms.proxy.trim() }));
    toast('Proxy set');
  }),
  revokeProxy: () => run(async () => {
    await addLocalEvent(await signedEvent('governance.proxy_revoke', { proxy: store.forms.proxy.trim() }));
    toast('Proxy revoked');
  }),
  copyOutcome: () => run(async () => {
    const outcome = tallyProposal(stateNow(), store.forms.proposalId.trim());
    await navigator.clipboard.writeText(JSON.stringify(outcome, null, 2));
    toast('Outcome copied');
  }),
  committeeOptIn: () => run(async () => {
    await addLocalEvent(await signedEvent('governance.committee_opt_in', { optedInAt: Date.now() }));
    toast('Committee opt-in queued');
  }),
  committeeOptOut: () => run(async () => {
    await addLocalEvent(await signedEvent('governance.committee_opt_out', { optedOutAt: Date.now() }));
    toast('Committee opt-out queued');
  }),
  committeeSelect: () => run(async () => {
    const state = stateNow();
    const eligible = [...state.governance.committeeOptIn].filter((userId) => isVerifiedIdentity(state, userId)).sort();
    const priorEventHash = store.events.slice().sort(compareEvents).at(-1)?.id || 'genesis';
    const count = Math.max(1, Number(store.forms.committeeCount) || 1);
    await addLocalEvent(await signedEvent('governance.committee_select', {
      roundId: store.forms.committeeRound.trim(),
      priorEventHash,
      count,
      selected: deterministicCommittee(store.forms.committeeRound.trim(), priorEventHash, eligible, count)
    }));
    toast('Committee selected');
  }),
  createRoom: () => run(async () => {
    await addLocalEvent(await signedEvent('chat.room_create', {
      roomId: store.forms.chatRoom.trim(),
      name: store.forms.chatRoomName.trim(),
      todoEncryption: 'TODO: add room encryption after beta protocol rules settle'
    }));
    toast('Room created');
  }),
  joinRoom: () => run(async () => {
    await addLocalEvent(await signedEvent('chat.room_join', { roomId: store.forms.chatRoom.trim(), joinedAt: Date.now() }));
    toast('Room joined');
  }),
  sendChat: () => run(async () => {
    await addLocalEvent(await signedEvent('chat.message_send', {
      roomId: store.forms.chatRoom.trim(),
      text: store.forms.chatText.trim(),
      todoEncryption: 'TODO: encrypt messages after beta sync testing'
    }));
    store.forms.chatText = '';
    toast('Message sent');
  }),
  issueRoomCredit: () => run(async () => {
    await addLocalEvent(await signedEvent('chat.room_credit_issue', {
      roomId: store.forms.chatRoom.trim(),
      to: store.forms.roomCreditTo.trim(),
      amount: amountFrom('roomCreditAmount'),
      betaDev: true
    }));
    toast('Room credit issued');
  }),
  sendRoomCredit: () => run(async () => {
    await addLocalEvent(await signedEvent('chat.room_credit_transfer', {
      roomId: store.forms.chatRoom.trim(),
      to: store.forms.roomCreditTo.trim(),
      amount: amountFrom('roomCreditAmount')
    }));
    toast('Room credit transferred');
  }),
  createQuote: () => run(async () => {
    const event = await signedEvent('dex.quote_create', {
      side: store.forms.quoteSide,
      base: 'AQUA',
      quote: 'LOCAL',
      amount: amountFrom('quoteAmount'),
      price: Number(store.forms.quotePrice),
      expiresAt: Date.now() + 60 * 60 * 1000,
      binding: false
    });
    await addLocalEvent(event);
    store.forms.quoteId = event.id;
    toast('Quote listed');
  }),
  openEscrow: () => run(async () => {
    requireAccount();
    const event = await signedEvent('dex.escrow_open', {
      quoteId: store.forms.quoteId.trim() || undefined,
      buyer: store.account.publicKey,
      seller: store.forms.escrowSeller.trim(),
      lockedFrom: store.account.publicKey,
      amount: amountFrom('escrowAmount'),
      witnessThreshold: WITNESS_THRESHOLD,
      timeoutAt: Date.now() + 60 * 60 * 1000
    });
    await addLocalEvent(event);
    store.forms.escrowId = event.id;
    toast('Escrow opened');
  }),
  witnessEscrow: () => run(async () => {
    await addLocalEvent(await signedEvent('dex.witness_attest', {
      escrowId: store.forms.escrowId.trim(),
      statement: 'off-chain condition observed',
      attestedAt: Date.now()
    }));
    toast('Witness attested');
  }),
  releaseEscrow: () => run(async () => {
    const escrow = stateNow().dex.escrows.get(store.forms.escrowId.trim());
    await addLocalEvent(await signedEvent('dex.escrow_release', {
      escrowId: store.forms.escrowId.trim(),
      buyer: escrow?.buyer || store.forms.escrowBuyer.trim(),
      seller: escrow?.seller || store.forms.escrowSeller.trim(),
      amount: escrow?.amount || amountFrom('escrowAmount'),
      releaseTo: store.forms.escrowSeller.trim() || store.account?.publicKey
    }));
    toast('Escrow released');
  }),
  cancelEscrow: () => run(async () => {
    await addLocalEvent(await signedEvent('dex.escrow_cancel', { escrowId: store.forms.escrowId.trim(), cancelledAt: Date.now() }));
    toast('Cancel queued');
  }),
  refundEscrow: () => run(async () => {
    const escrow = stateNow().dex.escrows.get(store.forms.escrowId.trim());
    await addLocalEvent(await signedEvent('dex.escrow_refund', {
      escrowId: store.forms.escrowId.trim(),
      buyer: escrow?.buyer || store.forms.escrowBuyer.trim(),
      amount: escrow?.amount || amountFrom('escrowAmount'),
      refundedAt: Date.now()
    }));
    toast('Refund queued');
  }),
  syncNode: () => run(syncNode),
  pullNode: () => run(pullNode),
  exportBundle: () => run(exportBundleFile),
  copyBundle: () => run(async () => {
    await navigator.clipboard.writeText(JSON.stringify(bundle(), null, 2));
    toast('Bundle copied');
  }),
  importBundle: () => run(async () => {
    await importEvents(JSON.parse(store.forms.importText), { markPending: false });
    toast(`Import accepted ${store.importSummary.accepted}, rejected ${store.importSummary.rejected}`);
  }),
  checkBluetooth: () => run(async () => {
    if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth is not available in this browser.');
    const available = await navigator.bluetooth.getAvailability();
    toast(`Bluetooth API available: ${available}`);
  })
};

async function addLocalEvent(event) {
  const accepted = await validateAndApply([event], { markPending: true });
  if (accepted.accepted !== 1) throw new Error(accepted.reasons[0]?.reason || 'event-rejected');
}

async function validateAndApply(events, options = {}) {
  const summary = { accepted: 0, rejected: 0, reasons: [] };
  const known = new Set(store.events.map((event) => event.id));
  let state = stateNow();
  for (const incoming of events.map(normalizeEvent).sort(compareEvents)) {
    if (known.has(incoming.id)) continue;
    const check = await validateEvent(incoming, state);
    if (!check.ok) {
      summary.rejected += 1;
      summary.reasons.push({ id: incoming.id || short(incoming.type), type: incoming.type, reason: check.reason });
      continue;
    }
    store.events.push(incoming);
    known.add(incoming.id);
    applyEvent(incoming, state);
    if (options.markPending && !store.pending.includes(incoming.id)) store.pending.push(incoming.id);
    summary.accepted += 1;
  }
  store.events.sort(compareEvents);
  store.importSummary = summary;
  saveStore();
  return summary;
}

async function signedEvent(type, payload = {}) {
  requireAccount();
  const privateKey = await unlockPrivateKey();
  return signEvent(createEvent(type, payload, store.account.publicKey, recentParentIds()), privateKey);
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
  await importEvents(await res.json(), { markPending: false });
  store.lastSync = new Date().toISOString();
  saveStore();
}

async function importEvents(input, options = {}) {
  const events = Array.isArray(input) ? input : input?.events;
  if (!Array.isArray(events)) throw new Error('Invalid bundle.');
  return validateAndApply(events, options);
}

function bundle() {
  return { app: 'aqua-field-kit', version: '0.1.0-beta', exportedAt: new Date().toISOString(), events: store.events };
}

function exportBundleFile() {
  const blob = new Blob([JSON.stringify(bundle(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `aqua-field-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function recentParentIds() {
  return store.events.slice().sort(compareEvents).slice(-2).map((event) => event.id);
}

function postBody(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function currentIdentity(state) {
  return store.account ? getIdentity(state, store.account.publicKey) : {};
}

function currentBalance(state) {
  const key = store.account?.publicKey || '';
  return {
    aqua: round(getAquaBalance(state, key)),
    locked: round(state.money.locked.get(key) || 0),
    firePaid: round(state.money.firePaid.get(key) || 0),
    sump: round(state.money.sump),
    earth: round(state.money.earth)
  };
}

function publicAccount(identity) {
  if (!store.account) return {};
  return {
    publicKey: store.account.publicKey,
    emailLocalOnly: store.account.email || undefined,
    level: identityLabel(identity),
    betaOverrideActive: !!identity.betaOverrideActive,
    createdAt: store.account.createdAt
  };
}

function identityLabel(identity) {
  if (!store.account) return 'No account';
  if (identity?.betaOverrideActive) return 'BETA OVERRIDE ACTIVE';
  return identity?.level || 'LEVEL_0_EMAIL';
}

function identityBadge(identity) {
  const label = identityLabel(identity);
  const tone = identity?.betaOverrideActive ? 'warn' : identity?.isVerified ? 'ok' : 'bad';
  return `<span class="pill ${tone}">${escapeHtml(label)}</span>`;
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

function messagePanel(events) {
  return `<section class="panel"><div class="panel-head"><h2>Messages</h2><span class="pill">${events.length}</span></div>${events.length ? events.slice(-8).map((event) => `<article class="event"><strong>${escapeHtml(short(event.author))}</strong><span>${escapeHtml(event.payload.text)}</span></article>`).join('') : '<p class="small">No messages yet.</p>'}</section>`;
}

function printableEscrow(escrow) {
  return { ...escrow, witnesses: [...(escrow.witnesses || [])] };
}

function amountFrom(key) {
  const value = Number(store.forms[key]);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive amount.');
  return round(value);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function hashLocal(value) {
  return sha256Hex(textBytes(value));
}

// TEMPORARY BETA ONLY - REMOVE BEFORE PRODUCTION
function isValidBetaOverride(input) {
  return String(input || '') === BETA_OVERRIDE;
}

function requireAccount() {
  if (!store.account?.publicKey) throw new Error('Create an account first.');
}

function requireSecureCrypto() {
  if (!crypto?.subtle) throw new Error('Web Crypto is unavailable. Serve this app over HTTPS or localhost.');
}

async function unlockPrivateKey() {
  requireAccount();
  if (!store.forms.passphrase) throw new Error('Enter your passphrase to sign.');
  return decryptText(store.account.encryptedPrivateKey, store.forms.passphrase);
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
