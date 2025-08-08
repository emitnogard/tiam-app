
// --- Utilities ---
const CATEGORIES = [
  "Income","Transfer","Rent/Mortgage","Utilities","Groceries","Dining","Transportation",
  "Subscriptions","Shopping","Health","Entertainment","Fees","Other",
];

function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function parseAmount(raw){ if(raw==null) return 0; const s = String(raw).replace(/[^0-9\-\.]/g,''); const n = parseFloat(s); return Number.isFinite(n)?n:0; }
function parseDate(raw){
  if(!raw) return new Date();
  const iso = new Date(raw); if(!isNaN(iso.getTime())) return iso;
  const m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m) return new Date(Number(m[3].length===2?('20'+m[3]):m[3]), Number(m[1])-1, Number(m[2]));
  return new Date();
}
function fmt(n){ return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(n||0); }
function monthKey(d){ const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function load(k,f){ try{ const v = JSON.parse(localStorage.getItem(k)||'null'); return v ?? f; }catch{ return f; } }
function safeSplitCSV(line){
  const out=[]; let cur='', inQ=false;
  for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='\"'){ inQ=!inQ; continue; } if(c===',' && !inQ){ out.push(cur); cur=''; continue; } cur+=c; }
  out.push(cur); return out.map(s=>s.trim());
}
function inferCategory(desc, amount){
  const d = String(desc||'').toLowerCase();
  if(amount>0) return 'Income';
  if(/(netflix|spotify|hulu|prime|apple|youtube|crunchyroll|psn|xbox|discord|adobe)/.test(d)) return 'Subscriptions';
  if(/(uber|lyft|gas|shell|chevron)/.test(d)) return 'Transportation';
  if(/(whole foods|kroger|heb|trader joe|walmart|aldi)/.test(d)) return 'Groceries';
  if(/(walgreens|cvs|rite aid|pharmacy)/.test(d)) return 'Health';
  if(/(rent|mortgage)/.test(d)) return 'Rent/Mortgage';
  if(/(water|electric|power|gas bill|utility)/.test(d)) return 'Utilities';
  if(/(amazon|target|best buy|walmart)/.test(d)) return 'Shopping';
  if(/(mcdonald|burger king|chipotle|taco|pizza|kfc|popeyes|starbucks)/.test(d)) return 'Dining';
  return 'Other';
}
function titleCase(s){ return String(s).split(' ').map(w=>w? w[0].toUpperCase()+w.slice(1) : '').join(' '); }

// --- State ---
let accounts = load('mt_accounts', [{ id: uid(), name: 'Checking', balance: 0 }]);
let transactions = load('mt_transactions', []);
let autoRecalc = load('mt_autoRecalc', true);

// --- Elements ---
const el = (id) => document.getElementById(id);
const accountsEl = el('accounts');
const txAcct = el('txAcct');
const txCat = el('txCat');
const qCat = el('qCat');
const txTableBody = document.querySelector('#txTable tbody');
const subsBody = document.querySelector('#subsTable tbody');
const upcomingBody = document.querySelector('#upcomingTable tbody');

// setup categories
CATEGORIES.forEach(c => {
  const o1 = document.createElement('option'); o1.value=c; o1.textContent=c; txCat.appendChild(o1);
  const o2 = document.createElement('option'); o2.value=c; o2.textContent=c; qCat.appendChild(o2);
});
el('txDate').value = new Date().toISOString().slice(0,10);
el('autoRecalc').checked = autoRecalc;

// --- Rendering ---
function renderAccounts(){
  // derive balances if enabled
  if(autoRecalc){
    const map = Object.fromEntries(accounts.map(a => [a.id, {...a, balance:0}]));
    for(const t of transactions){ if(t.accountId && map[t.accountId]) map[t.accountId].balance += t.amount; }
    accounts = Object.values(map);
  }
  save('mt_accounts', accounts);

  // fill account selects
  txAcct.innerHTML='';
  for(const a of accounts){
    const opt = document.createElement('option'); opt.value=a.id; opt.textContent=a.name;
    txAcct.appendChild(opt);
  }
  if(accounts[0]) txAcct.value = accounts[0].id;

  accountsEl.innerHTML='';
  for(const a of accounts){
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `
      <div class="label">Account</div>
      <div class="value">${a.name}</div>
      <div class="hint">Balance</div>
      <div class="value">${fmt(a.balance)}</div>
      <div class="row" style="margin-top:8px; gap:8px">
        <button class="btn secondary" data-remove="${a.id}">Remove</button>
      </div>
    `;
    accountsEl.appendChild(card);
  }
  accountsEl.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-remove');
      accounts = accounts.filter(a=>a.id!==id);
      transactions = transactions.map(t => t.accountId===id ? {...t, accountId:null} : t);
      save('mt_transactions', transactions);
      renderAll();
    });
  });
}

function monthKeyJS(date){ return monthKey(date); }

function renderSummary(){
  const d = new Date();
  const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const monthTx = transactions.filter(t => monthKeyJS(t.date)===mk);
  const income = monthTx.filter(t => t.amount>0).reduce((s,t)=>s+t.amount,0);
  const out = monthTx.filter(t => t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
  const bal = accounts.reduce((s,a)=>s+(a.balance||0),0);
  el('curBal').textContent = fmt(bal);
  el('curIncome').textContent = fmt(income);
  el('curOut').textContent = fmt(out);
  el('curNet').textContent = fmt(income - out);
}

function renderTransactions(){
  save('mt_transactions', transactions);
  const q = (el('q').value || '').toLowerCase();
  const cat = qCat.value;
  const filtered = transactions.filter(t => {
    const matchQ = q ? (String(t.description||'').toLowerCase().includes(q)) : true;
    const matchC = cat === 'All' ? true : (t.category === cat);
    return matchQ && matchC;
  });

  txTableBody.innerHTML='';
  for(const t of filtered){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(t.date).toLocaleDateString()}</td>
      <td contenteditable="true" data-edit="desc">${t.description||''}</td>
      <td class="tar" contenteditable="true" data-edit="amount">${t.amount}</td>
      <td>
        <select data-edit="category">
          ${CATEGORIES.map(c=>`<option value="${c}" ${t.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </td>
      <td>${(accounts.find(a=>a.id===t.accountId)||{}).name||'—'}</td>
      <td class="tar"><button class="btn secondary" data-del="${t.id}">Delete</button></td>
    `;
    txTableBody.appendChild(tr);

    // edit handlers
    tr.querySelector('[data-edit="desc"]').addEventListener('blur', e=>{
      t.description = e.target.textContent.trim();
      save('mt_transactions', transactions);
    });
    tr.querySelector('[data-edit="amount"]').addEventListener('blur', e=>{
      t.amount = parseAmount(e.target.textContent);
      save('mt_transactions', transactions);
      renderSummary();
      renderAccounts();
    });
    tr.querySelector('[data-edit="category"]').addEventListener('change', e=>{
      t.category = e.target.value;
      save('mt_transactions', transactions);
    });
    tr.querySelector('[data-del]').addEventListener('click', ()=>{
      transactions = transactions.filter(x=>x.id!==t.id);
      renderAll();
    });
  }
}

function detectSubscriptions(transactions){
  const groups = new Map();
  for(const t of transactions){
    if(t.amount >= 0) continue;
    const key = String(t.description||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const arr = groups.get(key) || [];
    arr.push(t); groups.set(key, arr);
  }
  const results = [];
  for(const [merchant, arr] of groups){
    if(arr.length < 3) continue;
    const sorted = arr.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
    const gaps = [];
    for(let i=0;i<Math.min(4, sorted.length-1);i++){
      const g = Math.abs(new Date(sorted[i].date) - new Date(sorted[i+1].date)) / (1000*60*60*24);
      gaps.push(g);
    }
    const monthlyLike = gaps.length>=2 && gaps.every(g=>g>=25 && g<=35);
    if(!monthlyLike) continue;
    const last = sorted[0];
    const avgAmount = sorted.reduce((s,t)=>s+Math.abs(t.amount),0)/sorted.length;
    const nextDate = new Date(new Date(last.date).getTime() + 30*24*60*60*1000);
    results.push({ id: uid(), merchant, average: Number(avgAmount.toFixed(2)), lastDate: new Date(last.date), nextDate, count: sorted.length });
  }
  return results.sort((a,b)=> a.nextDate - b.nextDate);
}

function renderSubscriptions(){
  const subs = detectSubscriptions(transactions);
  const upcoming = subs.filter(s => s.nextDate >= new Date()).slice(0,20);

  subsBody.innerHTML='';
  for(const s of subs){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${titleCase(s.merchant)}</td>
      <td class="tar">-${fmt(Math.abs(s.average)).replace('$','')}</td>
      <td>${s.lastDate.toLocaleDateString()}</td>
      <td>${s.nextDate.toLocaleDateString()}</td>
      <td class="tar">${s.count}</td>`;
    subsBody.appendChild(tr);
  }
  if(!subs.length){
    const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="5" style="color:#9aa7c7;padding:8px">No subscriptions detected yet. Import a few months of CSV first.</td>`; subsBody.appendChild(tr);
  }

  upcomingBody.innerHTML='';
  for(const u of upcoming){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${titleCase(u.merchant)}</td>
      <td>${u.nextDate.toLocaleDateString()}</td>
      <td class="tar">-${fmt(Math.abs(u.average)).replace('$','')}</td>`;
    upcomingBody.appendChild(tr);
  }
  if(!upcoming.length){
    const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="3" style="color:#9aa7c7;padding:8px">Nothing predicted yet.</td>`; upcomingBody.appendChild(tr);
  }
}

function renderAll(){
  renderAccounts();
  renderSummary();
  renderTransactions();
  renderSubscriptions();
}

// --- Events ---
document.addEventListener('DOMContentLoaded', ()=>{
  // fill categories in search select already done; ensure account select has options
  renderAll();

  el('addAcct').addEventListener('click', ()=>{
    const name = (el('acctName').value||'').trim();
    if(!name) return;
    accounts.push({ id: uid(), name, balance: 0 });
    el('acctName').value='';
    renderAll();
  });

  el('autoRecalc').addEventListener('change', (e)=>{
    autoRecalc = !!e.target.checked;
    save('mt_autoRecalc', autoRecalc);
    renderAll();
  });

  el('addTx').addEventListener('click', ()=>{
    const date = new Date(el('txDate').value);
    const description = el('txDesc').value;
    const amount = parseAmount(el('txAmt').value);
    const category = el('txCat').value;
    const accountId = el('txAcct').value || (accounts[0] && accounts[0].id) || null;
    if(!description || !amount) { alert('Enter a description and non-zero amount'); return; }
    transactions.unshift({ id: uid(), date, description, amount, category, accountId });
    el('txDesc').value=''; el('txAmt').value='';
    save('mt_transactions', transactions);
    renderAll();
  });

  el('q').addEventListener('input', renderTransactions);
  el('qCat').addEventListener('change', renderTransactions);

  el('exportBtn').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify({ accounts, transactions }, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tiam-data-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  });

  el('importJson').addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      try{
        const data = JSON.parse(ev.target.result);
        if(Array.isArray(data.accounts)) accounts = data.accounts;
        if(Array.isArray(data.transactions)) transactions = data.transactions.map(t => ({...t, date: new Date(t.date)}));
        renderAll();
      }catch{ alert('Invalid JSON file'); }
    };
    reader.readAsText(file);
    e.target.value='';
  });

  el('importCsv').addEventListener('change', (e)=>{
    const file = e.target.files && e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if(lines.length < 2) { alert('CSV has no data'); return; }
      const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
      const idx = {
        date: headers.indexOf('date'),
        description: headers.indexOf('description'),
        amount: headers.indexOf('amount'),
        account: headers.indexOf('account'),
        category: headers.indexOf('category'),
      };
      if(idx.date===-1 || idx.description===-1 || idx.amount===-1){
        alert('CSV must include headers: date, description, amount'); return;
      }
      const imported = [];
      for(let i=1;i<lines.length;i++){
        const row = safeSplitCSV(lines[i]); if(!row.length) continue;
        const tx = {
          id: uid(),
          date: parseDate(row[idx.date]),
          description: row[idx.description] || '',
          amount: parseAmount(row[idx.amount]),
          accountId: (accounts[0] && accounts[0].id) || null,
          category: row[idx.category] || inferCategory(row[idx.description] || '', parseAmount(row[idx.amount])),
        };
        imported.push(tx);
      }
      transactions = [...imported, ...transactions];
      save('mt_transactions', transactions);
      renderAll();
    };
    reader.readAsText(file);
    e.target.value='';
  });
});
