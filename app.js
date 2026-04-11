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
  incomingOffers: [
    {id:101,from:'@deadhead_42',forListing:null,offering:{artist:'Goose',venue:'Brooklyn Paramount',date:'Nov 8, 2026',seat:'GA Floor',face:95},status:'pending'},
  ],
  outgoingOffers: [],
  completedTrades: [
    {id:201,partner:'@marisol_k',gave:'Vampire Weekend · Fillmore',got:'Mitski · Radio City',date:'Mar 2026',rating:5},
  ],
  activeTrade: null, // {id, stage, partner, mine, theirs, messages}
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
  notifications: [
    {id:901,icon:'🎟️',text:'<strong>@deadhead_42</strong> sent you an offer for Phish at Hampton.',time:'2m ago',read:false,route:'myTickets',params:{tab:'incoming'}},
    {id:902,icon:'💬',text:'New message from <strong>@marisol_k</strong> about your Goose tickets.',time:'1h ago',read:false,route:'wallet'},
    {id:903,icon:'✨',text:'Your listing for <strong>King Gizzard</strong> was approved and is now live.',time:'3h ago',read:true,route:'myTickets'},
    {id:904,icon:'⭐',text:'<strong>@peach.pit</strong> left you a 5-star review.',time:'yesterday',read:true,route:'profile',params:{handle:'@folkjam'}},
  ],
  notifPanelOpen: false,
  disputes: [],
  dispute: { reason:'', details:'', evidence:null },
  compose: { targetId:null, myListingId:null, note:'' },
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
        store.user = { handle: me.handle, email: me.email, isMember: !!me.is_member, memberUntil: me.member_until };
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
    }
    if (route === 'profile') {
      const handle = (params.handle || store.user?.handle || '').replace('@', '');
      if (handle) {
        try {
          store._profileData = await api('/users/' + encodeURIComponent(handle));
        } catch { store._profileData = null; }
      }
    }
  } catch (e) { console.error('loadRouteData:', e); }
}

async function go(route, params) {
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
  return `<header>
    <div class="logo" onclick="go('home')"><div class="logo-mark">❦</div>Ribbon Reflector</div>
    <nav class="top">
      ${store.user ? `<a onclick="go('myTickets')">My Tickets</a>` : ''}
      ${store.activeTrade ? `<a onclick="go('wallet')" style="color:var(--orange)">TicketWallet ●</a>` : ''}
      <a onclick="go('browse')">Browse</a>
      <div class="icon-btn" title="Messages">💬</div>
      <div class="icon-btn bell-wrap" onclick="toggleNotifs()" title="Notifications">🔔${store.user && unreadCount() ? `<span class="bell-badge">${unreadCount()}</span>`:''}</div>
      ${store.user
        ? `<div class="avatar" onclick="go('profile',{handle:'${store.user.handle}'})" title="${store.user.handle}"></div>
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
      <h1>Face Value Movement</h1>
      <p class="tag">No scalpers, no brokers.<br>Just real people sharing our love for music.</p>
      <div class="hero-tabs"><a class="active" onclick="go('browse')">Find Tickets</a><a onclick="go('postTickets')">Post Tickets</a><a>Create Alerts</a></div>
      <div class="search">🔍 <input placeholder="Search for artists, venues, or events"></div>
    </div>
  </div>
  <div class="body-section">
    <div class="greeting">${store.user ? 'Hi '+store.user.handle.replace('@','') : 'Welcome, friend'}</div>
    <div class="greeting-sub">${store.user?.isMember ? 'Membership active · $10/year · face value only' : 'Join the community for $10/year — face value only.'}</div>
    <div class="section-head"><h2>${store.user?'My Listings':'Featured Tickets'}</h2><a onclick="go('browse')">View All →</a></div>
    <div class="grid">${mine.map(cardHTML).join('')}</div>
  </div>
  <footer>Ribbon Reflector ❦ Fan-to-fan, face value, forever.</footer>`;
}

function cardHTML(t) {
  const statusPill = {
    active:'<span class="pill green">Active</span>',
    pending:'<span class="pill orange">Offer Pending</span>',
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
    store.user = { handle: me.handle, email: me.email, isMember: true, memberUntil: me.member_until };
    store.pendingUser = null;
    alert('✓ Payment successful — welcome to Ribbon Reflector!');
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
    if (f) { store._receiptName = f.name; render(); }
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
    if (!store.incomingOffers.length) return emptyState('No incoming offers','When someone wants to trade for your tickets, they\'ll appear here.');
    return store.incomingOffers.map(o => `<div class="list-row">
      <div class="info"><h4>Offer from ${hl(o.from)}</h4><div class="sub">Wants to trade <strong>${o.offering.artist}</strong> · ${o.offering.venue} · ${o.offering.date} · ${o.offering.seat} (${fmt(o.offering.face)})</div></div>
      <div style="display:flex;gap:8px"><button class="btn sm" onclick="acceptIncoming(${o.id})">Accept</button><button class="btn sm ghost" onclick="declineIncoming(${o.id})">Decline</button></div>
    </div>`).join('');
  }
  if (tab === 'outgoing') {
    if (!store.outgoingOffers.length) return emptyState('No outgoing offers','Browse listings and make your first offer.','Browse listings','browse');
    return store.outgoingOffers.map(o => `<div class="list-row">
      <div class="info"><h4>Offer to ${hl(o.to)}</h4><div class="sub">${o.theirArtist} · ${o.theirVenue} · ${o.theirDate}</div></div>
      <span class="pill orange">Awaiting response</span>
    </div>`).join('');
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

function acceptIncoming(id) {
  const o = store.incomingOffers.find(x => x.id === id);
  if (!o) return;
  store.incomingOffers = store.incomingOffers.filter(x => x.id !== id);
  // Create the active trade
  const myListing = store.myListings[0] || {artist:'Your ticket',venue:'Venue',date:'TBD',seat:'GA',face:0};
  store.activeTrade = {
    id: 'RR-' + (4800 + store.nextId++),
    stage: 1, // Already accepted — cards just charged
    partner: o.from,
    mine: { artist: myListing.artist, venue: myListing.venue, date: myListing.date, seat: myListing.seat, face: myListing.face },
    theirs: { ...o.offering, owner: o.from },
    messages: [
      { who:'them', text:`Thanks for accepting! I'll transfer my ${o.offering.artist} ticket through ${o.offering.venue.includes('Radio')?'AXS':'Ticketmaster'} shortly.` },
      { who:'me', text:`Sounds great — I'll send mine right after. Talk soon!` },
    ],
  };
  addNotification('🎉', `You accepted <strong>${o.from}</strong>'s offer — both cards charged.`, 'wallet');
  go('wallet');
}
function declineIncoming(id) {
  store.incomingOffers = store.incomingOffers.filter(x => x.id !== id);
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
const TRADE_STAGES = [
  { key:'offer',    label:'Offer sent' },
  { key:'accepted', label:'Accepted & charged' },
  { key:'sent',     label:'Tickets sent' },
  { key:'received', label:'Received' },
];
const ADVANCE_LABELS = [
  'Lister accepts — charge cards',
  'Mark my ticket as sent',
  'Mark received — release payout',
  'Leave a review →',
];

function walletPage() {
  if (!requireAuth()) return '';
  const t = store.activeTrade;
  if (!t) {
    return `${headerHTML()}<div class="sub-page"><h2>TicketWallet</h2><span class="mono">Escrow</span>
      ${emptyState('No active trade','When an offer is accepted, your escrow dashboard lands here.','View my offers','myTickets')}</div>`;
  }
  const stage = t.stage;
  const statusHTML = TRADE_STAGES.map((s,i) => {
    const cls = i < stage ? 'done' : i === stage ? 'active' : '';
    return `<div class="status-step ${cls}"><span class="mono">Step ${i+1}</span>${s.label}${i<stage?' ✓':''}</div>`;
  }).join('');
  const msgsHTML = t.messages.map(m => `<div class="msg ${m.who}">${m.text}</div>`).join('');
  const canAdvance = stage < 4 && !t.disputed;
  return `${headerHTML()}<div class="sub-page"><h2>TicketWallet</h2><span class="mono">Escrow · Trade #${t.id} · with ${hl(t.partner)}</span>
    ${t.disputed ? `<div class="dispute-banner"><div class="icon">⚠️</div><div>
      <h4>Dispute open — escrow paused</h4>
      <p>Reason: <strong>${t.disputeReason}</strong>. Our support team will reach out within 24 hours. Funds are held until the case is resolved.</p>
    </div></div>` : `<div class="notice">Funds and tickets are held in escrow. Both cards were charged when the offer was accepted. Payout releases once both parties mark tickets received.</div>`}
    <div class="status">${statusHTML}</div>
    <div class="two-col">
      <div class="panel"><h4>You're sending</h4>
        <p style="font-size:17px;font-weight:600">${t.mine.artist}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:4px">${t.mine.venue} · ${t.mine.date}</p>
        <p style="font-size:13px">${t.mine.seat}</p>
        <p style="margin-top:10px">Face value: <strong>${fmt(t.mine.face)}</strong></p>
      </div>
      <div class="panel"><h4>You're receiving</h4>
        <p style="font-size:17px;font-weight:600">${t.theirs.artist}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:4px">${t.theirs.venue} · ${t.theirs.date}</p>
        <p style="font-size:13px">${t.theirs.seat}</p>
        <p style="margin-top:10px">Face value: <strong>${fmt(t.theirs.face)}</strong></p>
      </div>
    </div>
    <div class="panel" style="margin-top:20px"><h4>Chat with ${t.partner}</h4>
      <div id="msgs">${msgsHTML}</div>
      <div class="chat-input"><input id="chatInput" placeholder="Write a message..." onkeydown="if(event.key==='Enter')sendMsg()"><button class="btn" onclick="sendMsg()">Send</button></div>
    </div>
    <div class="actions">
      ${canAdvance ? `<button class="btn gold" onclick="advanceTrade()">${ADVANCE_LABELS[stage]}</button>` : ''}
      <button class="btn ghost" onclick="go('myTickets')">Back to My Tickets</button>
      ${stage < 3 ? `<button class="btn ghost" onclick="cancelTrade()" style="margin-left:auto;border-color:var(--red);color:var(--red)">Dispute / cancel</button>` : ''}
    </div>
  </div>`;
}

function sendMsg() {
  const input = $('#chatInput');
  const v = input?.value.trim();
  if (!v || !store.activeTrade) return;
  store.activeTrade.messages.push({ who:'me', text:v });
  // Fake a reply after a beat
  setTimeout(() => {
    if (!store.activeTrade) return;
    store.activeTrade.messages.push({ who:'them', text:'Got it 🎟️' });
    if (store.route === 'wallet') render();
  }, 900);
  render();
}

function advanceTrade() {
  const t = store.activeTrade;
  if (!t) return;
  if (t.stage < 3) {
    t.stage++;
    if (t.stage === 2) {
      t.messages.push({ who:'them', text:'Just marked mine sent too — check your venue app!' });
      addNotification('✈️', `Tickets marked as sent for trade <strong>${t.id}</strong>.`, 'wallet');
    }
    if (t.stage === 3) {
      addNotification('📬', `Tickets received for trade <strong>${t.id}</strong>.`, 'wallet');
    }
    render();
  } else {
    // Trade complete → move to completed, go to reviews
    t.stage = 4;
    store.completedTrades.unshift({
      id: t.id, partner: t.partner,
      gave: `${t.mine.artist} · ${t.mine.venue}`,
      got: `${t.theirs.artist} · ${t.theirs.venue}`,
      date: 'Apr 2026', rating: 0,
    });
    go('reviews');
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

function submitReview() {
  const text = $('#reviewText')?.value.trim() || 'Great trade — smooth and friendly.';
  const stars = store.reviewRating || 5;
  const t = store.activeTrade;
  store.communityReviews.unshift({
    author: store.user.handle, stars, text,
  });
  if (t) {
    // Update the completed trade rating
    const ct = store.completedTrades.find(x => x.id === t.id);
    if (ct) ct.rating = stars;
  }
  store.activeTrade = null;
  store.reviewRating = 0;
  alert('✓ Review published — thanks for keeping the community strong.');
  go('myTickets', {tab:'completed'});
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

  return `${headerHTML()}<div class="sub-page">
    <div class="profile-hero">
      <div class="profile-avatar">${initial}</div>
      <div class="profile-meta">
        <h1>${handle}</h1>
        <div class="handle-sub">Member since ${profile.joined} · ${profile.bio}</div>
        <div class="stat-row">
          <div class="stat"><span class="num">${userListings.length}</span><span class="lbl">Active listings</span></div>
          <div class="stat"><span class="num">${totalTrades}</span><span class="lbl">Total trades</span></div>
          <div class="stat"><span class="num">${avgStars ? avgStars.toFixed(1) : '—'}</span><span class="lbl">Avg rating</span></div>
          <div class="stat"><span class="num">${reviewsAbout.length}</span><span class="lbl">Reviews received</span></div>
        </div>
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

function submitDispute() {
  const d = store.dispute;
  const details = $('#d-details')?.value || d.details;
  if (!d.reason) { alert('Please select a reason for the dispute.'); return; }
  if (!details.trim()) { alert('Please describe the issue.'); return; }
  const t = store.activeTrade;
  const reasonLabel = DISPUTE_REASONS.find(r => r.key === d.reason).label;
  store.disputes.unshift({
    id: 'D-' + store.nextId++, tradeId: t.id, partner: t.partner,
    reason: reasonLabel, details, evidence: d.evidence,
    status: 'open', filedAt: 'Just now',
  });
  // Flag the active trade as disputed
  t.disputed = true;
  t.disputeReason = reasonLabel;
  // Notify
  addNotification('⚠️', `Dispute filed for trade <strong>${t.id}</strong>. Support will reach out within 24 hours.`, 'wallet');
  // Reset dispute form
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

  const eligibleListings = store.myListings.filter(l => l.status === 'active' || l.status === 'pending');
  const selected = eligibleListings.find(l => l.id === store.compose.myListingId) || eligibleListings[0];
  const priceDelta = selected ? Number(target.face) - Number(selected.face) : 0;
  const priceMatch = Math.abs(priceDelta) < 1;

  return `${headerHTML()}<div class="sub-page">
    <h2>Compose your offer</h2><span class="mono">Trading with ${hl(target.owner)}</span>

    ${eligibleListings.length === 0 ? `
    <div class="notice" style="border-color:var(--orange)">
      <strong>You don't have any tickets to offer yet.</strong> Post a ticket first, then come back to make this trade.
    </div>
    <div class="actions"><button class="btn" onclick="go('postTickets')">Post a ticket</button>
    <button class="btn ghost" onclick="go('browse')">Back to browse</button></div>
    </div>` : `

    <div class="two-col">
      <div class="panel">
        <h4>You want</h4>
        <p style="font-size:18px;font-weight:600">${target.artist}</p>
        <p style="color:var(--muted);font-size:13px;margin-top:4px">${target.venue} · ${target.city||''}</p>
        <p style="font-size:13px">${target.date} · ${target.seat}</p>
        <p style="margin-top:10px">Face value: <strong>${fmt(target.face)}</strong></p>
        <p style="font-size:11px;color:var(--magenta);margin-top:8px;letter-spacing:0.1em;text-transform:uppercase">Listed by ${target.owner}</p>
        <a class="handle-link" style="display:inline-block;margin-top:10px;font-size:12px" onclick="go('event',{key:'${eventKey(target)}'})">See all tickets for this show →</a>
      </div>
      <div class="panel">
        <h4>You'll offer</h4>
        <div class="field"><label>Pick from your listings</label>
          <select onchange="selectMyListing(this.value)">
            ${eligibleListings.map(l => `<option value="${l.id}" ${selected?.id===l.id?'selected':''}>${l.artist} · ${l.venue} · ${fmt(l.face)}</option>`).join('')}
          </select>
        </div>
        ${selected ? `
          <p style="color:var(--muted);font-size:13px;margin-top:4px">${selected.venue}</p>
          <p style="font-size:13px">${selected.date} · ${selected.seat}</p>
          <p style="margin-top:10px">Face value: <strong>${fmt(selected.face)}</strong></p>
        ` : ''}
      </div>
    </div>

    <div class="panel" style="margin-top:20px;${priceMatch?'':'border-color:var(--orange)'}">
      <h4>Price match</h4>
      ${priceMatch
        ? `<p style="color:var(--green);font-size:14px">✓ Face values match — straight swap, no balancing payment needed.</p>`
        : `<p style="color:var(--orange);font-size:14px">⚠ Face values differ by ${fmt(Math.abs(priceDelta))}. ${priceDelta > 0
            ? `You'd owe <strong>${target.owner}</strong> the difference at checkout.`
            : `<strong>${target.owner}</strong> would owe you the difference at checkout.`}</p>`}
    </div>

    <div class="panel" style="margin-top:20px">
      <h4>Message to ${target.owner}</h4>
      <div class="field"><textarea id="compose-note" placeholder="Introduce yourself, share which show you're going to, and let them know why this trade would work for you..." oninput="store.compose.note=this.value">${store.compose.note}</textarea></div>
      <p style="font-size:12px;color:var(--muted)">This message starts the chat. The lister sees it in their Incoming Offers tab and can accept, decline, or reply.</p>
    </div>

    <div class="actions">
      <button class="btn gold" onclick="submitOffer()">Send offer → adds to their TicketWallet</button>
      <button class="btn ghost" onclick="go('browse')">Cancel</button>
    </div>
    `}
  </div>`;
}

function selectMyListing(id) {
  store.compose.myListingId = parseInt(id);
  render();
}

function submitOffer() {
  const target = store.listings.find(x => x.id === store.compose.targetId)
    || store.myListings.find(x => x.id === store.compose.targetId);
  const mine = store.myListings.find(l => l.id === store.compose.myListingId);
  if (!target || !mine) { alert('Please pick one of your listings to offer.'); return; }
  const note = store.compose.note || `Hey ${target.owner}! I'd love to trade my ${mine.artist} ticket for your ${target.artist} ticket.`;

  store.outgoingOffers.unshift({
    id: store.nextId++, to: target.owner,
    theirArtist: target.artist, theirVenue: target.venue, theirDate: target.date,
    myListingId: mine.id, targetId: target.id, note,
  });
  addNotification('📨', `Offer sent to <strong>${target.owner}</strong> for ${target.artist}.`, 'myTickets', {tab:'outgoing'});
  store.compose = { targetId:null, myListingId:null, note:'' };
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
  postTickets: postTicketsPage, myTickets: myTicketsPage,
  wallet: walletPage, reviews: reviewsPage,
  profile: profilePage, dispute: disputePage,
  composeOffer: composeOfferPage, event: eventPage,
};

function render() {
  const fn = routes[store.route] || homePage;
  $('#app').innerHTML = fn() + notifPanelHTML();
  if (store.route === 'postTickets') bindPostTicketsEvents();
  if (store.route === 'dispute') bindDisputeEvents();
}

render();
