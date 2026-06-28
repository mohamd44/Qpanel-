/* ============================================================
   Qpanell — محسّن قص ألواح الأخشاب (2D Guillotine)
   كل الأبعاد بالسنتيمتر — الأسعار بالدولار $
   ============================================================ */

const $ = (s) => document.querySelector(s);
const palette = ['#dbe7f5','#fde9d2','#d8f0e0','#f5d8e6','#e7dcf5','#fdf0c8',
                 '#d2eef5','#f5dcd2','#e2f5d2','#f0d2f0','#d2d8f5','#f5f0d2'];

/* ---------------- الحالة (State) ---------------- */
let bandTypes = [
  { id: 'b1', name: 'PVC 0.4 مم', price: 0.30 },
  { id: 'b2', name: 'PVC 2 مم',   price: 0.80 },
  { id: 'b0', name: 'بدون تلبيس', price: 0.00 },
];
let pieces = [];
let showExtra = false;
function applyExtraToggleUI(){
  const btn=document.getElementById('toggleExtra'); if(!btn) return;
  btn.classList.toggle('on', showExtra);
  btn.textContent = showExtra ? '⚙ إخفاء الخيارات الإضافية' : '⚙ خيارات إضافية';
}
let sheetTypes = [ { id:'s1', name:'لوح', l:null, w:null, qty:null, price:null } ];
let activeSheetId = 's1';
let layout = null;
let settings = null;
let uid = 100;
const nid = () => 'x' + (++uid);

/* ---------------- أدوات مساعدة ---------------- */
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(t._tm); t._tm=setTimeout(()=>t.classList.add('hidden'),2600); }
function bandById(id){ return bandTypes.find(b=>b.id===id) || {name:'-',price:0}; }

/* ---------------- مؤشر تقدم إنشاء الـ PDF ---------------- */
function showProgress(pct, label){
  const ov=$('#progressOverlay'); if(!ov) return;
  ov.classList.remove('hidden');
  const p=$('#progressPct'); if(p) p.textContent=Math.round(pct)+'%';
  const l=$('#progressLabel'); if(l && label) l.textContent=label;
}
function hideProgress(){ const ov=$('#progressOverlay'); if(ov) ov.classList.add('hidden'); }
const _sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

/* ---------------- تحميل مكتبات الـ PDF عند الحاجة فقط ---------------- */
let _pdfLibsP=null;
function _loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('فشل تحميل '+src)); document.head.appendChild(s); }); }
async function _loadWithFallback(localSrc, cdnSrc){
  try{ await _loadScript(localSrc); }
  catch(_){ await _loadScript(cdnSrc); }
}
async function ensurePdfLibs(){
  if(window.jspdf&&window.html2canvas) return;
  if(!_pdfLibsP){
    _pdfLibsP=(async()=>{
      await _loadWithFallback('jspdf.umd.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await _loadWithFallback('html2canvas.min.js','https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    })();
  }
  await _pdfLibsP;
}

/* ---------------- حفظ آخر مشروع تلقائياً (محلي) ---------------- */
const LS_KEY='iqpanel_project_v2';
function _readInputs(){ return {
  planName:($('#planName')&&$('#planName').value)||'',
  kerf:($('#kerf')&&$('#kerf').value)||'',
  cutFee:($('#cutFee')&&$('#cutFee').value)||'',
  cutDir:($('#cutDir')&&$('#cutDir').value)||'length',
  allowRotate: false
}; }
function saveState(){ try{ localStorage.setItem(LS_KEY, JSON.stringify({pieces,sheetTypes,bandTypes,activeSheetId,showExtra,layout,settings,uid,inputs:_readInputs()})); }catch(_){} }
let _saveT=null; function scheduleSave(){ clearTimeout(_saveT); _saveT=setTimeout(saveState,400); }
function loadState(){ try{ const raw=localStorage.getItem(LS_KEY); if(!raw) return null; const d=JSON.parse(raw);
  if(Array.isArray(d.pieces)) pieces=d.pieces;
  if(Array.isArray(d.sheetTypes)&&d.sheetTypes.length) sheetTypes=d.sheetTypes;
  if(Array.isArray(d.bandTypes)&&d.bandTypes.length) bandTypes=d.bandTypes;
  if(d.activeSheetId) activeSheetId=d.activeSheetId;
  showExtra=!!d.showExtra; layout=d.layout||null; settings=d.settings||null;
  if(typeof d.uid==='number') uid=Math.max(uid,d.uid);
  return d.inputs||{};
}catch(_){ return null; } }

/* ---------------- جداول الإدخال ---------------- */
function renderBandTable(){
  const tb = $('#bandTable tbody'); tb.innerHTML='';
  bandTypes.forEach(b=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td><input value="${b.name}" data-id="${b.id}" data-f="name"></td>
      <td><input type="number" step="0.01" min="0" value="${b.price}" data-id="${b.id}" data-f="price"></td>
      <td><button class="btn btn-danger" data-del="${b.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',e=>{
    const b=bandTypes.find(x=>x.id===e.target.dataset.id); const f=e.target.dataset.f;
    b[f] = f==='price' ? (parseFloat(e.target.value)||0) : e.target.value;
    scheduleSave();
  }));
  tb.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',e=>{
    bandTypes=bandTypes.filter(x=>x.id!==e.target.dataset.del); renderBandTable(); renderPieceTable();
    scheduleSave();
  }));
}

function renderSheetTable(){
  const tb=$('#sheetTable tbody'); if(!tb) return; tb.innerHTML='';
  const val=v=>v==null?'':v;
  sheetTypes.forEach(s=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><input value="${val(s.name)}" data-id="${s.id}" data-f="name" style="min-width:54px"></td>
      <td><input type="number" min="1" value="${val(s.l)}" data-id="${s.id}" data-f="l"></td>
      <td><input type="number" min="1" value="${val(s.w)}" data-id="${s.id}" data-f="w"></td>
      <td><input type="number" min="1" value="${val(s.qty)}" data-id="${s.id}" data-f="qty"></td>
      <td><input type="number" min="0" step="0.01" value="${val(s.price)}" data-id="${s.id}" data-f="price"></td>
      <td style="text-align:center"><input type="radio" name="activeSheet" ${s.id===activeSheetId?'checked':''} data-active="${s.id}"></td>
      <td><button class="btn btn-danger" data-del="${s.id}">\u2715</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input[data-f]').forEach(inp=>inp.addEventListener('input',e=>{
    const s=sheetTypes.find(x=>x.id===e.target.dataset.id); const f=e.target.dataset.f;
    s[f]=['l','w','qty','price'].includes(f)?(e.target.value===''?null:parseFloat(e.target.value)):e.target.value;
    scheduleSave();
  }));
  tb.querySelectorAll('[data-active]').forEach(r=>r.addEventListener('change',e=>{ activeSheetId=e.target.dataset.active; scheduleSave(); }));
  tb.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',e=>{
    if(sheetTypes.length<=1){ toast('يجب إبقاء نوع لوح واحد على الأقل'); return; }
    const id=e.target.dataset.del;
    sheetTypes=sheetTypes.filter(x=>x.id!==id);
    if(activeSheetId===id) activeSheetId=sheetTypes[0].id;
    renderSheetTable();
    scheduleSave();
  }));
}

function renderPieceTable(){
  const tb=$('#pieceTable tbody'); tb.innerHTML='';
  const val=v=>v==null?'':v;
  pieces.forEach(p=>{
    const opts=bandTypes.map(b=>`<option value="${b.id}" ${b.id===p.bandId?'selected':''}>${b.name}</option>`).join('');
    const eb=(k,sym)=>`<button class="edge-btn ${p.edges[k]?'on':''}" data-id="${p.id}" data-e="${k}" title="${k}">${sym}</button>`;

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><input type="number" min="1" value="${val(p.l)}" data-id="${p.id}" data-f="l"></td>
      <td><input type="number" min="1" value="${val(p.w)}" data-id="${p.id}" data-f="w"></td>
      <td><input type="number" min="1" value="${val(p.qty)}" data-id="${p.id}" data-f="qty"></td>
      <td><button class="btn btn-danger" data-del="${p.id}">✕</button></td>`;
    tb.appendChild(tr);

    if(showExtra){
      const tro=document.createElement('tr');
      tro.className='opt-row';
      tro.dataset.optrow=p.id;
      tro.innerHTML=`
        <td colspan="4">
          <div class="opt-grid">
            <label class="opt-field">اسم القطعة
              <input value="${val(p.name)}" data-id="${p.id}" data-f="name" placeholder="اختياري">
            </label>
            <label class="opt-field">نوع الحرف
              <select data-id="${p.id}" data-f="bandId">${opts}</select>
            </label>
            <div class="opt-field">مكان التلبيس (الأطراف)
              <div class="edge-toggles">${eb('t','↑')}${eb('b','↓')}${eb('l','←')}${eb('r','→')}</div>
            </div>
          </div>
        </td>`;
      tb.appendChild(tro);
    }
  });

  tb.querySelectorAll('input,select').forEach(inp=>inp.addEventListener('input',e=>{
    const p=pieces.find(x=>x.id===e.target.dataset.id); const f=e.target.dataset.f;
    p[f]=['l','w','qty'].includes(f)?(e.target.value===''?null:parseFloat(e.target.value)):e.target.value;
    scheduleSave();
  }));
  tb.querySelectorAll('.edge-btn').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const p=pieces.find(x=>x.id===btn.dataset.id); const k=btn.dataset.e;
      if(!p) return; p.edges[k]=!p.edges[k]; btn.classList.toggle('on',p.edges[k]);
      scheduleSave();
    });
  });
  tb.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('mousedown',e=>e.preventDefault());
    btn.addEventListener('click',e=>{
      const delId=e.currentTarget.dataset.del;
      const idx=pieces.findIndex(x=>x.id===delId);
      pieces=pieces.filter(x=>x.id!==delId); renderPieceTable();
      scheduleSave();
      if(pieces.length){
        const ni=Math.min(idx, pieces.length-1);
        const inp=document.querySelector(`#pieceTable tbody input[data-id="${pieces[ni].id}"][data-f="l"]`);
        if(inp) inp.focus();
      }
    });
  });
}

/* ---------------- خوارزمية الـ Guillotine ---------------- */
function optimize(){
  const at=sheetTypes.find(s=>s.id===activeSheetId)||sheetTypes[0];
  const L=+at.l, W=+at.w, qty=+at.qty||0;
  const kerf=+$('#kerf').value||0, cutDir=$('#cutDir').value, allowRotate=false;
  const cutFee=+$('#cutFee').value||0, planName=$('#planName').value.trim();
  if(!(L>0&&W>0)){ toast('أدخل أبعاد لوح صحيحة في جدول الأنواع'); return; }
  settings={L,W,qty,kerf,cutDir,allowRotate,colorize:false,sheetPrice:+at.price||0,sheetName:(at.name||'لوح'),cutFee,planName};

  const items=[];
  pieces.forEach(p=>{ for(let i=0;i<(p.qty||0);i++) items.push({...p, _l:p.l, _w:p.w}); });
  if(!items.length){ toast('أضف قطعاً أولاً'); return; }
  items.sort((a,b)=> (b._l*b._w)-(a._l*a._w) || Math.max(b._l,b._w)-Math.max(a._l,a._w));

  const sheets=[]; const unplaced=[];
  const fits=(fr,pl,pw)=> pl<=fr.w+1e-6 && pw<=fr.h+1e-6;

  function tryPlace(s,it){
    let best=null,score=Infinity;
    for(const fr of s.free){
      if(fits(fr,it._l,it._w)){ const sc=Math.min(fr.w-it._l,fr.h-it._w); if(sc<score){score=sc;best=fr;} }
    }
    if(!best) return false;
    const pl=it._l, pw=it._w;
    s.placed.push({ x:best.x, y:best.y, l:pl, w:pw, rot:false, src:it, origL:it._l, origW:it._w });
    const rightW=best.w-pl-kerf, bottomH=best.h-pw-kerf;
    if(rightW>0.05) s.cuts++; if(bottomH>0.05) s.cuts++;
    s.free=s.free.filter(f=>f!==best);
    let r1,r2;
    if(cutDir==='length'){
      r1={x:best.x+pl+kerf, y:best.y, w:rightW, h:best.h};
      r2={x:best.x, y:best.y+pw+kerf, w:pl, h:bottomH};
    } else if(cutDir==='cross'){
      r1={x:best.x, y:best.y+pw+kerf, w:best.w, h:bottomH};
      r2={x:best.x+pl+kerf, y:best.y, w:rightW, h:pw};
    } else {
      r1={x:best.x+pl+kerf, y:best.y, w:rightW, h:best.h};
      r2={x:best.x, y:best.y+pw+kerf, w:pl, h:bottomH};
    }
    if(r1.w>0.05&&r1.h>0.05) s.free.push(r1);
    if(r2.w>0.05&&r2.h>0.05) s.free.push(r2);
    return true;
  }

  for(const it of items){
    let done=false;
    for(const s of sheets){ if(tryPlace(s,it)){done=true;break;} }
    if(!done){
      const s={free:[{x:0,y:0,w:L,h:W}],placed:[],cuts:0};
      if(tryPlace(s,it)){ sheets.push(s); done=true; }
    }
    if(!done) unplaced.push(it);
  }

  layout = sheets.map(s=>({
    cuts:s.cuts,
    pieces:s.placed.map(p=>({
      id:nid(), x:p.x, y:p.y, l:p.l, w:p.w, rot:p.rot,
      name:p.src.name, bandId:p.src.bandId, edges:{...p.src.edges},
      origL:p.origL, origW:p.origW
    }))
  }));

  if(unplaced.length) toast(`⚠️ ${unplaced.length} قطعة أكبر من اللوح ولم تُوضع`);
  else if(sheets.length>qty) toast(`⚠️ تحتاج ${sheets.length} لوحاً وهو أكثر من المتاح (${qty})`);
  else toast(`✓ تم: ${sheets.length} لوح، ${items.length} قطعة`);

  renderResults();
  saveState();
}

/* ---------------- حساب الإحصائيات ---------------- */
function pieceBanding(p){
  let cm=0;
  if(p.edges.t) cm+=p.origL; if(p.edges.b) cm+=p.origL;
  if(p.edges.l) cm+=p.origW; if(p.edges.r) cm+=p.origW;
  const m=cm/100; return { m, cost:m*bandById(p.bandId).price };
}

/* ---------------- رسم النتائج ---------------- */
const fmtNum=n=>Number.isInteger(n)?n:Math.round(n*10)/10;

function displayEdges(p){
  const e=p.edges;
  if(!p.rot) return {t:e.t,b:e.b,l:e.l,r:e.r};
  return { t:e.l, b:e.r, l:e.b, r:e.t };
}

function recomputeWaste(sheet){
  const L=settings.L, W=settings.W;
  const xsSet=new Set([0,L]), ysSet=new Set([0,W]);
  sheet.pieces.forEach(p=>{ xsSet.add(p.x); xsSet.add(p.x+p.l); ysSet.add(p.y); ysSet.add(p.y+p.w); });
  const xs=[...xsSet].sort((a,b)=>a-b), ys=[...ysSet].sort((a,b)=>a-b);
  const nC=xs.length-1, nR=ys.length-1;
  if(nC<1||nR<1) return [];
  const occ=[], usedC=[];
  for(let r=0;r<nR;r++){ occ[r]=[]; usedC[r]=new Array(nC).fill(false);
    for(let c=0;c<nC;c++){
      const cx=(xs[c]+xs[c+1])/2, cy=(ys[r]+ys[r+1])/2;
      occ[r][c]=sheet.pieces.some(p=>cx>=p.x&&cx<=p.x+p.l&&cy>=p.y&&cy<=p.y+p.w);
    }
  }
  const rects=[];
  for(let r=0;r<nR;r++) for(let c=0;c<nC;c++){
    if(occ[r][c]||usedC[r][c]) continue;
    let c2=c; while(c2+1<nC && !occ[r][c2+1] && !usedC[r][c2+1]) c2++;
    let r2=r, ok=true;
    while(r2+1<nR && ok){ for(let cc=c;cc<=c2;cc++){ if(occ[r2+1][cc]||usedC[r2+1][cc]){ok=false;break;} } if(ok) r2++; }
    for(let rr=r;rr<=r2;rr++) for(let cc=c;cc<=c2;cc++) usedC[rr][cc]=true;
    const x=xs[c], y=ys[r], w=xs[c2+1]-xs[c], h=ys[r2+1]-ys[r];
    if(w>2.5&&h>2.5) rects.push({x:Math.round(x*10)/10,y:Math.round(y*10)/10,w:Math.round(w*10)/10,h:Math.round(h*10)/10});
  }
  return rects;
}

function buildSheetCanvas(sheet, idx, colorMap, interactive, count){
  count=count||1;
  const st = { count: sheet.pieces.length, cuts: sheet.cuts || 0, util: 100, waste: 0, meters: 0 };
  const block=document.createElement('div'); block.className='sheet-block';
  block.innerHTML=`
    <div class="sheet-head">
      <h3>${count>1?`ألواح متطابقة <span class="sheet-mult">×${count}</span>`:`اللوح ${idx+1}`} <span class="dim-note">${settings.sheetName} • ${settings.L}×${settings.W} سم</span></h3>
      <div class="sheet-meta">
        <span>القطع: <b>${st.count}</b></span>
        <span>القصّات: <b>${st.cuts}</b></span>
      </div>
    </div>
    <div class="stage">
      ${count>1?`<div class="mult-badge" title="عدد الألواح المتطابقة">*${count}</div>`:''}
      <div class="canvas-wrap"><div class="sheet-canvas" data-sheet="${idx}"></div></div>
      <div class="ruler-y"><span>${fmtNum(settings.W)}</span></div>
      <div class="ruler-x"><span>${fmtNum(settings.L)}</span></div>
    </div>`;
  const canvas=block.querySelector('.sheet-canvas');
  canvas.style.direction='ltr';
  canvas._sheet=sheet; canvas._idx=idx; canvas._colorMap=colorMap; canvas._interactive=interactive;
  return { block, canvas };
}

function positionPieces(canvas, scale){
  const sheet=canvas._sheet;
  canvas.style.height=(settings.W*scale)+'px';
  canvas.innerHTML='';
  recomputeWaste(sheet).forEach(w=>{
    const wd=document.createElement('div'); wd.className='waste';
    wd.style.left=(w.x*scale)+'px'; wd.style.top=(w.y*scale)+'px';
    wd.style.width=(w.w*scale)+'px'; wd.style.height=(w.h*scale)+'px';
    wd.innerHTML=`<span class="wd-h">${fmtNum(w.w)}</span><span class="wd-v">${fmtNum(w.h)}</span>`;
    canvas.appendChild(wd);
  });
  sheet.pieces.forEach((p,pi)=>{
    const el=document.createElement('div'); el.className='piece';
    el.style.left=(p.x*scale)+'px'; el.style.top=(p.y*scale)+'px';
    el.style.width=(p.l*scale)+'px'; el.style.height=(p.w*scale)+'px';
    el.style.background=palette[pi % palette.length];
    el.dataset.sheet=canvas._idx; el.dataset.pi=pi;
    const small=(p.l*scale<44||p.w*scale<26);
    el.innerHTML=`<span class="dim-h">${fmtNum(p.l)}</span>
                  <span class="dim-v">${fmtNum(p.w)}</span>
                  ${small?'':`<span class="pname">${p.name}${p.rot?' ⟳':''}</span>`}`;
    const de=displayEdges(p);
    ['t','b','l','r'].forEach(s=>{ if(de[s]){ const bd=document.createElement('span'); bd.className='band '+s; el.appendChild(bd);} });
    canvas.appendChild(el);
  });
}

let liveCanvases=[];
function renderResults(){
  const area=$('#sheetsArea'); area.innerHTML=''; liveCanvases=[];
  if(!layout||!layout.length){ $('#emptyState').classList.remove('hidden'); return; }
  $('#emptyState').classList.add('hidden');
  const groups = groupSheets ? groupSheets() : [{sheet: layout[0], idx:0, count:1}];
  groups.forEach(g=>{ const {block,canvas}=buildSheetCanvas(g.sheet,g.idx,{},true,g.count); area.appendChild(block); liveCanvases.push(canvas); });
  requestAnimationFrame(()=>liveCanvases.forEach(c=>positionPieces(c, c.clientWidth/settings.L)));
}

function groupSheets(){
  const groups=[]; const map={};
  (layout||[]).forEach((sh,idx)=>{
    const fp = sh.pieces.map(p=>p.x+','+p.y+','+p.l+','+p.w).join('|');
    if(map[fp]!=null){ const g=groups[map[fp]]; g.count++; g.idxs.push(idx); }
    else { map[fp]=groups.length; groups.push({sheet:sh, idx:idx, count:1, idxs:[idx], fp:fp}); }
  });
  return groups;
}

/* ========== Firebase Auth (إجباري) ========== */
let currentUser = null;

function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');
}
function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
}

document.getElementById('authModal')?.addEventListener('click', function(e) {
  if (e.target === this) e.stopPropagation();
});

let activeTab = 'login';
function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.remove('active'));
  const target = document.querySelector(`.auth-tab[data-tab="${tab}"]`);
  if (target) target.classList.add('active');
  const actionBtn = document.getElementById('authActionBtn');
  if (actionBtn) actionBtn.textContent = tab === 'login' ? 'دخول' : 'إنشاء حساب';
  const errEl = document.getElementById('authError');
  if (errEl) errEl.style.display = 'none';
}
document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

async function handleAuthAction() {
  const email = document.getElementById('authEmail')?.value.trim() || '';
  const password = document.getElementById('authPassword')?.value || '';
  const errEl = document.getElementById('authError');

  if (!email || !password) {
    if (errEl) { errEl.textContent = 'الرجاء إدخال البريد وكلمة المرور'; errEl.style.display = 'block'; }
    return;
  }
  if (!email.includes('@') || !email.includes('.')) {
    if (errEl) { errEl.textContent = 'صيغة البريد غير صحيحة'; errEl.style.display = 'block'; }
    return;
  }

  if (activeTab === 'login') {
    try {
      await window.signInWithEmailAndPassword(window.auth, email, password);
      toast('✓ تم تسجيل الدخول');
    } catch (e) {
      if (errEl) { errEl.textContent = 'خطأ: ' + e.message; errEl.style.display = 'block'; }
    }
  } else {
    try {
      const cred = await window.createUserWithEmailAndPassword(window.auth, email, password);
      await window.setDoc(window.doc(window.db, 'users', cred.user.uid), {
        email: email, plan: 'free', createdAt: new Date()
      });
      toast('✓ تم إنشاء الحساب بنجاح');
    } catch (e) {
      if (errEl) {
        errEl.textContent = e.code === 'auth/email-already-in-use' 
          ? 'البريد الإلكتروني مسجل مسبقاً. استخدم تسجيل الدخول.' 
          : 'خطأ: ' + e.message;
        errEl.style.display = 'block';
      }
    }
  }
}
document.getElementById('authActionBtn')?.addEventListener('click', handleAuthAction);

$('#btnLogin')?.addEventListener('click', showAuthModal);
$('#btnLogout')?.addEventListener('click', async () => {
  await window.signOut(window.auth);
  toast('✓ تم تسجيل الخروج');
});

window.onAuthStateChanged(window.auth, (user) => {
  currentUser = user;
  if (user) {
    hideAuthModal();
    if ($('#btnLogin')) $('#btnLogin').style.display = 'none';
    if ($('#btnLogout')) $('#btnLogout').style.display = '';
  } else {
    showAuthModal();
    if ($('#btnLogin')) $('#btnLogin').style.display = 'none';
    if ($('#btnLogout')) $('#btnLogout').style.display = 'none';
  }
});

/* ========== حفظ محلي ========== */
function saveProjectLocally() {
  if (!layout) { toast('قم بالتحسين أولاً'); return; }
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    planName: settings?.planName || '',
    pieces, sheetTypes, bandTypes, activeSheetId, layout, settings
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (settings?.planName || 'مشروع') + '.iqpanel.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ تم تنزيل المشروع محلياً');
}

/* ========== تصدير PDF ========== */
async function doExportPDF(){
  if(!layout||!layout.length){ toast('قم بالتحسين أولاً'); return; }
  showProgress(10,'تحضير...');
  await ensurePdfLibs();
  const { jsPDF }=window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  const pw=210, ph=297, margin=8;
  showProgress(30,'إنشاء الصفحات...');
  // بناء صفحات مخفية للتصدير
  const rep=$('#pdfReport'); rep.innerHTML='';
  layout.forEach((sheet, i)=>{
    const page=document.createElement('div'); page.className='pdf-page rpt';
    page.innerHTML = `<h2 style="text-align:center;color:#b5803c">IQ Panel - اللوح ${i+1}</h2>`;
    const {block}=buildSheetCanvas(sheet,i,{},false,1);
    block.style.cssText='box-shadow:none;border:none;padding:0;background:transparent';
    const _host=block.querySelector('.sheet-canvas');
    _host.style.height='auto'; _host.style.overflow='visible'; _host.innerHTML='';
    const cv = document.createElement('canvas');
    const s=5;
    const Wpx=Math.max(1,Math.round(settings.L*s)), Hpx=Math.max(1,Math.round(settings.W*s));
    cv.width = Wpx+44; cv.height = Hpx+40;
    const ctx = cv.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#000'; ctx.font='20px Cairo';
    ctx.fillText(settings.L+' × '+settings.W, 20, Hpx+30);
    ctx.strokeStyle='#000'; ctx.strokeRect(10,10,Wpx,Hpx);
    sheet.pieces.forEach((p,pi)=>{
      ctx.fillStyle=palette[pi%palette.length];
      ctx.fillRect(p.x*s+10, p.y*s+10, p.l*s, p.w*s);
      ctx.strokeStyle='#000'; ctx.strokeRect(p.x*s+10, p.y*s+10, p.l*s, p.w*s);
    });
    _host.appendChild(cv);
    page.appendChild(block);
    rep.appendChild(page);
  });
  showProgress(70,'توليد PDF...');
  const pagesEls=rep.querySelectorAll('.pdf-page');
  for(let i=0;i<pagesEls.length;i++){
    const cv=await html2canvas(pagesEls[i],{scale:2,backgroundColor:'#ffffff'});
    const img=cv.toDataURL('image/jpeg',0.92);
    const w=pw-margin*2; const h=cv.height*w/cv.width;
    if(i>0) pdf.addPage();
    pdf.addImage(img,'JPEG',margin,8,w,h);
  }
  const fname=(settings?.planName||'مشروع')+'.pdf';
  pdf.save(fname);
  hideProgress();
  rep.innerHTML='';
  toast('✓ تم حفظ PDF');
}

function openPdfOptions(){
  if(!layout||!layout.length){ toast('قم بالتحسين أولاً'); return; }
  $('#pdfOptModal').classList.remove('hidden');
}

/* ========== مشروع جديد ========== */
function resetProject(){
  if(!confirm('بدء مشروع جديد سيحذف كل البيانات الحالية (الاسم، الأنواع، القطع، الإعدادات والمخطط). هل تريد المتابعة؟')) return;
  try{ localStorage.removeItem(LS_KEY); }catch(_){}
  pieces = [];
  sheetTypes = [ { id:'s1', name:'لوح', l:null, w:null, qty:null, price:null } ];
  bandTypes = [
    { id: 'b1', name: 'PVC 0.4 مم', price: 0.30 },
    { id: 'b2', name: 'PVC 2 مم',   price: 0.80 },
    { id: 'b0', name: 'بدون تلبيس', price: 0.00 },
  ];
  activeSheetId = 's1';
  layout = null;
  settings = null;
  showExtra = false;
  applyExtraToggleUI();
  const pn=$('#planName'); if(pn) pn.value='';
  const kf=$('#kerf'); if(kf) kf.value='';
  const cf=$('#cutFee'); if(cf) cf.value='';
  const cd=$('#cutDir'); if(cd) cd.value='length';
  renderSheetTable();
  renderBandTable();
  renderPieceTable();
  renderResults();
  window.scrollTo(0,0);
  toast('✓ تم بدء مشروع جديد');
}

/* ========== ربط جميع الأزرار ========== */
$('#addBand').addEventListener('click', ()=>{
  bandTypes.push({id:nid(), name:'نوع جديد', price:0.5});
  renderBandTable(); renderPieceTable(); scheduleSave();
});
$('#addSheet').addEventListener('click', ()=>{
  sheetTypes.push({id:nid(), name:'لوح', l:null, w:null, qty:null, price:null});
  renderSheetTable(); scheduleSave();
});
$('#addPiece').addEventListener('click', ()=>{
  const id = nid();
  pieces.push({id, name:'', l:null, w:null, qty:null, bandId:bandTypes[0]?.id, edges:{t:false,b:false,l:false,r:false}});
  renderPieceTable(); scheduleSave();
});
$('#addPiece10')?.addEventListener('click', ()=>{
  for(let i=0;i<10;i++){
    const id = nid();
    pieces.push({id, name:'', l:null, w:null, qty:null, bandId:bandTypes[0]?.id, edges:{t:false,b:false,l:false,r:false}});
  }
  renderPieceTable(); toast('✓ تمت إضافة ١٠ صفوف'); scheduleSave();
});
const btnExtra = $('#toggleExtra');
if (btnExtra) {
  btnExtra.addEventListener('click', () => {
    showExtra = !showExtra;
    applyExtraToggleUI();
    renderPieceTable();
    scheduleSave();
  });
}
applyExtraToggleUI();

$('#btnNew').addEventListener('click', resetProject);
$('#btnOptimize').addEventListener('click', optimize);
$('#btnPdf').addEventListener('click', openPdfOptions);
$('#btnSaveLocal').addEventListener('click', saveProjectLocally);

$('#pdfOptCancel')?.addEventListener('click', ()=> $('#pdfOptModal').classList.add('hidden'));
$('#pdfOptGo')?.addEventListener('click', ()=>{
  $('#pdfOptModal').classList.add('hidden');
  doExportPDF();
});

/* ========== تحميل البيانات عند بدء التشغيل ========== */
function initApp() {
  const saved = loadState();
  if (saved) {
    const setV = (id, v) => { const el = $('#'+id); if (el && v != null && v !== '') el.value = v; };
    setV('planName', saved.planName);
    setV('kerf', saved.kerf);
    setV('cutFee', saved.cutFee);
    if (saved.cutDir) { const cd = $('#cutDir'); if (cd) cd.value = saved.cutDir; }
  }
  applyExtraToggleUI();
  renderSheetTable();
  renderBandTable();
  renderPieceTable();
  if (layout && layout.length) renderResults();
}

document.addEventListener('DOMContentLoaded', initApp);
setTimeout(initApp, 10);

['planName','kerf','cutFee','cutDir'].forEach(id => {
  const el = $('#'+id);
  if (el) el.addEventListener('input', scheduleSave);
  if (el) el.addEventListener('change', scheduleSave);
});
