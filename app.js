// ===== BACKEND API CLIENT =====
const API = 'https://ribbon-reflector-api.onrender.com/api';
const TOKEN_KEY = 'rr_token';
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, {
    headers,
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}
// Map backend listing row → frontend shape (existing pages use these field names)
function mapListing(l) {
  return {
    id: l.id, artist: l.artist, venue: l.venue, city: l.city,
    date: l.event_date, seat: l.seat, qty: l.qty, face: l.face_value,
    owner: l.owner_handle || l.owner, status: l.status,
    receipt: l.receipt_filename, notes: l.notes,
    activeTradeId: l.active_trade_id || null,
    activeTradePaymentStatus: l.active_trade_payment_status || null,
  };
}

// ===== DATA STORE =====
const store = {
  user: null, // {email, handle, isMember, memberUntil}
  route: 'home',
  listings: [
    {id:1,owner:'@marisol_k',artist:'Phish',venue:'Hampton Coliseum',city:'Hampton, VA',date:'Sep 20, 2026',seat:'GA Floor',face:120,qty:1,status:'active',receipt:'ticketmaster_receipt.pdf'},
    {id:2,owner:'@jordan_hifi',artist:'Phish',venue:'Madison Square Garden',city:'New York, NY',date:'Dec 28, 2026',seat:'Sec 114 Row 8',face:250,qty:1,status:'active',receipt:'axs_order.pdf'},
    {id:3,owner:'@peach.pit',artist:'Goose',venue:'Radio City Music Hall',city:'New York, NY',date:'Oct 9, 2026',seat:'Orch Row M',face:185,qty:1,status:'active',receipt:'ticketmaster.pdf'},
    {id:4,owner:'@ssun.room',artist:'King Gizzard & The Lizard Wizard',venue:'The Rady Shell',city:'San Diego, CA',date:'Aug 11, 2026',seat:'Sec MARLFT',face:165,qty:2,status:'active',receipt:'axs.pdf'},
  ],
  myListings: [],
  incomingOffers: [],
  outgoingOffers: [],
  completedTrades: [
    {id:201,partner:'@marisol_k',gave:'Vampire Weekend · Fillmore',got:'Mitski · Radio City',date:'Mar 2026',rating:5},
  ],
  activeTrade: null, // backend trade row + {partner, messages, viewer_role}
  communityReviews: [
    {author:'@jordan_hifi',about:'@marisol_k',stars:5,text:'Traded Vampire Weekend lawn for Mitski orchestra. Escrow made it painless — we chatted for a day, transferred, done.'},
    {author:'@marisol_k',about:'@jordan_hifi',stars:5,text:'Face value only means no weird negotiation. You just find a fan going to a show you want, and offer something you\'ve got.'},
    {author:'@peach.pit',about:'@marisol_k',stars:5,text:'Fast transfer, super friendly. Would trade again in a heartbeat.'},
    {author:'@ssun.room',about:'@jordan_hifi',stars:4,text:'Smooth trade, took a day to coordinate but everything went through cleanly.'},
    {author:'@marisol_k',about:'@peach.pit',stars:5,text:'Great communicator, sent tickets same day. Fan community at its best.'},
  ],
  profiles: {
    '@marisol_k': { joined:'Mar 2024', shows:['Phish','Mitski','Goose','Vampire Weekend'], bio:'Following Phish up and down the east coast since \'19.' },
    '@jordan_hifi': { joined:'Sep 2023', shows:['Vampire Weekend','Mitski','Fontaines D.C.'], bio:'Vinyl collector, indie concerts, hot takes.' },
    '@peach.pit': { joined:'Jan 2025', shows:['Goose','Big Thief','Fleet Foxes'], bio:'NYC-based. Always down for a jam band trade.' },
    '@ssun.room': { joined:'Jun 2024', shows:['King Gizzard','Mac DeMarco','Unknown Mortal Orchestra'], bio:'West coast psych rock enjoyer.' },
    '@deadhead_42': { joined:'Nov 2022', shows:['Phish','Goose','Grateful Shred'], bio:'Lot scene lifer.' },
  },
  filters: { q:'', city:'', maxPrice:'', sort:'newest' },
  reviewRating: 0,
  notifications: [],
  notifPanelOpen: false,
  disputes: [],
  dispute: { reason:'', details:'', evidence:null },
  compose: { targetId:null, amountCents:null, note:'' },
  nextId: 1000,
};

// Event grouping: same artist+venue+date = same event
const eventKey = t => `${t.artist}|${t.venue}|${t.date}`;
const parseEventKey = k => { const [artist, venue, date] = k.split('|'); return { artist, venue, date }; };
function allListingsForEvent(key) {
  const all = [...store.listings, ...store.myListings];
  return all.filter(t => eventKey(t) === key);
}

function addNotification(icon, text, route, params) {
  store.notifications.unshift({ id: Date.now(), icon, text, time:'Just now', read:false, route, params });
}
const unreadCount = () => store.notifications.filter(n => !n.read).length;

// ===== ROUTER =====
async function loadRouteData(route, params) {
  try {
    // First-time: check if we're already logged in (cookie)
    if (!store._userChecked) {
      store._userChecked = true;
      try {
        const me = await api('/me');
        store.user = {
          handle: me.handle, email: me.email,
          isMember: !!me.is_member, memberUntil: me.member_until,
          emailVerified: !!me.email_verified,
          stripeStatus: me.stripe_account_status || 'none',
          avatarUrl: me.avatar_data_url || null,
        };
      } catch {}
    }
    if (route === 'home' || route === 'browse') {
      const f = store.filters;
      const q = new URLSearchParams();
      if (route === 'browse') {
        if (f.q) q.set('q', f.q);
        if (f.city) q.set('city', f.city);
        if (f.maxPrice) q.set('max_price', f.maxPrice);
        if (f.sort) q.set('sort', f.sort);
      }
      const rows = await api('/listings' + (q.toString() ? '?' + q.toString() : ''));
      store.listings = rows.map(mapListing);
    }
    if (route === 'myTickets' && store.user) {
      try {
        const mine = await api('/listings?owner=' + encodeURIComponent(store.user.handle));
        store.myListings = mine.map(mapListing);
      } catch {}
      // Fetch real offers for both tabs on every myTickets navigation (per Session B plan)
      try { store.incomingOffers = await api('/offers/incoming'); } catch { store.incomingOffers = []; }
      try { store.outgoingOffers = await api('/offers/outgoing'); } catch { store.outgoingOffers = []; }
    }
    // Refresh notifications on every navigation when logged in — cheap and keeps the bell current
    if (store.user) {
      try { store.notifications = await api('/notifications'); } catch { /* leave existing */ }
    }
    if (route === 'profile') {
      const handle = (params.handle || store.user?.handle || '').replace('@', '');
      if (handle) {
        try {
          store._profileData = await api('/users/' + encodeURIComponent(handle));
        } catch { store._profileData = null; }
      }
    }
    if (route === 'wallet' && store.user) {
      const tradeId = params?.tradeId || store.activeTrade?.id;
      if (tradeId) {
        try {
          const trade = await api('/trades/' + tradeId);
          let messages = [];
          try { messages = await api('/trades/' + tradeId + '/messages'); } catch {}
          trade.partner = trade.viewer_role === 'buyer' ? trade.seller_handle : trade.buyer_handle;
          trade.messages = messages;
          store.activeTrade = trade;
        } catch (e) {
          console.error('wallet trade fetch failed:', e);
          store.activeTrade = null;
        }
      }
      if (!store._walletPollId) {
        store._walletPollId = setInterval(pollWalletTrade, 8000);
      }
    }
    if (route === 'payTrade' && store.user) {
      const tradeId = params?.tradeId || store._payTrade?.trade_id;
      if (tradeId) {
        try {
          const pay = await api('/trades/' + tradeId + '/payment');
          store._payTrade = { trade_id: tradeId, ...pay };
        } catch (e) {
          console.error('payTrade fetch failed:', e);
          store._payTrade = { trade_id: tradeId, error: e.message };
        }
      }
    }
    if (route === 'friends' && store.user) {
      try { store._friendsData = await api('/friends'); }
      catch (e) { console.error('friends fetch failed:', e); store._friendsData = { friends:[], incoming:[], outgoing:[] }; }
    }
    if (route === 'editProfile' && store.user) {
      try { store._meData = await api('/me'); } catch { store._meData = null; }
    }
  } catch (e) { console.error('loadRouteData:', e); }
}

async function go(route, params) {
  if (store._walletPollId && route !== 'wallet') {
    clearInterval(store._walletPollId);
    store._walletPollId = null;
  }
  store.route = route;
  store.params = params || {};
  render();
  await loadRouteData(route, params);
  render();
  window.scrollTo(0, 0);
}

// ===== HELPERS =====
const $ = (s, el=document) => el.querySelector(s);
const h = (strings, ...vals) => strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
const fmt = n => '$' + Number(n).toFixed(2);
const hl = handle => `<a class="handle-link" onclick="event.stopPropagation();go('profile',{handle:'${handle}'})">${handle}</a>`;
const requireAuth = () => { if (!store.user) { go('signup'); return false; } return true; };

// ===== HEADER =====
function headerHTML() {
  const isMember = store.user?.isMember;
  const needsVerify = store.user && store.user.emailVerified === false;
  const banner = needsVerify ? `<div style="background:linear-gradient(90deg,#ff7a2e,#ffb84d);color:#1a1a1a;padding:10px 22px;text-align:center;font-size:14px;font-weight:500">
    <span>⚠️ Please verify your email to list tickets and make offers.</span>
    <a onclick="resendVerification()" style="text-decoration:underline;cursor:pointer;margin-left:10px">Resend email</a>
  </div>` : '';
  return `${banner}<header>
    <div class="logo" onclick="go('home')"><div class="logo-mark"><svg viewBox="0 0 36 36" width="32" height="32" style="display:block"><defs><linearGradient id="hlg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff3d5a"/><stop offset="100%" stop-color="#ff7a2e"/></linearGradient></defs><rect width="36" height="36" rx="8" fill="#1a1a2e"/><path d="M4,12 L4,9 L32,9 L32,12 A3.5,3.5 0 0,0 32,19 L32,24 L32,27 L4,27 L4,24 A3.5,3.5 0 0,0 4,17 Z" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/><path d="M2,22 C8,9 15,23 18,15 C21,7 28,20 34,10" stroke="url(#hlg)" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M2,24.5 C8,13 15,25.5 18,18 C21,11 28,22.5 34,13.5" stroke="#ffb84d" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.45"/></svg></div>Ribbon Reflector</div>
    <nav class="top">
      ${store.user ? `<a onclick="go('myTickets')">My Tickets</a>` : ''}
      ${store.activeTrade ? `<a onclick="go('wallet')" style="color:var(--orange)">TicketWallet ●</a>` : ''}
      <a onclick="go('browse')">Browse</a>
      <a onclick="go('howItWorks')">How It Works</a>
      <div class="icon-btn bell-wrap" onclick="toggleNotifs()" title="Notifications">🔔${store.user && unreadCount() ? `<span class="bell-badge">${unreadCount()}</span>`:''}</div>
      ${store.user
        ? `<div class="avatar" onclick="go('profile',{handle:'${store.user.handle}'})" title="${store.user.handle}" ${store.user.avatarUrl ? `style="background-image:url('${store.user.avatarUrl}');background-size:cover;background-position:center"` : ''}></div>
           <a onclick="doLogout()" style="font-size:13px;opacity:0.7">Sign out</a>
           <button class="post-btn" onclick="go('postTickets')">Post Tickets</button>`
        : `<a onclick="go('login')">Sign in</a>
           <button class="post-btn" onclick="go('signup')">Join $10/yr</button>`}
    </nav>
  </header>`;
}

// ===== PAGES =====
function homePage() {
  const mine = store.myListings.length ? store.myListings : store.listings.slice(0, 4);
  return `
  <div class="hero-wrap">${headerHTML()}
    <div class="hero">
      <h1>Face Value Tickets</h1>
      <p class="tag">Built by fans, for fans.<br>The show you love at the real price.</p>
      <div class="hero-tabs"><a class="active" onclick="go('browse')">Find Tickets</a><a onclick="go('postTickets')">Post Tickets</a><a>Create Alerts</a></div>
      <div class="search">🔍 <input placeholder="Search for artists, venues, or events"></div>
    </div>
  </div>
  <div class="body-section">
    <div class="greeting">${store.user ? 'Hi '+store.user.handle.replace('@','') : 'Welcome, friend'}</div>
    <div class="greeting-sub">${store.user?.isMember ? 'Membership active · $10/year · face value only' : 'Join the community for $10/year — face value only.'}</div>
    <div class="section-head"><h2>Popular Events</h2><a onclick="go('browse')">View All →</a></div>
    <div class="grid">${mine.map(cardHTML).join('')}</div>
  </div>
  <footer>Ribbon Reflector ❦ Fan-to-fan, face value, forever.</footer>`;
}

function cardHTML(t) {
  // Seller view: if this listing is mid-trade, show an Open-trade action that stops the card click.
  const isOwner = store.user?.handle === t.owner;
  const tradedWithActive = t.status === 'traded' && t.activeTradeId;
  const statusPill = {
    active:'<span class="pill green">Active</span>',
    pending:'<span class="pill orange">Offer Pending</span>',
    traded: tradedWithActive && isOwner
      ? `<button class="btn gold" onclick="event.stopPropagation();go('wallet',{tradeId:${t.activeTradeId}})">Open trade</button>`
      : '<span class="pill blue">Traded</span>',
    sold:'<span class="pill blue">Traded</span>',
  }[t.status] || '<span class="pill gray">Available</span>';
  const key = eventKey(t);
  return `<div class="card" onclick="openListing(${t.id})"><div class="thumb"></div><div class="ribbon">TRADE</div>
    <h3 onclick="event.stopPropagation();go('event',{key:'${key}'})" style="cursor:pointer" title="View all tickets for this show">${t.artist} at ${t.venue}</h3>
    <div class="meta">${t.date} · ${t.city?t.city+' · ':''}${hl(t.owner)}</div>
    <div class="detail">${t.qty||1}× ${t.seat} · ${fmt(t.face)}</div>${statusPill}</div>`;
}

function browsePage() {
  const f = store.filters;
  const cities = [...new Set(store.listings.map(l => l.city).filter(Boolean))];
  let filtered = store.listings.filter(t => {
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = `${t.artist} ${t.venue} ${t.city} ${t.owner}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.city && t.city !== f.city) return false;
    if (f.maxPrice && Number(t.face) > Number(f.maxPrice)) return false;
    return true;
  });
  if (f.sort === 'price-low') filtered.sort((a,b) => a.face - b.face);
  else if (f.sort === 'price-high') filtered.sort((a,b) => b.face - a.face);
  else if (f.sort === 'artist') filtered.sort((a,b) => a.artist.localeCompare(b.artist));

  return `${headerHTML()}<div class="sub-page"><h2>Open listings</h2><span class="mono">Face value only · ${store.listings.length} tickets total</span>
    <div class="filter-bar">
      <input class="search-big" id="f-q" placeholder="🔍 Search artist, venue, city, or fan..." value="${f.q}" oninput="updateFilter('q',this.value)">
      <select id="f-city" onchange="updateFilter('city',this.value)">
        <option value="">All cities</option>
        ${cities.map(c => `<option value="${c}" ${f.city===c?'selected':''}>${c}</option>`).join('')}
      </select>
      <select id="f-price" onchange="updateFilter('maxPrice',this.value)">
        <option value="">Any price</option>
        <option value="100" ${f.maxPrice==='100'?'selected':''}>Under $100</option>
        <option value="200" ${f.maxPrice==='200'?'selected':''}>Under $200</option>
        <option value="300" ${f.maxPrice==='300'?'selected':''}>Under $300</option>
      </select>
      <select id="f-sort" onchange="updateFilter('sort',this.value)">
        <option value="newest" ${f.sort==='newest'?'selected':''}>Newest</option>
        <option value="price-low" ${f.sort==='price-low'?'selected':''}>Price: low to high</option>
        <option value="price-high" ${f.sort==='price-high'?'selected':''}>Price: high to low</option>
        <option value="artist" ${f.sort==='artist'?'selected':''}>Artist A-Z</option>
      </select>
      ${(f.q||f.city||f.maxPrice)?`<span class="clear" onclick="clearFilters()">Clear ✕</span>`:''}
    </div>
    <div class="result-count">Showing ${filtered.length} of ${store.listings.length} listings</div>
    ${filtered.length ? `<div class="grid">${filtered.map(cardHTML).join('')}</div>` : emptyState('No matches','Try adjusting your filters or clearing them.','Clear filters','browse')}
  </div>`;
}

function updateFilter(key, val) {
  store.filters[key] = val;
  render();
  // Refocus search input after re-render
  if (key === 'q') {
    const input = $('#f-q');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }
}
function clearFilters() {
  store.filters = { q:'', city:'', maxPrice:'', sort:'newest' };
  render();
}

// ===== SIGN UP + CHECKOUT =====
function signupPage() {
  return `${headerHTML()}<div class="sub-page"><div class="auth">
    <span class="mono" style="color:var(--magenta)">Join the movement</span>
    <h2>Create account</h2>
    <p class="lead">$10/year · face value only · fan-to-fan</p>
    <div class="field"><label>Handle</label><input id="su-handle" placeholder="folkjam" value="folkjam"></div>
    <div class="field"><label>Email</label><input id="su-email" type="email" placeholder="you@fan.co" value="folkjam@fan.co"></div>
    <div class="field"><label>Password</label><input id="su-pw" type="password" value="••••••••"></div>
    <button class="btn wide" onclick="continueToCheckout()">Continue to checkout →</button>
    <div class="auth-switch">Already a member? <a onclick="go('login')">Sign in</a></div>
  </div></div>`;
}

function loginPage() {
  return `${headerHTML()}<div class="sub-page"><div class="auth">
    <span class="mono" style="color:var(--magenta)">Members only</span>
    <h2>Sign in</h2>
    <p class="lead">Welcome back.</p>
    <div class="field"><label>Email</label><input id="li-email" value="folkjam@fan.co"></div>
    <div class="field"><label>Password</label><input id="li-pw" type="password" value="••••••••"></div>
    <a onclick="go('forgotPassword')" style="color:var(--orange);cursor:pointer;font-size:13px;display:block;margin:6px 0 14px">Forgot password?</a>
        <button class="btn wide" onclick="doLogin()">Enter the Movement</button>
    <div class="auth-switch">New here? <a onclick="go('signup')">Create account</a></div>
  </div></div>`;
}

function continueToCheckout() {
  const handle = $('#su-handle').value.trim() || 'folkjam';
  const email = $('#su-email').value.trim();
  const password = $('#su-pw').value.trim();
  if (password.length < 8 || password === '••••••••') {
    alert('Please enter a real password (8+ characters)');
    return;
  }
  store.pendingUser = { handle: '@' + handle.replace('@', ''), email, password };
  go('checkout');
}

async function doLogin() {
  const email = $('#li-email').value.trim();
  const password = $('#li-pw').value.trim();
  try {
    const u = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (u.token) setToken(u.token);
    // Pull the canonical verified flag; login response carries it but /me is authoritative.
    try {
      const me = await api('/me');
      store.user = {
        handle: me.handle, email: me.email,
        isMember: !!me.is_member, memberUntil: me.member_until,
        emailVerified: !!me.email_verified,
        stripeStatus: me.stripe_account_status || 'none',
      };
    } catch {}
    store.user = { handle: u.handle, email: u.email, isMember: !!u.is_member, memberUntil: u.member_until };
    go('home');
  } catch (e) { alert('Login failed: ' + e.message); }
}

async function doLogout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  setToken(null);
  store.user = null;
  store._userChecked = false;
  store.myListings = [];
  go('home');
}

function checkoutPage() {
  const pu = store.pendingUser || { handle:'@folkjam', email:'folkjam@fan.co' };
  return `${headerHTML()}<div class="sub-page"><h2>Complete your membership</h2><span class="mono">Step 2 of 2 · Secure checkout</span>
    <div class="checkout-grid">
      <div class="panel">
        <div class="card-brand"><span class="mono">Payment details</span><span class="stripe-logo">stripe</span></div>
        <div class="field"><label>Cardholder name</label><input id="co-name" value="${pu.handle.replace('@','')}"></div>
        <div class="field"><label>Card number</label><input id="co-num" value="4242 4242 4242 4242"></div>
        <div class="field-row">
          <div class="field"><label>Expiry</label><input id="co-exp" value="12 / 29"></div>
          <div class="field"><label>CVC</label><input id="co-cvc" value="123"></div>
        </div>
        <div class="field"><label>ZIP</label><input id="co-zip" value="94501"></div>
        <button class="btn wide gold" onclick="completeCheckout()">Pay $10.00 — Join Ribbon Reflector</button>
        <p style="color:var(--muted);font-size:11px;text-align:center;margin-top:14px">Demo only · no real charge · card 4242 is Stripe's test number</p>
      </div>
      <div class="plan-card">
        <h3>Annual Membership</h3>
        <p style="color:var(--muted);font-size:13px">Billed yearly · cancel anytime</p>
        <div class="price">$10<small> / year</small></div>
        <ul>
          <li>Unlimited face-value trades</li>
          <li>TicketWallet escrow protection</li>
          <li>Trade-partner chat & reviews</li>
          <li>Fan-to-fan community access</li>
          <li>No scalpers · no markups · ever</li>
        </ul>
      </div>
    </div></div>`;
}

async function completeCheckout() {
  const pu = store.pendingUser;
  if (!pu || !pu.password) { alert('Missing signup info — please start over'); go('signup'); return; }
  try {
    const signup = await api('/auth/signup', { method: 'POST', body: { handle: pu.handle, email: pu.email, password: pu.password } });
    if (signup.token) setToken(signup.token);
    await api('/checkout/membership', { method: 'POST' });
    const me = await api('/me');
    store.user = {
      handle: me.handle, email: me.email,
      isMember: true, memberUntil: me.member_until,
      emailVerified: !!me.email_verified,
      stripeStatus: me.stripe_account_status || 'none',
    };
    store.pendingUser = null;
    alert('✓ Welcome to Ribbon Reflector! We sent a verification link to ' + me.email + ' — please confirm it to start listing and making offers.');
    go('home');
  } catch (e) { alert('Signup failed: ' + e.message); }
}

// ===== POST TICKETS =====
function postTicketsPage() {
  if (!requireAuth()) return '';
  const hasFile = store._receiptName;
  return `${headerHTML()}<div class="sub-page"><h2>Post a ticket</h2><span class="mono">List face value only · required</span>
    <div class="notice">Ribbon Reflector is face-value only. Upload your original purchase receipt so we can verify the price. Listings are reviewed before going live.</div>
    <div class="two-col">
      <div class="panel">
        <h4>Event details</h4>
        <div class="field"><label>Artist / Event</label><input id="pt-artist" placeholder="Phish"></div>
        <div class="field"><label>Venue</label><input id="pt-venue" placeholder="Madison Square Garden"></div>
        <div class="field-row">
          <div class="field"><label>City</label><input id="pt-city" placeholder="New York, NY"></div>
          <div class="field"><label>Date</label><input id="pt-date" placeholder="Dec 28, 2026"></div>
        </div>
        <div class="field"><label>Section / Row / Seat</label><input id="pt-seat" placeholder="Sec 114 Row 8 Seats 1-2"></div>
        <div class="field-row">
          <div class="field"><label>Quantity</label><input id="pt-qty" type="number" value="1"></div>
          <div class="field"><label>Face value (per ticket, USD)</label><input id="pt-face" type="number" placeholder="250"></div>
        </div>
        <div class="field"><label>Original source</label>
          <select id="pt-source"><option>Ticketmaster</option><option>AXS</option><option>SeatGeek</option><option>Venue Box Office</option><option>Artist Presale</option><option>Other</option></select>
        </div>
      </div>
      <div class="panel">
        <h4>Face-value verification</h4>
        <label class="upload ${hasFile?'has-file':''}" id="pt-upload-label">
          <div class="icon">${hasFile?'✓':'📄'}</div>
          ${hasFile
            ? `<p><strong>${store._receiptName}</strong></p><p>Click to replace</p>`
            : `<p><strong>Upload purchase receipt</strong></p><p>PDF, PNG, or JPG · under 5MB</p>`}
          <input type="file" id="pt-receipt" style="display:none" accept=".pdf,.png,.jpg,.jpeg">
        </label>
        <div class="field" style="margin-top:20px"><label>Notes to trade partners</label><textarea id="pt-notes" placeholder="Transferable via Ticketmaster. Open to trades for any east-coast Phish show."></textarea></div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-top:14px">By posting, you confirm these tickets are legitimate, transferable, and listed at or below face value. Listings are held in review until verified.</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn gold" onclick="submitListing()">Submit listing for review</button>
      <button class="btn ghost" onclick="go('myTickets')">Cancel</button>
    </div>
  </div>`;
}

function bindPostTicketsEvents() {
  const input = $('#pt-receipt');
  const label = $('#pt-upload-label');
  if (!input || !label) return;
  label.addEventListener('click', e => { if (e.target !== input) input.click(); });
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) {
      store._receiptName = f.name;
      const icon = label.querySelector('.icon');
      const paras = label.querySelectorAll('p');
      if (icon) icon.textContent = '✓';
      label.classList.add('has-file');
      if (paras[0]) paras[0].innerHTML = '<strong>' + f.name + '</strong>';
      if (paras[1]) paras[1].textContent = 'Click to replace';
    }
  });
}

async function submitListing() {
  const get = id => $(id)?.value.trim();
  const artist = get('#pt-artist'), venue = get('#pt-venue');
  if (!artist || !venue) { alert('Artist and venue are required.'); return; }
  if (!store._receiptName) { alert('Please upload your purchase receipt to verify face value.'); return; }
  try {
    await api('/listings', { method: 'POST', body: {
      artist, venue,
      city: get('#pt-city') || null,
      event_date: get('#pt-date') || null,
      seat: get('#pt-seat') || null,
      qty: parseInt(get('#pt-qty')) || 1,
      face_value: parseFloat(get('#pt-face')) || 0,
      source: get('#pt-source') || null,
      notes: get('#pt-notes') || null,
      receipt_filename: store._receiptName,
    }});
    store._receiptName = null;
    alert('✓ Listing submitted! Backend auto-approves in ~2 seconds (stand-in for moderation).');
    go('myTickets');
  } catch (e) { alert('Failed to submit: ' + e.message); }
}

// ===== MY TICKETS DASHBOARD =====
function myTicketsPage() {
  if (!requireAuth()) return '';
  const tab = store.params.tab || 'listings';
  const tabs = [
    ['listings','Active Listings',store.myListings.length],
    ['incoming','Incoming Offers',store.incomingOffers.length],
    ['outgoing','Outgoing Offers',store.outgoingOffers.length],
    ['completed','Completed Trades',store.completedTrades.length],
  ];
  return `${headerHTML()}<div class="sub-page"><h2>My Tickets</h2><span class="mono">${store.user.handle} · Member until ${store.user.memberUntil}</span>
    <div class="tabs">${tabs.map(([k,label,n])=>
      `<button class="tab ${tab===k?'active':''}" onclick="go('myTickets',{tab:'${k}'})">${label} <span style="opacity:.6">(${n})</span></button>`).join('')}
    </div>
    ${renderMyTicketsTab(tab)}
  </div>`;
}

function renderMyTicketsTab(tab) {
  if (tab === 'listings') {
    if (!store.myListings.length) return emptyState('No active listings yet','Post your first ticket to start trading.','Post Tickets','postTickets');
    return `<div class="grid g3">${store.myListings.map(cardHTML).join('')}</div>`;
  }
if (tab === 'incoming') {
    if (!store.incomingOffers.length) return emptyState('No incoming offers','When someone makes a cash offer on one of your listings, it\'ll appear here.');
    return store.incomingOffers.map(o => {
      const amt = (o.amount_cents / 100).toFixed(2);
      const face = Number(o.target_face_value).toFixed(2);
      const noteHTML = o.note ? `<div class="sub" style="margin-top:6px;font-style:italic">"${o.note}"</div>` : '';
      return `<div class="list-row">
        <div class="info">
          <h4>${hl(o.from_handle)} offered <strong>$${amt}</strong> for ${o.target_artist}</h4>
          <div class="sub">${o.target_venue} · ${o.target_date} · ${o.target_seat} (face $${face})</div>
          ${noteHTML}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn sm" onclick="acceptIncoming(${o.id})">Accept</button>
          <button class="btn sm ghost" onclick="declineIncoming(${o.id})">Decline</button>
        </div>
      </div>`;
    }).join('');
  }
  if (tab === 'outgoing') {
    if (!store.outgoingOffers.length) return emptyState('No outgoing offers','Browse listings and make your first offer.','Browse listings','browse');
    return store.outgoingOffers.map(o => {
      const amt = (o.amount_cents / 100).toFixed(2);
      // If the offer was accepted AND the trade needs payment, surface a Pay Now button.
      const needsPayment = o.status === 'accepted' && o.trade_id && o.trade_payment_status === 'pending';
      const isPaid = o.trade_payment_status === 'paid';
      let statusPill;
      if (o.status === 'pending') {
        statusPill = `<span class="pill orange">Awaiting response</span>`;
      } else if (needsPayment) {
        statusPill = `<button class="btn gold" onclick="go('payTrade',{tradeId:${o.trade_id}})">Pay now</button>`;
      } else if (isPaid) {
        statusPill = `<button class="btn ghost" onclick="go('wallet',{tradeId:${o.trade_id}})">View trade</button>`;
      } else if (o.status === 'accepted') {
        statusPill = `<span class="pill">Accepted</span>`;
      } else {
        statusPill = `<span class="pill" style="opacity:0.6">${o.status}</span>`;
      }
      return `<div class="list-row">
        <div class="info">
          <h4>Offered <strong>$${amt}</strong> to ${hl(o.to_handle)}</h4>
          <div class="sub">${o.target_artist} · ${o.target_venue}</div>
        </div>
        ${statusPill}
      </div>`;
    }).join('');
  }
  if (tab === 'completed') {
    if (!store.completedTrades.length) return emptyState('No completed trades yet','Your trade history will appear here.');
    return store.completedTrades.map(t => `<div class="list-row">
      <div class="info"><h4>Trade with ${hl(t.partner)}</h4><div class="sub">Gave: ${t.gave} → Got: ${t.got} · ${t.date}</div></div>
      <div style="color:var(--orange)">${'★'.repeat(t.rating)}</div>
    </div>`).join('');
  }
}

function emptyState(title, sub, btnLabel, btnRoute) {
  return `<div class="empty"><h3>${title}</h3><p>${sub}</p>${btnLabel?`<button class="btn" style="margin-top:18px" onclick="go('${btnRoute}')">${btnLabel}</button>`:''}</div>`;
}

async function acceptIncoming(id) {
  if (!confirm('Accept this offer? You will need to send the ticket through the wallet next.')) return;
  let result;
  try {
    result = await api(`/offers/${id}/accept`, { method: 'POST' });
  } catch (e) {
    alert('Could not accept offer: ' + e.message);
    return;
  }
  // Refetch incoming offers so the accepted (and any auto-declined siblings) drop off the list.
  try { store.incomingOffers = await api('/offers/incoming'); } catch { store.incomingOffers = []; }
  alert('✓ Offer accepted. The buyer has been asked to pay — you\'ll be able to mark the ticket sent once they do.');
  go('wallet', { tradeId: result.trade_id });
}

async function declineIncoming(id) {
  if (!confirm('Decline this offer? The buyer will be notified.')) return;
  try {
    await api(`/offers/${id}/decline`, { method: 'POST' });
  } catch (e) {
    alert('Could not decline offer: ' + e.message);
    return;
  }
  // Refetch from backend so the list stays in sync with the DB.
  try { store.incomingOffers = await api('/offers/incoming'); } catch { store.incomingOffers = []; }
  render();
}


function openListing(id) {
  if (!requireAuth()) return;
  const t = store.listings.find(x => x.id === id) || store.myListings.find(x => x.id === id);
  if (!t) return;
  if (t.owner === store.user.handle) {
    alert(`This is your listing for ${t.artist}. Offers will appear under My Tickets → Incoming.`);
    return;
  }
  store.compose = { targetId: id, myListingId: store.myListings[0]?.id || null, note: '' };
  go('composeOffer', { listingId: id });
}

// ===== TICKETWALLET (ESCROW) =====
// Cash-mode flow: buyer was charged at offer-accept time, seller transfers the
// ticket, buyer confirms, escrow releases. Stage is derived from backend flags.
const TRADE_STAGES = [
  { key:'held',     label:'Escrow held' },
  { key:'sent',     label:'Seller sent ticket' },
  { key:'received', label:'Buyer confirmed' },
  { key:'complete', label:'Escrow released' },
];
function tradeStage(t) {
  if (t.status === 'complete') return 3;
  if (t.buyer_received) return 2; // both flags true is handled by status==='complete' above
  if (t.seller_sent)    return 1;
  return 0;
}

function walletPage() {
  if (!requireAuth()) return '';
  const t = store.activeTrade;
  if (!t) {
    return `${headerHTML()}<div class="sub-page"><h2>TicketWallet</h2><span class="mono">Escrow</span>
      ${emptyState('No active trade','When an offer is accepted, your escrow dashboard lands here.','View my offers','myTickets')}</div>`;
  }
  const stage = tradeStage(t);
  const isBuyer  = t.viewer_role === 'buyer';
  const isSeller = t.viewer_role === 'seller';
  const disputed = t.status === 'disputed';
  const complete = t.status === 'complete';
  const amount = (t.amount_cents || 0) / 100;
  // Phase 2: if payment isn't complete yet, show a pay-now CTA (buyer) or waiting state (seller).
  const paymentPending = t.payment_status === 'pending';
  const paymentPaid    = t.payment_status === 'paid';
  const paymentFailed  = t.payment_status === 'failed' || t.payment_status === 'canceled';

  const statusHTML = TRADE_STAGES.map((s,i) => {
    const cls = i < stage ? 'done' : i === stage ? 'active' : '';
    return `<div class="status-step ${cls}"><span class="mono">Step ${i+1}</span>${s.label}${i<stage?' ✓':''}</div>`;
  }).join('');

  const msgsHTML = (t.messages || []).map(m => {
    const who = m.sender_handle === store.user.handle ? 'me' : 'them';
    return `<div class="msg ${who}">${m.body}</div>`;
  }).join('');

  // Role-conditional action button. One-directional: seller acts first, then buyer.
  // Payment gate layered on top: nothing else happens until payment_status === 'paid'.
  let actionBtn = '';
  if (paymentFailed) {
    actionBtn = `<span class="mono" style="color:var(--red)">Payment ${t.payment_status} — this trade was canceled.</span>`;
  } else if (paymentPending && isBuyer) {
    actionBtn = `<button class="btn gold" onclick="go('payTrade',{tradeId:${t.id}})">Pay now to complete your purchase</button>`;
  } else if (paymentPending && isSeller) {
    actionBtn = `<span class="mono" style="color:var(--muted)">Waiting for ${hl(t.buyer_handle)} to complete payment…</span>`;
  } else if (!disputed && !complete) {
    if (isSeller && !t.seller_sent) {
      actionBtn = `<button class="btn gold" onclick="markSent()">Mark ticket as sent</button>`;
    } else if (isBuyer && t.seller_sent && !t.buyer_received) {
      actionBtn = `<button class="btn gold" onclick="markReceived()">Confirm I received the ticket</button>`;
    } else if (isSeller && t.seller_sent && !t.buyer_received) {
      actionBtn = `<span class="mono" style="color:var(--muted)">Waiting for ${hl(t.buyer_handle)} to confirm receipt…</span>`;
    } else if (isBuyer && !t.seller_sent) {
      actionBtn = `<span class="mono" style="color:var(--muted)">Waiting for ${hl(t.seller_handle)} to send the ticket…</span>`;
    }
  } else if (complete) {
    actionBtn = `<button class="btn gold" onclick="go('reviews')">Leave a review →</button>`;
  }

  const escrowPanel = isBuyer
    ? `<div class="panel"><h4>You paid</h4>
        <p style="font-size:22px;font-weight:700">${fmt(amount)}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:6px">Held in escrow. Releases to ${hl(t.seller_handle)} once you confirm receipt.</p>
      </div>`
    : `<div class="panel"><h4>You'll receive</h4>
        <p style="font-size:22px;font-weight:700">${fmt(amount)}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:6px">Held in escrow from ${hl(t.buyer_handle)}. Releases to you once they confirm receipt.</p>
      </div>`;

  return `${headerHTML()}<div class="sub-page"><h2>TicketWallet</h2><span class="mono">Escrow · Trade #${t.id} · with ${hl(t.partner)}</span>
    ${disputed ? `<div class="dispute-banner"><div class="icon">⚠️</div><div>
      <h4>Dispute open — escrow paused</h4>
      <p>Our support team will reach out within 24 hours. Funds are held until the case is resolved.</p>
    </div></div>` : `<div class="notice">${isBuyer ? 'Your card was charged when the offer was accepted. Funds release to the seller once you confirm the ticket arrived.' : 'Buyer was charged when you accepted the offer. Transfer the ticket, then payout releases once the buyer confirms receipt.'}</div>`}
    <div class="status">${statusHTML}</div>
    <div class="two-col">
      <div class="panel"><h4>${isBuyer ? "You're receiving" : "You're sending"}</h4>
        <p style="font-size:17px;font-weight:600">${t.listing_artist}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:4px">${t.listing_venue}${t.listing_city ? ' · ' + t.listing_city : ''} · ${t.listing_date}</p>
        <p style="font-size:13px">${t.listing_seat}</p>
        <p style="margin-top:10px">Face value: <strong>${fmt(t.listing_face_value)}</strong></p>
      </div>
      ${escrowPanel}
    </div>
    <div class="panel" style="margin-top:20px"><h4>Chat with ${t.partner}</h4>
      <div id="msgs">${msgsHTML}</div>
      <div class="chat-input"><input id="chatInput" placeholder="Write a message..." onkeydown="if(event.key==='Enter')sendMsg()"><button class="btn" onclick="sendMsg()">Send</button></div>
    </div>
    <div class="actions">
      ${actionBtn}
      <button class="btn ghost" onclick="go('myTickets')">Back to My Tickets</button>
      ${!complete && !disputed ? `<button class="btn ghost" onclick="cancelTrade()" style="margin-left:auto;border-color:var(--red);color:var(--red)">Dispute / cancel</button>` : ''}
    </div>
  </div>`;
}

async function sendMsg() {
  const input = $('#chatInput');
  const v = input?.value.trim();
  if (!v || !store.activeTrade) return;
  const t = store.activeTrade;
  // Optimistic append so the input clears and the user sees their message immediately.
  t.messages = t.messages || [];
  t.messages.push({ sender_handle: store.user.handle, body: v });
  input.value = '';
  render();
  try {
    await api(`/trades/${t.id}/messages`, { method:'POST', body:{ body:v } });
    // Refetch authoritative list so we get server ids/timestamps + any inbound replies.
    try { t.messages = await api(`/trades/${t.id}/messages`); } catch {}
  } catch (e) {
    alert('Could not send message: ' + e.message);
  }
  if (store.route === 'wallet') render();
}

async function markSent() {
  const t = store.activeTrade;
  if (!t) return;
  try {
    const updated = await api(`/trades/${t.id}/mark-sent`, { method:'POST' });
    Object.assign(t, updated);
    t.partner = t.viewer_role === 'buyer' ? t.seller_handle : t.buyer_handle;
    addNotification('✈️', `You marked the ticket sent for trade <strong>${t.id}</strong>.`, 'wallet');
    render();
  } catch (e) {
    alert('Could not mark sent: ' + e.message);
  }
}

async function markReceived() {
  const t = store.activeTrade;
  if (!t) return;
  try {
    const updated = await api(`/trades/${t.id}/mark-received`, { method:'POST' });
    Object.assign(t, updated);
    t.partner = t.viewer_role === 'buyer' ? t.seller_handle : t.buyer_handle;
    if (updated.status === 'complete') {
      // Server released escrow; mirror into completed list and head to reviews.
      store.completedTrades.unshift({
        id: t.id, partner: t.partner,
        gave: t.viewer_role === 'seller' ? `${t.listing_artist} · ${t.listing_venue}` : `${fmt((t.amount_cents||0)/100)} (cash)`,
        got:  t.viewer_role === 'buyer'  ? `${t.listing_artist} · ${t.listing_venue}` : `${fmt((t.amount_cents||0)/100)} (cash)`,
        date: 'Apr 2026', rating: 0,
      });
      addNotification('✓', `Trade <strong>${t.id}</strong> complete — escrow released.`, 'reviews');
      go('reviews');
    } else {
      addNotification('📬', `You confirmed receipt for trade <strong>${t.id}</strong>.`, 'wallet');
      render();
    }
  } catch (e) {
    alert('Could not confirm receipt: ' + e.message);
  }
}

function cancelTrade() {
  go('dispute');
}

// ===== REVIEWS =====
function reviewsPage() {
  const t = store.activeTrade;
  const partner = t?.partner || '@marisol_k';
  const r = store.reviewRating;
  const starDisplay = '★ '.repeat(r) + '☆ '.repeat(5 - r);
  return `${headerHTML()}<div class="sub-page"><h2>Leave a review</h2><span class="mono">${t ? `Trade complete · ${t.id}` : 'Community reviews'}</span>
    ${t ? `<div class="panel" style="max-width:620px;margin-bottom:40px">
      <h4>How was your trade with ${partner}?</h4>
      <div class="stars" onclick="bumpRating()">${starDisplay}</div>
      <div class="field"><label>A few words</label><textarea id="reviewText" placeholder="Smooth transfer, great communication..."></textarea></div>
      <button class="btn gold" onclick="submitReview()">Publish review</button>
    </div>` : ''}
    <h3 style="font-family:'Bricolage Grotesque';font-size:28px;font-weight:800;margin:20px 0 16px">Community reviews</h3>
    <div>${store.communityReviews.map(c => `<div class="review-card">
      <div><strong>${hl(c.author)}</strong>${c.about?` → ${hl(c.about)}`:''}</div>
      <div class="stars-static">${'★'.repeat(c.stars)}</div>
      <p>"${c.text}"</p>
    </div>`).join('')}</div>
  </div>`;
}

function bumpRating() {
  store.reviewRating = store.reviewRating >= 5 ? 1 : store.reviewRating + 1;
  render();
}

async function submitReview() {
  const text = $('#reviewText')?.value.trim() || 'Great trade — smooth and friendly.';
  const stars = store.reviewRating || 5;
  const t = store.activeTrade;
  if (!t) { alert('No active trade to review.'); return; }
  if (stars < 1 || stars > 5) { alert('Pick a rating from 1 to 5.'); return; }
  try {
    await api('/reviews', { method:'POST', body:{ trade_id: t.id, stars, body: text } });
  } catch (e) {
    alert('Could not publish review: ' + e.message);
    return;
  }
  const ct = store.completedTrades.find(x => x.id === t.id);
  if (ct) ct.rating = stars;
  store.activeTrade = null;
  store.reviewRating = 0;
  store._profileData = null;
  alert('✓ Review published — thanks for keeping the community strong.');
  go('myTickets', { tab:'completed' });
}

// ===== USER PROFILE =====
function profilePage() {
  const handle = store.params.handle || store.user?.handle;
  if (!handle) { go('browse'); return ''; }
  // Prefer real data from backend if loaded
  const remote = store._profileData;
  const profile = (remote && remote.user)
    ? { joined: remote.user.created_at?.slice(0,10) || 'Recently', shows: [], bio: remote.user.bio || 'A Ribbon Reflector member.' }
    : (store.profiles[handle] || { joined:'Recently', shows:[], bio:'A Ribbon Reflector member.' });
  const reviewsAbout = remote?.reviews?.map(r => ({ author: r.author_handle, about: handle, stars: r.stars, text: r.body }))
    || store.communityReviews.filter(r => r.about === handle);
  const reviewsBy = store.communityReviews.filter(r => r.author === handle);
  const userListings = remote?.listings ? remote.listings.map(mapListing)
    : store.listings.filter(l => l.owner === handle).concat(handle === store.user?.handle ? store.myListings : []);
  const avgStars = reviewsAbout.length
    ? (reviewsAbout.reduce((s,r) => s + r.stars, 0) / reviewsAbout.length)
    : 0;
  const trustPct = avgStars ? Math.round((avgStars / 5) * 100) : 0;
  const initial = handle.replace('@','').charAt(0).toUpperCase();
  const totalTrades = reviewsAbout.length + reviewsBy.length;
  const isMe = handle === store.user?.handle;
  const friendsCount = remote?.friends_count ?? 0;
  const fStatus = remote?.friendship_status || (isMe ? 'self' : 'none');
  const avatarUrl = remote?.user?.avatar_data_url;
  const avatarHTML = avatarUrl
    ? `<div class="profile-avatar" style="background-image:url('${avatarUrl}');background-size:cover;background-position:center;color:transparent">.</div>`
    : `<div class="profile-avatar">${initial}</div>`;
  const city = remote?.user?.city || '';
  const region = remote?.user?.region || '';
  const location = [city, region].filter(Boolean).join(', ');
  const linkRaw = remote?.user?.link || '';
  let linkHTML = '';
  if (linkRaw) {
    const href = /^https?:\/\//i.test(linkRaw) ? linkRaw : 'https://' + linkRaw;
    const display = linkRaw.replace(/^https?:\/\//i, '');
    linkHTML = ` · <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--orange)">${display}</a>`;
  }
  let friendBtn = '';
  if (store.user && !isMe) {
    if (fStatus === 'friends') {
      friendBtn = `<button class="btn ghost" onclick="removeFriend('${handle}')">Friends ✓ — Unfriend</button>`;
    } else if (fStatus === 'pending_outgoing') {
      friendBtn = `<button class="btn ghost" onclick="removeFriend('${handle}')">Pending — Cancel request</button>`;
    } else if (fStatus === 'pending_incoming') {
      friendBtn = `<button class="btn gold" onclick="acceptFriend('${handle}')">Accept friend request</button>
        <button class="btn ghost" onclick="removeFriend('${handle}')">Decline</button>`;
    } else {
      friendBtn = `<button class="btn gold" onclick="addFriend('${handle}')">+ Add friend</button>`;
    }
  }
  const friendsStat = isMe
    ? `<div class="stat" style="cursor:pointer" onclick="go('friends')"><span class="num">${friendsCount}</span><span class="lbl">Friends ›</span></div>`
    : `<div class="stat"><span class="num">${friendsCount}</span><span class="lbl">Friends</span></div>`;
  const editBtn = isMe ? `<button class="btn ghost" onclick="go('editProfile')">Edit profile</button>` : '';

  return `${headerHTML()}<div class="sub-page">
    <div class="profile-hero">
      ${avatarHTML}
      <div class="profile-meta">
        <h1>${handle}</h1>
        <div class="handle-sub">Member since ${profile.joined}${location ? ' · ' + location : ''}${linkHTML}</div>
        <p style="margin-top:10px;max-width:560px">${profile.bio}</p>
        <div class="stat-row">
          <div class="stat"><span class="num">${userListings.length}</span><span class="lbl">Active listings</span></div>
          <div class="stat"><span class="num">${totalTrades}</span><span class="lbl">Total trades</span></div>
          <div class="stat"><span class="num">${avgStars ? avgStars.toFixed(1) : '—'}</span><span class="lbl">Avg rating</span></div>
          <div class="stat"><span class="num">${reviewsAbout.length}</span><span class="lbl">Reviews received</span></div>
          ${friendsStat}
        </div>
        ${(friendBtn || editBtn) ? `<div class="actions" style="margin-top:14px">${friendBtn}${editBtn}</div>` : ''}
        ${isMe ? renderPayoutsBlock() : ''}
        <div class="trust-bar">
          <div class="trust-track"><div class="trust-fill" style="width:${trustPct}%"></div></div>
          <div class="trust-label">Trust score: ${trustPct}%</div>
        </div>
      </div>
    </div>

    ${profile.shows.length ? `<div class="profile-section"><h3>Favorite artists</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${profile.shows.map(s => `<span class="pill gray" style="margin-top:0">${s}</span>`).join('')}</div>
    </div>` : ''}

    <div class="profile-section"><h3>${isMe?'My':`${handle}'s`} active listings</h3>
      ${userListings.length ? `<div class="grid g3">${userListings.map(cardHTML).join('')}</div>` : `<p style="color:var(--muted)">No active listings right now.</p>`}
    </div>

    <div class="profile-section"><h3>Reviews received</h3>
      ${reviewsAbout.length ? reviewsAbout.map(r => `<div class="review-card">
        <div><strong>${hl(r.author)}</strong></div>
        <div class="stars-static">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
        <p>"${r.text}"</p>
      </div>`).join('') : `<p style="color:var(--muted)">No reviews yet. Be the first to trade with ${handle}!</p>`}
    </div>
  </div>`;
}

// ===== FRIENDS =====
async function refetchProfile(handle) {
  try {
    store._profileData = await api('/users/' + encodeURIComponent(handle.replace('@','')));
  } catch (e) {
    console.error('refetchProfile:', e);
  }
  render();
}

async function addFriend(handle) {
  if (!requireAuth()) return;
  try { await api('/friends/' + encodeURIComponent(handle), { method:'POST' }); }
  catch (e) { alert('Could not send friend request: ' + e.message); return; }
  await refetchProfile(handle);
}

async function acceptFriend(handle) {
  if (!requireAuth()) return;
  try { await api('/friends/' + encodeURIComponent(handle) + '/accept', { method:'POST' }); }
  catch (e) { alert('Could not accept request: ' + e.message); return; }
  await refetchProfile(handle);
}

async function removeFriend(handle) {
  if (!requireAuth()) return;
  if (!confirm('Remove this friendship / request?')) return;
  try { await api('/friends/' + encodeURIComponent(handle), { method:'DELETE' }); }
  catch (e) { alert('Could not update friendship: ' + e.message); return; }
  await refetchProfile(handle);
}

// Renders the Payouts status block on the user's own profile.
// Three states: 'none' (not started), 'pending' (mid-onboarding), 'enabled' (ready).
function renderPayoutsBlock() {
  const status = store.user?.stripeStatus || 'none';
  if (status === 'enabled') {
    return `<div class="panel" style="margin-top:14px;padding:14px 18px;background:linear-gradient(90deg,#22c55e22,#16a34a22);border-color:#22c55e44">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <strong style="color:#22c55e">✓ Payouts connected</strong>
          <div style="color:var(--muted);font-size:13px;margin-top:4px">You can accept offers; funds will be sent to your linked bank.</div>
        </div>
        <button class="btn ghost" onclick="openStripeDashboard()">Stripe dashboard</button>
      </div>
    </div>`;
  }
  if (status === 'pending') {
    return `<div class="panel" style="margin-top:14px;padding:14px 18px;background:linear-gradient(90deg,#ff7a2e22,#ffb84d22);border-color:#ff7a2e66">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <strong style="color:#ff7a2e">⏳ Payouts setup incomplete</strong>
          <div style="color:var(--muted);font-size:13px;margin-top:4px">Stripe needs more info before you can accept offers.</div>
        </div>
        <button class="btn gold" onclick="startStripeOnboarding()">Continue setup</button>
      </div>
    </div>`;
  }
  return `<div class="panel" style="margin-top:14px;padding:14px 18px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <strong>💰 Connect payouts to accept offers</strong>
        <div style="color:var(--muted);font-size:13px;margin-top:4px">Takes about 5 minutes. You'll need your bank info and an ID.</div>
      </div>
      <button class="btn gold" onclick="startStripeOnboarding()">Connect with Stripe</button>
    </div>
  </div>`;
}

// ===== EDIT PROFILE (Step 8a) =====
function editProfilePage() {
  if (!requireAuth()) return '';
  const me = store._meData || {};
  return `${headerHTML()}<div class="sub-page">
    <h2>Edit profile</h2><span class="mono">${store.user.handle}</span>
    <div class="panel" style="max-width:620px;margin-top:20px">
      <div class="field">
        <label>Profile picture</label>
        <div style="display:flex;align-items:center;gap:14px;margin-top:6px">
          <div id="ep-avatar-preview" style="width:72px;height:72px;border-radius:50%;background:var(--panel);background-size:cover;background-position:center;${me.avatar_data_url ? `background-image:url('${me.avatar_data_url}')` : ''}"></div>
          <input id="ep-avatar-file" type="file" accept="image/*">
          ${me.avatar_data_url ? `<button class="btn ghost" type="button" onclick="clearAvatar()">Remove</button>` : ''}
        </div>
        <p style="color:var(--muted);font-size:12px;margin-top:6px">PNG/JPG, resized to 256px on save.</p>
      </div>
      <div class="field">
        <label>Bio (max 500 chars)</label>
        <textarea id="ep-bio" maxlength="500" placeholder="Tell other fans who you are.">${me.bio || ''}</textarea>
      </div>
      <div class="field">
        <label>Link (website, social, etc.)</label>
        <input id="ep-link" value="${me.link || ''}" placeholder="instagram.com/yourhandle" maxlength="200">
      </div>
      <div class="two-col">
        <div class="field">
          <label>City</label>
          <input id="ep-city" value="${me.city || ''}" placeholder="Brooklyn" maxlength="80">
        </div>
        <div class="field">
          <label>State / Region</label>
          <input id="ep-region" value="${me.region || ''}" placeholder="NY" maxlength="80">
        </div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn gold" onclick="saveProfile()">Save changes</button>
        <button class="btn ghost" onclick="go('profile',{handle:store.user.handle})">Cancel</button>
      </div>
    </div>
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1)">
      <p style="color:var(--muted);font-size:13px;margin-bottom:10px">Want to leave Ribbon Reflector? This permanently deletes your account, listings, and trade history.</p>
      <button class="btn ghost" style="border-color:var(--red);color:var(--red)" onclick="deleteAccount()">Delete my account</button>
    </div>
  </div>`;
}

async function fileToAvatarDataUrl(file, maxDim = 256) {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('could not read image'));
      im.src = blobUrl;
    });
    const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function clearAvatar() {
  store._clearAvatar = true;
  const prev = $('#ep-avatar-preview');
  if (prev) prev.style.backgroundImage = 'none';
  alert('Avatar will be removed when you click Save.');
}

async function saveProfile() {
  if (!requireAuth()) return;
  const body = {
    bio:    $('#ep-bio')?.value ?? '',
    link:   $('#ep-link')?.value.trim() ?? '',
    city:   $('#ep-city')?.value.trim() ?? '',
    region: $('#ep-region')?.value.trim() ?? '',
  };
  const file = $('#ep-avatar-file')?.files?.[0];
  if (file) {
    try { body.avatar_data_url = await fileToAvatarDataUrl(file); }
    catch (e) { alert('Could not process image: ' + e.message); return; }
  } else if (store._clearAvatar) {
    body.avatar_data_url = '';
  }
  try {
    const updated = await api('/me', { method:'PATCH', body });
    store._profileData = null;
    store._meData = updated;
    store._clearAvatar = false;
    alert('✓ Profile saved.');
    go('profile', { handle: store.user.handle });
  } catch (e) {
    alert('Could not save profile: ' + e.message);
  }
}

async function deleteAccount() {
  if (!confirm('Are you sure? This permanently deletes your account, listings, reviews, and trade history. This cannot be undone.')) return;
  if (!confirm('Last chance — type DELETE to confirm.\n\n(Just kidding, click OK to confirm deletion.)')) return;
  try {
    await api('/me', { method: 'DELETE' });
    setToken(null);
    store.user = null;
    store.activeTrade = null;
    alert('Your account has been deleted. We\'re sorry to see you go.');
    go('home');
  } catch (e) {
    alert('Could not delete account: ' + e.message);
  }
}

// ===== FRIENDS LIST PAGE (Step 8b) =====
function friendsPage() {
  if (!requireAuth()) return '';
  const data = store._friendsData || { friends:[], incoming:[], outgoing:[] };
  const card = (f, actionsHTML) => `<div class="review-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
    <div><strong>${hl(f.handle)}</strong></div>
    <div style="display:flex;gap:8px">${actionsHTML}</div>
  </div>`;
  const incomingHTML = data.incoming.length
    ? data.incoming.map(f => card(f, `
        <button class="btn gold" onclick="acceptFriendFromList('${f.handle}')">Accept</button>
        <button class="btn ghost" onclick="removeFriendFromList('${f.handle}')">Decline</button>`)).join('')
    : `<p style="color:var(--muted)">No incoming requests.</p>`;
  const outgoingHTML = data.outgoing.length
    ? data.outgoing.map(f => card(f, `<button class="btn ghost" onclick="removeFriendFromList('${f.handle}')">Cancel request</button>`)).join('')
    : `<p style="color:var(--muted)">No outgoing requests.</p>`;
  const friendsHTML = data.friends.length
    ? data.friends.map(f => card(f, `<button class="btn ghost" onclick="removeFriendFromList('${f.handle}')">Unfriend</button>`)).join('')
    : `<p style="color:var(--muted)">You haven't added any friends yet. Visit a profile and tap <strong>+ Add friend</strong>.</p>`;
  return `${headerHTML()}<div class="sub-page">
    <h2>Friends</h2><span class="mono">${data.friends.length} friend${data.friends.length===1?'':'s'} · ${data.incoming.length} pending</span>
    ${data.incoming.length ? `<div class="profile-section"><h3>Pending requests</h3>${incomingHTML}</div>` : ''}
    <div class="profile-section"><h3>Your friends</h3>${friendsHTML}</div>
    ${data.outgoing.length ? `<div class="profile-section"><h3>Sent requests</h3>${outgoingHTML}</div>` : ''}
  </div>`;
}

async function acceptFriendFromList(handle) {
  try { await api('/friends/' + encodeURIComponent(handle) + '/accept', { method:'POST' }); }
  catch (e) { alert('Could not accept: ' + e.message); return; }
  try { store._friendsData = await api('/friends'); } catch {}
  render();
}
async function removeFriendFromList(handle) {
  if (!confirm('Remove this friendship / request?')) return;
  try { await api('/friends/' + encodeURIComponent(handle), { method:'DELETE' }); }
  catch (e) { alert('Could not update: ' + e.message); return; }
  try { store._friendsData = await api('/friends'); } catch {}
  render();
}

// ===== PAY TRADE (Phase 2 — Stripe Elements checkout) =====
// Lazy-load Stripe.js from the CDN if the script tag wasn't added to index.html.
// Falls back to loading from the CDN at runtime — keeps index.html changes optional.
function ensureStripeJsLoaded() {
  if (window.Stripe) return Promise.resolve();
  if (window._stripeLoading) return window._stripeLoading;
  window._stripeLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Stripe.js'));
    document.head.appendChild(s);
  });
  return window._stripeLoading;
}

async function getStripePublishableKey() {
  if (store._stripePublishableKey) return store._stripePublishableKey;
  const r = await api('/stripe/config');
  store._stripePublishableKey = r.publishable_key;
  return r.publishable_key;
}

function payTradePage() {
  if (!requireAuth()) return '';
  const p = store._payTrade;
  if (!p) return `${headerHTML()}<div class="sub-page"><h2>Complete your payment</h2><p style="color:var(--muted);margin-top:14px">Loading payment details…</p></div>`;
  if (p.error) return `${headerHTML()}<div class="sub-page"><h2>Complete your payment</h2>
    <p style="color:var(--red);margin-top:14px">${p.error}</p>
    <button class="btn ghost" onclick="go('myTickets')">Back to My Tickets</button></div>`;
  if (p.payment_status === 'paid') return `${headerHTML()}<div class="sub-page"><h2>Payment received</h2>
    <p style="margin-top:14px">✓ This trade has already been paid.</p>
    <button class="btn gold" onclick="go('wallet',{tradeId:${p.trade_id}})">Open trade</button></div>`;
  if (p.expired || p.payment_status === 'canceled') return `${headerHTML()}<div class="sub-page"><h2>Payment window expired</h2>
    <p style="margin-top:14px;color:var(--muted)">The seller's listing is available again. You can make a new offer if you'd like.</p>
    <button class="btn ghost" onclick="go('myTickets')">Back to My Tickets</button></div>`;

  const amount = (p.amount_cents || 0) / 100;
  const expiresAt = p.window_expires_at ? Date.parse(p.window_expires_at) : null;
  const secondsLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : null;
  const mm = secondsLeft != null ? String(Math.floor(secondsLeft / 60)).padStart(2,'0') : '--';
  const ss = secondsLeft != null ? String(secondsLeft % 60).padStart(2,'0') : '--';

  // Mount Stripe Elements after the HTML renders. Use setTimeout to run after innerHTML assignment.
  setTimeout(() => mountStripeCheckout(p), 0);

  return `${headerHTML()}<div class="sub-page">
    <h2>Complete your payment</h2>
    <span class="mono">Trade #${p.trade_id} · ${fmt(amount)}</span>
    <div class="panel" style="max-width:520px;margin-top:20px">
      <p style="color:var(--muted);font-size:13px;margin-bottom:10px">Enter your card details below. Funds will be held in escrow until you confirm receipt of the ticket.</p>
      <p style="font-size:13px;margin-bottom:14px">Time remaining: <strong id="pay-timer">${mm}:${ss}</strong></p>
      <div id="payment-element" style="margin:14px 0"></div>
      <div id="payment-error" style="color:var(--red);font-size:13px;margin-bottom:10px;display:none"></div>
      <div class="actions">
        <button class="btn gold" id="pay-submit" onclick="submitStripePayment()">Pay ${fmt(amount)}</button>
        <button class="btn ghost" onclick="cancelStripePayment()" style="border-color:var(--red);color:var(--red)">Cancel payment</button>
      </div>
    </div>
  </div>`;
}

let _stripeElements = null;
let _stripeInstance = null;

async function mountStripeCheckout(p) {
  try {
    await ensureStripeJsLoaded();
    const pk = await getStripePublishableKey();
    if (!pk) throw new Error('Stripe not configured on server.');
    _stripeInstance = window.Stripe(pk);
    const elements = _stripeInstance.elements({
      clientSecret: p.client_secret,
      appearance: { theme: 'night' },
    });
    _stripeElements = elements;
    const paymentElement = elements.create('payment');
    const mount = document.getElementById('payment-element');
    if (mount) paymentElement.mount('#payment-element');
    // Countdown timer
    if (store._payTimerId) clearInterval(store._payTimerId);
    store._payTimerId = setInterval(() => {
      const expiresAt = p.window_expires_at ? Date.parse(p.window_expires_at) : null;
      if (!expiresAt) return;
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      const el = document.getElementById('pay-timer');
      if (el) el.textContent = `${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
      if (left <= 0) { clearInterval(store._payTimerId); if (el) el.textContent = 'Expired'; }
    }, 1000);
  } catch (e) {
    console.error('mountStripeCheckout:', e);
    const errEl = document.getElementById('payment-error');
    if (errEl) { errEl.textContent = 'Could not load payment form: ' + e.message; errEl.style.display = 'block'; }
  }
}

async function submitStripePayment() {
  const errEl = document.getElementById('payment-error');
  const btn = document.getElementById('pay-submit');
  if (!_stripeInstance || !_stripeElements) return;
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  try {
    const result = await _stripeInstance.confirmPayment({
      elements: _stripeElements,
      confirmParams: { return_url: window.location.origin },
      redirect: 'if_required',
    });
    if (result.error) throw new Error(result.error.message);
    // Confirmed — tell backend to sync state + notify seller.
    const tradeId = store._payTrade.trade_id;
    await api('/trades/' + tradeId + '/confirm-payment', { method: 'POST' });
    if (store._payTimerId) clearInterval(store._payTimerId);
    alert('✓ Payment complete. The seller has been notified and will transfer your ticket next.');
    go('wallet', { tradeId });
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Pay now'; }
  }
}

async function cancelStripePayment() {
  if (!confirm('Cancel this payment? The seller\'s listing will be available again.')) return;
  const tradeId = store._payTrade.trade_id;
  try { await api('/trades/' + tradeId + '/cancel-payment', { method: 'POST' }); }
  catch (e) { alert('Could not cancel: ' + e.message); return; }
  if (store._payTimerId) clearInterval(store._payTimerId);
  store._payTrade = null;
  go('myTickets');
}

// ===== HOW IT WORKS =====
function howItWorksPage() {
  const step = (num, icon, title, desc) =>
    `<div style="display:flex;gap:18px;align-items:flex-start;margin-bottom:28px">
      <div style="min-width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--magenta),var(--orange));display:flex;align-items:center;justify-content:center;font-size:22px">${icon}</div>
      <div>
        <div style="font-size:11px;color:var(--magenta);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px">Step ${num}</div>
        <h4 style="margin:0 0 6px;font-size:17px">${title}</h4>
        <p style="color:var(--muted);font-size:14px;line-height:1.5;margin:0">${desc}</p>
      </div>
    </div>`;

  return `${headerHTML()}<div class="sub-page" style="max-width:680px">
    <h2>How Ribbon Reflector works</h2>
    <span class="mono">Face value · Fan-to-fan · Escrow-protected</span>

    <div class="panel" style="margin-top:28px;padding:28px">
      <p style="font-size:15px;line-height:1.6;margin-bottom:28px">Ribbon Reflector is a fan-to-fan ticket marketplace where every ticket is listed at or below face value. No scalpers, no markups. Here's how a trade works:</p>

      ${step('1', '🎟️', 'List your ticket',
        'Post your ticket with the event details and face value. Upload your purchase receipt so we can verify the price. Listings go live after a quick review.')}

      ${step('2', '💰', 'Buyer makes an offer',
        'Fans browse listings and make cash offers up to the face value. They can include a message introducing themselves.')}

      ${step('3', '✅', 'Seller accepts',
        'When you accept an offer, the buyer is asked to pay within 24 hours. Their card is charged and the funds are held in escrow by Stripe — you don\x27t touch the money yet.')}

      ${step('4', '✈️', 'Transfer the ticket',
        'The seller transfers the ticket through their venue or ticketing app (Ticketmaster, AXS, etc.). Then they mark it as sent in Ribbon Reflector.')}

      ${step('5', '📬', 'Buyer confirms receipt',
        'Once the buyer receives the ticket in their app, they confirm receipt. This triggers the escrow release.')}

      ${step('6', '🎉', 'Escrow releases to seller',
        'Funds transfer automatically from escrow to the seller\x27s linked bank account via Stripe. Both sides are prompted to leave a review.')}
    </div>

    <div class="panel" style="margin-top:20px;padding:24px">
      <h4 style="margin-bottom:12px">What if something goes wrong?</h4>
      <p style="color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 10px">Either party can open a dispute at any point during the trade. When a dispute is filed, escrow is paused and our support team reviews the case within 24 hours. Funds are never released until the issue is resolved.</p>
      <p style="color:var(--muted);font-size:14px;line-height:1.6;margin:0">Ribbon Reflector does not guarantee ticket validity. We verify face value via purchase receipts, but the actual ticket transfer is between you and your trade partner through the venue's ticketing platform.</p>
    </div>

    <div class="panel" style="margin-top:20px;padding:24px">
      <h4 style="margin-bottom:12px">Getting started</h4>
      <p style="color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 16px">To buy or sell, you need a Ribbon Reflector membership ($10/year), a verified email address, and (for sellers) a connected Stripe account for payouts.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${store.user
          ? `<button class="btn gold" onclick="go('browse')">Browse tickets</button>
             <button class="btn ghost" onclick="go('postTickets')">Post a ticket</button>`
          : `<button class="btn gold" onclick="go('signup')">Join for $10/year</button>
             <button class="btn ghost" onclick="go('browse')">Browse first</button>`}
      </div>
    </div>
  </div>`;
}

// ===== WALLET POLLING (Step 8d) =====
async function pollWalletTrade() {
  if (store.route !== 'wallet') return;
  const t = store.activeTrade;
  if (!t) return;
  try {
    const trade = await api('/trades/' + t.id);
    let messages = [];
    try { messages = await api('/trades/' + t.id + '/messages'); } catch {}
    trade.partner = trade.viewer_role === 'buyer' ? trade.seller_handle : trade.buyer_handle;
    trade.messages = messages;
    const changed = trade.status !== t.status
      || trade.seller_sent !== t.seller_sent
      || trade.buyer_received !== t.buyer_received
      || (trade.messages.length || 0) !== (t.messages?.length || 0);
    store.activeTrade = trade;
    if (changed && store.route === 'wallet') render();
  } catch {
    // silent
  }
}

// ===== NOTIFICATIONS =====
function notifPanelHTML() {
  if (!store.notifPanelOpen || !store.user) return '';
  const items = store.notifications.length
    ? store.notifications.map(n => `<div class="notif-item ${n.read?'read':'unread'}" onclick="openNotif(${n.id})">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-body"><div class="text">${n.text}</div><div class="time">${n.time}</div></div>
      </div>`).join('')
    : `<div style="padding:40px 22px;text-align:center;color:var(--muted);font-size:13px">No notifications yet. We'll ping you when something's up.</div>`;
  return `<div class="notif-overlay" onclick="toggleNotifs()"></div>
    <div class="notif-panel" onclick="event.stopPropagation()">
      <div class="notif-head"><h3>Notifications</h3>
        ${unreadCount() ? `<button class="mark" onclick="markAllRead()">Mark all read</button>`:''}
      </div>
      <div class="notif-list">${items}</div>
    </div>`;
}
function toggleNotifs() {
  if (!store.user) { go('signup'); return; }
  store.notifPanelOpen = !store.notifPanelOpen;
  render();
}
function openNotif(id) {
  const n = store.notifications.find(x => x.id === id);
  if (!n) return;
  n.read = true;
  store.notifPanelOpen = false;
  if (n.route) go(n.route, n.params); else render();
}
function markAllRead() {
  store.notifications.forEach(n => n.read = true);
  render();
}

// ===== DISPUTE RESOLUTION =====
const DISPUTE_REASONS = [
  { key:'not_transferred', label:'Tickets not transferred', desc:'Partner marked as sent but I never received them in my ticket app.' },
  { key:'wrong_ticket', label:'Wrong ticket received', desc:'What I got doesn\'t match what was listed (different seat, date, or event).' },
  { key:'unresponsive', label:'Partner unresponsive', desc:'No messages or activity for more than 48 hours.' },
  { key:'fraudulent', label:'Suspected fraud', desc:'The listing appears to be fake, resold, or above face value.' },
  { key:'other', label:'Something else', desc:'Describe the issue in the notes below.' },
];

function disputePage() {
  if (!requireAuth()) return '';
  const t = store.activeTrade;
  if (!t) { go('myTickets'); return ''; }
  const d = store.dispute;
  return `${headerHTML()}<div class="sub-page">
    <h2>Open a dispute</h2><span class="mono">Trade #${t.id} · with ${hl(t.partner)}</span>
    <div class="notice" style="border-color:var(--red);background:linear-gradient(90deg,#ff3d5a22,#ff7a2e22)">
      <strong>Funds remain in escrow.</strong> Opening a dispute pauses the trade and alerts our support team. Most disputes are resolved within 24 hours. Please only file if you've already tried to reach your trade partner through chat.
    </div>
    <div class="panel">
      <h4>What went wrong?</h4>
      <div class="radio-group">
        ${DISPUTE_REASONS.map(r => `<div class="radio-opt ${d.reason===r.key?'selected':''}" onclick="selectReason('${r.key}')">
          <strong>${r.label}</strong><span>${r.desc}</span>
        </div>`).join('')}
      </div>
      <div class="field" style="margin-top:24px"><label>Describe the issue</label>
        <textarea id="d-details" placeholder="Give us as much detail as you can — timestamps, what was expected vs. received, any relevant screenshots you're uploading.">${d.details}</textarea>
      </div>
      <div class="field"><label>Upload evidence (optional)</label>
        <label class="upload ${d.evidence?'has-file':''}" id="d-upload-label">
          <div class="icon">${d.evidence?'✓':'📎'}</div>
          ${d.evidence
            ? `<p><strong>${d.evidence}</strong></p><p>Click to replace</p>`
            : `<p><strong>Upload screenshot or receipt</strong></p><p>PDF, PNG, or JPG · under 5MB</p>`}
          <input type="file" id="d-evidence" style="display:none" accept=".pdf,.png,.jpg,.jpeg">
        </label>
      </div>
    </div>
    <div class="actions">
      <button class="btn" style="background:var(--red)" onclick="submitDispute()">Submit dispute</button>
      <button class="btn ghost" onclick="go('wallet')">Back to trade</button>
    </div>
  </div>`;
}

function bindDisputeEvents() {
  const input = $('#d-evidence');
  const label = $('#d-upload-label');
  if (!input || !label) return;
  label.addEventListener('click', e => { if (e.target !== input) input.click(); });
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) { store.dispute.evidence = f.name; render(); }
  });
  const ta = $('#d-details');
  if (ta) ta.addEventListener('input', e => { store.dispute.details = e.target.value; });
}

function selectReason(key) { store.dispute.reason = key; render(); }

async function submitDispute() {
  const d = store.dispute;
  const details = $('#d-details')?.value || d.details;
  if (!d.reason) { alert('Please select a reason for the dispute.'); return; }
  if (!details.trim()) { alert('Please describe the issue.'); return; }
  const t = store.activeTrade;
  if (!t) { alert('No active trade to dispute.'); return; }
  const reasonLabel = DISPUTE_REASONS.find(r => r.key === d.reason).label;
  try {
    await api(`/trades/${t.id}/dispute`, { method:'POST', body:{
      reason: d.reason,
      details,
      evidence_filename: d.evidence?.name || null,
    }});
  } catch (e) {
    alert('Could not submit dispute: ' + e.message);
    return;
  }
  store.disputes.unshift({
    id: 'D-' + store.nextId++, tradeId: t.id, partner: t.partner,
    reason: reasonLabel, details, evidence: d.evidence,
    status: 'open', filedAt: 'Just now',
  });
  try {
    const trade = await api('/trades/' + t.id);
    trade.partner = trade.viewer_role === 'buyer' ? trade.seller_handle : trade.buyer_handle;
    trade.messages = t.messages || [];
    store.activeTrade = trade;
  } catch {
    t.status = 'disputed';
    t.disputed = true;
    t.disputeReason = reasonLabel;
  }
  store.dispute = { reason:'', details:'', evidence:null };
  alert('Dispute submitted. Escrow is paused. You\'ll hear from our team within 24 hours.');
  go('wallet');
}

// ===== OFFER COMPOSITION =====
function composeOfferPage() {
  if (!requireAuth()) return '';
  const target = store.listings.find(x => x.id === store.compose.targetId)
    || store.myListings.find(x => x.id === store.compose.targetId);
  if (!target) { go('browse'); return ''; }

  const faceCents = Math.round(Number(target.face) * 100);
  const currentCents = store.compose.amountCents;
  // Display value for the input: dollars with 2 decimals, or empty if nothing entered yet.
  const amountDisplay = (currentCents != null && currentCents > 0)
    ? (currentCents / 100).toFixed(2)
    : '';
  const overCap = currentCents != null && currentCents > faceCents;
  const validAmount = currentCents != null && currentCents > 0 && currentCents <= faceCents;

  return `${headerHTML()}<div class="sub-page">
    <h2>Make a cash offer</h2><span class="mono">Offering on ${hl(target.owner)}'s listing</span>

    <div class="panel" style="margin-top:20px">
      <h4>You want</h4>
      <p style="font-size:18px;font-weight:600">${target.artist}</p>
      <p style="color:var(--muted);font-size:13px;margin-top:4px">${target.venue} · ${target.city||''}</p>
      <p style="font-size:13px">${target.date} · ${target.seat}</p>
      <p style="margin-top:10px">Face value: <strong>${fmt(target.face)}</strong></p>
      <p style="font-size:11px;color:var(--magenta);margin-top:8px;letter-spacing:0.1em;text-transform:uppercase">Listed by ${target.owner}</p>
      <a class="handle-link" style="display:inline-block;margin-top:10px;font-size:12px" onclick="go('event',{key:'${eventKey(target)}'})">See all tickets for this show →</a>
    </div>

    <div class="panel" style="margin-top:20px;${overCap?'border-color:var(--orange)':''}">
      <h4>Your offer</h4>
      <div class="field">
        <label>Offer amount (USD) — max ${fmt(target.face)}</label>
        <input type="number" id="compose-amount" min="0.01" max="${(faceCents/100).toFixed(2)}" step="0.01"
               placeholder="0.00" value="${amountDisplay}"
               oninput="updateOfferAmount(this.value)">
      </div>
      ${overCap
        ? `<p style="color:var(--orange);font-size:13px">⚠ Offer exceeds face value. Cap is ${fmt(target.face)}.</p>`
        : `<p style="color:var(--muted);font-size:12px">Ribbon Reflector is face-value only. Offers cannot exceed the listed face value.</p>`}
    </div>

    <div class="panel" style="margin-top:20px">
      <h4>Message to ${target.owner}</h4>
      <div class="field"><textarea id="compose-note" placeholder="Introduce yourself and let them know why you're interested..." oninput="store.compose.note=this.value">${store.compose.note}</textarea></div>
      <p style="font-size:12px;color:var(--muted)">The seller sees this with your offer and can accept, decline, or reply.</p>
    </div>

    <div class="actions">
      <button class="btn gold" onclick="submitOffer()" ${validAmount?'':'disabled'}>Send offer</button>
      <button class="btn ghost" onclick="go('browse')">Cancel</button>
    </div>
  </div>`;
}

function updateOfferAmount(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) {
    store.compose.amountCents = null;
  } else {
    store.compose.amountCents = Math.round(n * 100);
  }
  const target = store.listings.find(x => x.id === store.compose.targetId)
    || store.myListings.find(x => x.id === store.compose.targetId);
  if (!target) return;
  const faceCents = Math.round(Number(target.face) * 100);
  const valid = store.compose.amountCents != null && store.compose.amountCents > 0 && store.compose.amountCents <= faceCents;
  const btn = document.querySelector('.actions .btn.gold');
  if (btn) btn.disabled = !valid;
}

function selectMyListing(id) {
  store.compose.myListingId = parseInt(id);
  render();
}

async function submitOffer() {
  const target = store.listings.find(x => x.id === store.compose.targetId)
    || store.myListings.find(x => x.id === store.compose.targetId);
  if (!target) { alert('Listing not found.'); return; }

  const amt = store.compose.amountCents;
  const faceCents = Math.round(Number(target.face) * 100);
  if (!amt || amt <= 0) { alert('Enter an offer amount.'); return; }
  if (amt > faceCents) { alert(`Offer cannot exceed face value (${fmt(target.face)}).`); return; }

  const note = store.compose.note || `Hi ${target.owner}, I'd like to buy your ${target.artist} ticket.`;

  const btn = document.querySelector('button.btn.gold');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    await api('/offers', {
      method: 'POST',
      body: {
        target_listing_id: target.id,
        amount_cents: amt,
        note,
      },
    });
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send offer'; }
    alert('Could not send offer: ' + e.message);
    return;
  }

  store.compose = { targetId:null, amountCents:null, note:'' };
  alert(`✓ Offer sent to ${target.owner}! You'll be notified if they accept.`);
  go('myTickets', {tab:'outgoing'});
}

// ===== EVENT DETAIL =====
function eventPage() {
  const key = store.params.key;
  if (!key) { go('browse'); return ''; }
  const ev = parseEventKey(key);
  const tickets = allListingsForEvent(key);
  if (!tickets.length) { go('browse'); return ''; }
  const sample = tickets[0];
  const city = sample.city || '';
  const minFace = Math.min(...tickets.map(t => Number(t.face)));
  const maxFace = Math.max(...tickets.map(t => Number(t.face)));
  const priceRange = minFace === maxFace ? fmt(minFace) : `${fmt(minFace)} – ${fmt(maxFace)}`;
  const relatedByArtist = [...store.listings, ...store.myListings]
    .filter(t => t.artist === ev.artist && eventKey(t) !== key);

  return `${headerHTML()}<div class="sub-page">
    <div class="profile-hero" style="background:linear-gradient(135deg,var(--red),var(--magenta),var(--purple))">
      <div class="profile-avatar" style="background:linear-gradient(135deg,var(--orange),var(--red));font-size:44px">${ev.artist.charAt(0)}</div>
      <div class="profile-meta">
        <h1>${ev.artist}</h1>
        <div class="handle-sub">${ev.venue}${city?' · '+city:''} · ${ev.date}</div>
        <div class="stat-row">
          <div class="stat"><span class="num">${tickets.length}</span><span class="lbl">Listings</span></div>
          <div class="stat"><span class="num">${priceRange}</span><span class="lbl">Face value range</span></div>
          <div class="stat"><span class="num">${tickets.reduce((s,t)=>s+(t.qty||1),0)}</span><span class="lbl">Total seats</span></div>
        </div>
      </div>
    </div>

    <div class="profile-section"><h3>Available at this show</h3>
      <div class="grid g3">${tickets.map(cardHTML).join('')}</div>
    </div>

    ${relatedByArtist.length ? `<div class="profile-section"><h3>Other ${ev.artist} shows</h3>
      <div class="grid g3">${relatedByArtist.map(cardHTML).join('')}</div>
    </div>` : ''}
  </div>`;
}

// ===== RENDER =====
const routes = {
  home: homePage, browse: browsePage,
  signup: signupPage, login: loginPage, checkout: checkoutPage,
  forgotPassword: forgotPasswordPage, resetPassword: resetPasswordPage,
  howItWorks: howItWorksPage,
  payTrade: payTradePage,
  postTickets: postTicketsPage, myTickets: myTicketsPage,
  wallet: walletPage, reviews: reviewsPage,
  profile: profilePage, editProfile: editProfilePage,
  friends: friendsPage,
  dispute: disputePage,
  composeOffer: composeOfferPage, event: eventPage,
};

function render() {
  const fn = routes[store.route] || homePage;
  const footerHTML = '<footer style="text-align:center;padding:40px 20px 24px;font-size:12px;color:var(--muted);border-top:1px solid rgba(255,255,255,0.08);margin-top:60px">' +
    '<a href="http://remaininlight.com/ribbon-privacy.html" target="_blank" rel="noopener" style="color:var(--muted);text-decoration:underline">Privacy Policy</a>' +
    '<span style="margin:0 8px">\u00b7</span>' +
    '<span>\u00a9 2026 Ribbon Reflector</span></footer>';
  $('#app').innerHTML = fn() + notifPanelHTML() + footerHTML;
  if (store.route === 'postTickets') bindPostTicketsEvents();
  if (store.route === 'dispute') bindDisputeEvents();
}

// ===== EMAIL VERIFICATION (Step 9a) =====
// Parses ?verify=TOKEN out of the URL on initial load, calls the backend, and
// strips the query string so a refresh doesn't re-trigger the call.
async function handleInitialUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verify');
    const resetToken = params.get('reset');
    const stripeReturn = params.get('stripe_return');
    if (verifyToken) {
      window.history.replaceState({}, '', window.location.pathname);
      await verifyEmailToken(verifyToken);
      return false;
    } else if (resetToken) {
      window.history.replaceState({}, '', window.location.pathname);
      await go('resetPassword', { token: resetToken });
      return true;
    } else if (stripeReturn) {
      // User just came back from Stripe Express onboarding. Strip query, refresh status, show toast.
      window.history.replaceState({}, '', window.location.pathname);
      await refreshStripeStatus();
      const status = store.user?.stripeStatus;
      if (status === 'enabled') alert('✓ Payouts connected — you can now accept offers.');
      else if (status === 'pending') alert('Stripe needs a bit more info. Click "Continue setup" on your profile to finish.');
      // Fall through to normal home routing.
    }
  } catch (e) {
    console.error('handleInitialUrl:', e);
  }
}

async function verifyEmailToken(token) {
  try {
    const result = await api('/auth/verify-email/' + encodeURIComponent(token), { method: 'POST' });
    // Update local state if the viewer happens to be logged in as this account.
    if (store.user) {
      try {
        const me = await api('/me');
        store.user = { ...store.user, emailVerified: !!me.email_verified };
      } catch {}
    }
    alert(result.already
      ? '✓ Email already verified — you\'re good to go.'
      : '✓ Email verified! You can now list tickets and make offers.');
    render();
  } catch (e) {
    alert('Could not verify email: ' + e.message + '\n\nThe link may have expired. Sign in and click Resend email to get a new one.');
  }
}

async function resendVerification() {
  if (!store.user) { go('login'); return; }
  try {
    const r = await api('/auth/resend-verification', { method: 'POST' });
    if (r.already_verified) {
      store.user.emailVerified = true;
      render();
      alert('✓ Already verified.');
    } else {
      alert('✓ Sent! Check ' + store.user.email + ' for the new link.');
    }
  } catch (e) {
    alert('Could not send email: ' + e.message);
  }
}

// ===== STRIPE CONNECT (Phase 1) =====
async function startStripeOnboarding() {
  if (!requireAuth()) return;
  if (!store.user.emailVerified) { alert('Please verify your email first.'); return; }
  try {
    const r = await api('/stripe/connect-onboarding', { method: 'POST' });
    // Full-page redirect to Stripe-hosted onboarding.
    window.location.href = r.url;
  } catch (e) {
    alert('Could not start payout setup: ' + e.message);
  }
}

async function openStripeDashboard() {
  if (!requireAuth()) return;
  try {
    const r = await api('/stripe/dashboard-link', { method: 'POST' });
    window.open(r.url, '_blank');
  } catch (e) {
    alert('Could not open dashboard: ' + e.message);
  }
}

// Pull authoritative status from backend (which calls Stripe). Updates store.user.stripeStatus.
async function refreshStripeStatus() {
  if (!store.user) return;
  try {
    const r = await api('/stripe/account-status');
    store.user.stripeStatus = r.status;
    return r;
  } catch (e) {
    console.error('refreshStripeStatus:', e);
  }
}

// ===== PASSWORD RESET (Step 9b) =====
function forgotPasswordPage() {
  return `${headerHTML()}<div class="sub-page">
    <h2>Reset your password</h2><span class="mono">We'll email you a link to choose a new one.</span>
    <div class="panel" style="max-width:460px;margin-top:20px">
      <div class="field"><label>Email</label><input id="fp-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="actions" style="margin-top:14px">
        <button class="btn gold" onclick="submitForgotPassword()">Send reset link</button>
        <button class="btn ghost" onclick="go('login')">Back to sign in</button>
      </div>
    </div>
  </div>`;
}

async function submitForgotPassword() {
  const email = $('#fp-email')?.value.trim();
  if (!email) { alert('Please enter your email.'); return; }
  try {
    await api('/auth/forgot-password', { method: 'POST', body: { email } });
  } catch (e) {
    // Backend deliberately returns 200 even when no account exists — but if it did fail,
    // still show a generic message so we don't leak which addresses are registered.
    console.error('forgot-password:', e);
  }
  alert('If an account exists for ' + email + ', a reset link is on its way. Check your inbox (and spam folder).');
  go('login');
}

function resetPasswordPage() {
  const token = store.params.token || '';
  if (!token) {
    return `${headerHTML()}<div class="sub-page"><h2>Reset password</h2>
      <p style="color:var(--muted);margin-top:14px">No reset token provided. Use the link from your reset email, or <a onclick="go('forgotPassword')" style="color:var(--orange);cursor:pointer">request a new one</a>.</p>
    </div>`;
  }
  return `${headerHTML()}<div class="sub-page">
    <h2>Choose a new password</h2><span class="mono">Almost done — pick something at least 8 characters.</span>
    <div class="panel" style="max-width:460px;margin-top:20px">
      <div class="field"><label>New password</label><input id="rp-pw" type="password" placeholder="At least 8 characters" autocomplete="new-password"></div>
      <div class="field"><label>Confirm new password</label><input id="rp-pw2" type="password" autocomplete="new-password"></div>
      <div class="actions" style="margin-top:14px">
        <button class="btn gold" onclick="submitResetPassword()">Reset password</button>
        <button class="btn ghost" onclick="go('login')">Cancel</button>
      </div>
    </div>
  </div>`;
}

async function submitResetPassword() {
  const token = store.params.token;
  const pw = $('#rp-pw')?.value || '';
  const pw2 = $('#rp-pw2')?.value || '';
  if (pw.length < 8) { alert('Password must be at least 8 characters.'); return; }
  if (pw !== pw2) { alert('Passwords don\'t match.'); return; }
  try {
    const result = await api('/auth/reset-password/' + encodeURIComponent(token), { method: 'POST', body: { password: pw } });
    // Backend auto-logs us in on success.
    if (result.token) setToken(result.token);
    try {
      const me = await api('/me');
      store.user = { handle: me.handle, email: me.email, isMember: !!me.is_member, memberUntil: me.member_until, emailVerified: !!me.email_verified };
    } catch {}
    alert('✓ Password reset. You\'re signed in.');
    go('home');
  } catch (e) {
    alert('Could not reset password: ' + e.message + '\n\nThe link may have expired. Request a new one.');
  }
}

// On initial load, check for a verification token in the URL, then route.
(async () => {
  const handled = await handleInitialUrl();
  if (!handled) go('home');
})();
