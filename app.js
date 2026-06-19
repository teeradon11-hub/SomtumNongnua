const SHEET_ID   = '10D-GwPgOJ98JU-rTyzonTYsM8Gg6mTzluqy6Q5nJoCA';
const SHEET_NAME = 'รวม';
const CACHE_KEY  = 'khub_expense_v4';
const CACHE_TTL  = 5 * 60 * 1000;

let DATA            = [];
let currentRange    = 'all';
let currentCategory = 'ทั้งหมด';
let searchKeyword   = '';
let loading = false;

const thMonth = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/* ─── Utilities ─── */
function money(n){
  return '฿' + Number(n).toLocaleString('th-TH',{maximumFractionDigits:0});
}
function parseAmount(v){
  if(!v) return 0;
  return parseFloat(String(v).replace(/,/g,'')) || 0;
}
function parseDate(v){
  if(!v) return null;
  // Google Sheets serial number (days since 1899-12-30)
  if(typeof v === 'number' || /^\d{4,6}$/.test(String(v).trim())){
    const serial = parseInt(v);
    const utc = new Date(Date.UTC(1899,11,30) + serial * 86400000);
    return isNaN(utc) ? null : utc;
  }
  // DD/MM/YYYY
  const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return new Date(+m[3], +m[2]-1, +m[1]);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function escapeHtml(str=''){
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}
function formatDateTH(date){
  if(!date) return '';
  return `${date.getDate()} ${thMonth[date.getMonth()]}`;
}
function daysInMonth(year, month){
  return new Date(year, month+1, 0).getDate();
}

/* ─── Cache ─── */
function saveCache(data){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify({ts: Date.now(), data})); }catch(e){}
}
function loadCache(){
  try{
    const c = JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if(c && Date.now()-c.ts < CACHE_TTL) return c.data;
  }catch(e){}
  return null;
}

/* ─── Fetch ─── */
async function fetchSheet(){
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
  const res  = await fetch(url);
  const text = await res.text();
  const json = JSON.parse(text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)/)[1]);
  const cols = json.table.cols.map(c => c.label);
  return json.table.rows.map(r => {
    const obj = {};
    r.c.forEach((cell,i) => { obj[cols[i]] = cell ? cell.v : null; });
    return obj;
  });
}
function processRows(rows){
  return rows.map(r => ({
    date:     parseDate(r['วันที่'] ?? r['date'] ?? r['Date']),
    category: String(r['หมวดหมู่'] ?? r['category'] ?? r['Category'] ?? '-'),
    detail:   String(r['รายการ']   ?? r['detail']   ?? r['Detail']   ?? ''),
    shop:     String(r['ร้านค้า']  ?? r['shop']     ?? r['Shop']     ?? ''),
    amount:   parseAmount(r['จำนวนเงิน'] ?? r['amount'] ?? r['Amount'] ?? 0),
  })).filter(r => r.amount > 0);
}

/* ─── Core: unified filtered set ─── */
function getFilteredData(){
  const now = new Date();
  let arr = [...DATA];

  // 1. Category
  if(currentCategory !== 'ทั้งหมด'){
    arr = arr.filter(x => x.category === currentCategory);
  }

  // 2. Range
  if(currentRange === 'today'){
    arr = arr.filter(x => x.date && x.date.toDateString() === now.toDateString());
  } else if(currentRange === '7days'){
    const d = new Date(); d.setDate(d.getDate()-7);
    arr = arr.filter(x => x.date && x.date >= d);
  } else if(currentRange === 'month'){
    arr = arr.filter(x => x.date && x.date.getMonth()===now.getMonth() && x.date.getFullYear()===now.getFullYear());
  } else if(currentRange === 'year'){
    arr = arr.filter(x => x.date && x.date.getFullYear()===now.getFullYear());
  }

  // 3. Search
  if(searchKeyword){
    const kw = searchKeyword.toLowerCase();
    arr = arr.filter(x =>
      (x.detail||'').toLowerCase().includes(kw) ||
      (x.shop||'').toLowerCase().includes(kw) ||
      (x.category||'').toLowerCase().includes(kw)
    );
  }

  return arr;
}

/* ─── Renders ─── */
function renderSummary(){
  const now   = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const thisMonthAll = DATA.filter(x => x.date && x.date.getMonth()===month && x.date.getFullYear()===year);
  const lastMonthAll = DATA.filter(x => {
    if(!x.date) return false;
    return month===0
      ? (x.date.getMonth()===11 && x.date.getFullYear()===year-1)
      : (x.date.getMonth()===month-1 && x.date.getFullYear()===year);
  });
  const yearAll   = DATA.filter(x => x.date && x.date.getFullYear()===year);
  const todayAll  = DATA.filter(x => x.date && x.date.toDateString()===now.toDateString());
  const week7All  = DATA.filter(x => { const d=new Date(); d.setDate(d.getDate()-7); return x.date && x.date>=d; });

  const totalMonth = thisMonthAll.reduce((s,x)=>s+x.amount,0);
  const totalLast  = lastMonthAll.reduce((s,x)=>s+x.amount,0);
  const totalYear  = yearAll.reduce((s,x)=>s+x.amount,0);
  const totalToday = todayAll.reduce((s,x)=>s+x.amount,0);
  const total7     = week7All.reduce((s,x)=>s+x.amount,0);

  const daysPassed = now.getDate();
  const avgDay     = daysPassed > 0 ? totalMonth/daysPassed : 0;
  const shops      = new Set(DATA.map(x=>x.shop).filter(Boolean));

  // Hero
  document.getElementById('monthTotal').innerText = money(totalMonth);
  document.getElementById('heroBillCount').innerText = `${thisMonthAll.length} บิล`;
  document.getElementById('heroAvg').innerText = `เฉลี่ย ${money(thisMonthAll.length ? totalMonth/thisMonthAll.length : 0)}/บิล`;

  const diff = totalMonth - totalLast;
  const pct  = totalLast > 0 ? Math.abs(diff/totalLast*100).toFixed(1) : null;
  document.getElementById('compareText').innerText = diff >= 0
    ? `▲ เพิ่มขึ้น ${money(diff)}`
    : `▼ ลดลง ${money(Math.abs(diff))}`;
  document.getElementById('heroPct').innerText = pct
    ? `${diff>=0?'+':'−'}${pct}% จากเดือนก่อน`
    : 'ยังไม่มีข้อมูลเดือนก่อน';

  // KPIs
  document.getElementById('lastMonth').innerText  = money(totalLast);
  document.getElementById('yearTotal').innerText  = money(totalYear);
  document.getElementById('todayTotal').innerText = money(totalToday);
  document.getElementById('week7Total').innerText = money(total7);
  document.getElementById('avgDay').innerText     = money(avgDay);
  document.getElementById('shopCount').innerText  = shops.size;
}

function renderInsight(){
  const box  = document.getElementById('insightCard');
  const now  = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();

  const monthData = DATA.filter(x => x.date && x.date.getMonth()===month && x.date.getFullYear()===year);
  const lastMonthData = DATA.filter(x => {
    if(!x.date) return false;
    return month===0
      ? (x.date.getMonth()===11 && x.date.getFullYear()===year-1)
      : (x.date.getMonth()===month-1 && x.date.getFullYear()===year);
  });

  const total     = monthData.reduce((s,x)=>s+x.amount,0);
  const totalLast = lastMonthData.reduce((s,x)=>s+x.amount,0);
  const pctChange = totalLast > 0 ? ((total-totalLast)/totalLast*100).toFixed(1) : null;

  const cat = {};
  monthData.forEach(x => { cat[x.category] = (cat[x.category]||0)+x.amount; });
  const topCat = Object.entries(cat).sort((a,b)=>b[1]-a[1])[0];

  const shops = {};
  monthData.forEach(x => { if(x.shop) shops[x.shop] = (shops[x.shop]||0)+1; });
  const topShop = Object.entries(shops).sort((a,b)=>b[1]-a[1])[0];

  const daysPassed  = now.getDate();
  const totalDays   = daysInMonth(year, month);
  const avgDay      = daysPassed>0 ? total/daysPassed : 0;
  const projected   = avgDay * totalDays;

  box.innerHTML = `
  <div class="card">
    <div class="section">⚠️ สิ่งที่ควรดู</div>
    <div class="insightGrid">
      <div class="insightItem">
        <div class="insightLabel">📈 เทียบเดือนก่อน</div>
        <div class="insightValue">${pctChange !== null ? (pctChange>=0?'+':'')+pctChange+'%' : '-'}</div>
        <div class="insightSub">${pctChange!==null?(pctChange>=0?'เพิ่มขึ้น':'ลดลง'):'ยังไม่มีข้อมูล'}</div>
      </div>
      <div class="insightItem">
        <div class="insightLabel">🏆 หมวดใช้มากสุด</div>
        <div class="insightValue" style="font-size:16px">${topCat?topCat[0]:'-'}</div>
        <div class="insightSub">${topCat?money(topCat[1]):''}</div>
      </div>
      <div class="insightItem">
        <div class="insightLabel">🏪 ร้านซื้อบ่อยสุด</div>
        <div class="insightValue" style="font-size:16px">${topShop?topShop[0]:'-'}</div>
        <div class="insightSub">${topShop?topShop[1]+' ครั้ง':''}</div>
      </div>
      <div class="insightItem">
        <div class="insightLabel">📊 เฉลี่ย/วัน</div>
        <div class="insightValue">${money(avgDay)}</div>
        <div class="insightSub">ผ่านมา ${daysPassed} วัน</div>
      </div>
      <div class="insightItem" style="grid-column:1/-1">
        <div class="insightLabel">🔮 คาดการณ์สิ้นเดือน</div>
        <div class="insightValue">${money(projected)}</div>
        <div class="insightSub">จาก ${daysPassed}/${totalDays} วัน × ${money(avgDay)}/วัน</div>
      </div>
    </div>
  </div>`;
}

function renderTopCategory(){
  const box  = document.getElementById('topCategory');
  const data = getFilteredData();
  const cat  = {};
  data.forEach(x => { cat[x.category] = (cat[x.category]||0)+x.amount; });
  const arr  = Object.entries(cat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max  = arr[0]?.[1]||1;
  const total = arr.reduce((s,x)=>s+x[1],0)||1;

  if(!arr.length){
    box.innerHTML = `<div class="card"><div class="section">🔥 Top 5 หมวดค่าใช้จ่าย</div>${emptyState()}</div>`;
    return;
  }

  box.innerHTML = `
  <div class="card">
    <div class="section">🔥 Top 5 หมวดค่าใช้จ่าย</div>
    ${arr.map(x=>`
    <div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;align-items:center">
        <div>${escapeHtml(x[0])}</div>
        <div style="text-align:right">
          <span style="font-weight:700">${money(x[1])}</span>
          <span class="pct"> ${(x[1]/total*100).toFixed(1)}%</span>
        </div>
      </div>
      <div class="progress"><div class="fill" style="width:${x[1]/max*100}%"></div></div>
    </div>`).join('')}
  </div>`;
}

function renderTopShop(){
  const box  = document.getElementById('topShop');
  const data = getFilteredData();
  const shops = {};
  data.forEach(x => {
    if(!x.shop||x.shop==='-'||x.shop==='undefined') return;
    if(!shops[x.shop]) shops[x.shop] = {amount:0, count:0};
    shops[x.shop].amount += x.amount;
    shops[x.shop].count  += 1;
  });
  const arr = Object.entries(shops).sort((a,b)=>b[1].amount-a[1].amount).slice(0,5);

  if(!arr.length){
    box.innerHTML = `<div class="card"><div class="section">🏪 Top 5 ร้านค้า</div>${emptyState()}</div>`;
    return;
  }

  box.innerHTML = `
  <div class="card">
    <div class="section">🏪 Top 5 ร้านค้า</div>
    ${arr.map(([name,v])=>`
    <div class="shopItem">
      <div>
        <div class="shopName">${escapeHtml(name)}</div>
        <div class="shopCount">${v.count} ครั้ง</div>
      </div>
      <div class="shopAmount">${money(v.amount)}</div>
    </div>`).join('')}
  </div>`;
}

function renderMonthlyChart(){
  const box  = document.getElementById('monthlyChart');
  const now  = new Date();
  const year = now.getFullYear();

  // Respect category & search filters, but always show full year range
  let base = [...DATA];
  if(currentCategory !== 'ทั้งหมด') base = base.filter(x=>x.category===currentCategory);
  if(searchKeyword){
    const kw = searchKeyword.toLowerCase();
    base = base.filter(x=>(x.detail||'').toLowerCase().includes(kw)||(x.shop||'').toLowerCase().includes(kw));
  }

  const months = Array(12).fill(0);
  base.forEach(x => {
    if(x.date && x.date.getFullYear()===year) months[x.date.getMonth()] += x.amount;
  });
  const max = Math.max(...months, 1);

  box.innerHTML = `
  <div class="card">
    <div class="section">📈 รายจ่ายรายเดือน (${year})</div>
    ${months.map((v,i)=>`
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <div style="font-weight:${i===now.getMonth()?'700':'400'};color:${i===now.getMonth()?'#16A34A':'inherit'}">${thMonth[i]}${i===now.getMonth()?' ◀':''}</div>
        <div>${money(v)}</div>
      </div>
      <div class="progress"><div class="fill" style="width:${v/max*100}%"></div></div>
    </div>`).join('')}
  </div>`;
}

function emptyState(msg='📭 ไม่พบรายการ'){
  return `<div class="emptyState"><div class="emptyIcon">${msg.slice(0,2)}</div>${msg.slice(2)||msg}</div>`;
}

function renderRecent(){
  const box    = document.getElementById('recentList');
  const data   = getFilteredData();
  const recent = [...data].sort((a,b)=>(b.date||0)-(a.date||0)).slice(0,20);
  const title  = searchKeyword ? '🔍 ผลการค้นหา' : '🕒 รายการล่าสุด';

  if(!recent.length){
    box.innerHTML = `<div class="card"><div class="section">${title}</div>${emptyState()}</div>`;
    return;
  }

  box.innerHTML = `
  <div class="card">
    <div class="section">${title} <span class="badge">${data.length}</span></div>
    ${recent.map(x=>`
    <div class="recentItem">
      <div>
        <div class="recentDate">${formatDateTH(x.date)}</div>
        <div class="recentTitle">${escapeHtml(x.detail||x.shop||'-')}</div>
        <div class="recentSub">${escapeHtml([x.shop, x.category].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="recentAmount">${money(x.amount)}</div>
    </div>`).join('')}
  </div>`;
}

function renderCategoryChip(){
  const box  = document.getElementById('categoryChip');
  const cats = ['ทั้งหมด', ...new Set(DATA.map(x=>x.category))];
  box.innerHTML = cats.map(c=>`
    <div class="chip${c===currentCategory?' active':''}" onclick="selectCategory('${c}')">${c}</div>
  `).join('');
}

function renderAll(){
  renderSummary();
  renderInsight();
  renderTopCategory();
  renderTopShop();
  renderMonthlyChart();
  renderCategoryChip();
  renderRecent();
}

/* ─── Event handlers ─── */
function selectCategory(cat){
  currentCategory = cat;
  renderCategoryChip();
  renderTopCategory();
  renderTopShop();
  renderMonthlyChart();
  renderRecent();
}

function selectRange(range){
  currentRange = range;
  document.querySelectorAll('[data-range]').forEach(x=>{
    x.classList.toggle('active', x.dataset.range===range);
  });
  renderTopCategory();
  renderTopShop();
  renderRecent();
}

document.querySelectorAll('[data-range]').forEach(el=>{
  el.addEventListener('click', () => selectRange(el.dataset.range));
});

document.getElementById('searchBox').addEventListener('input', e=>{
  searchKeyword = e.target.value.trim();
  renderTopCategory();
  renderTopShop();
  renderRecent();
});

/* ─── Loading UI ─── */
function showLoading(){
  ['insightCard','topCategory','topShop','monthlyChart','recentList'].forEach(id=>{
    document.getElementById(id).innerHTML =
      `<div class="card"><div class="skeleton"></div><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:50%"></div></div>`;
  });
}

function updateLastUpdate(){
  const now = new Date();
  document.getElementById('lastUpdate').innerText =
    `อัปเดต ${now.getDate()} ${thMonth[now.getMonth()]} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

/* ─── Main loader ─── */
async function loadData(forceRefresh=false){
  if(loading) return;
  loading = true;
  try{
    if(!forceRefresh){
      const cache = loadCache();
      if(cache){
        DATA = cache.map(r=>({...r, date: r.date ? new Date(r.date) : null}));
        renderAll();
      }
    }
    showLoading();
    const rows = await fetchSheet();
    DATA = processRows(rows);
    saveCache(DATA.map(r=>({...r, date: r.date ? r.date.toISOString() : null})));
    updateLastUpdate();
    renderAll();
  } catch(err){
    console.error(err);
    document.getElementById('recentList').innerHTML =
      `<div class="card"><div class="emptyState"><div class="emptyIcon">⚠️</div>ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่</div></div>`;
  } finally {
    loading = false;
  }
}

loadData();
setInterval(loadData, 5*60*1000);