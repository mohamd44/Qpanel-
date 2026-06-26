/* ============================================================
   Qpanell — محسّن قص ألواح الأخشاب (2D Guillotine)
   الإصدار: 1.0.15 — تقرير PDF مطابق للنموذج المرفق
   ============================================================ */

const APP_VERSION = '1.0.15';
const MIN_VERSION = '1.0.0';
const VERSION_CHECK_URL = 'https://mohamd44.github.io/Qpanel-/version.json';

const $ = (s) => document.querySelector(s);
const palette = ['#dbe7f5','#fde9d2','#d8f0e0','#f5d8e6','#e7dcf5','#fdf0c8',
                 '#d2eef5','#f5dcd2','#e2f5d2','#f0d2f0','#d2d8f5','#f5f0d2'];

let bandTypes = [
  { id: 'b1', name: 'PVC 0.4 مم', price: 0.30 },
  { id: 'b2', name: 'PVC 2 مم',   price: 0.80 },
  { id: 'b0', name: 'بدون تلبيس', price: 0.00 },
];
let pieces = [];
let showExtra = false;
let sheetTypes = [ { id:'s1', name:'لوح', l:null, w:null, qty:null, price:null } ];
let activeSheetId = 's1';
let layout = null;
let settings = null;
let uid = 100;
const nid = () => 'x' + (++uid);

// متغير عام لتخزين القطع غير الموضوعة
let _unplacedItems = [];

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(t._tm); t._tm=setTimeout(()=>t.classList.add('hidden'),2600); }
function bandById(id){ return bandTypes.find(b=>b.id===id) || {name:'-',price:0}; }

/* ---------------- تحميل مكتبات الـ PDF ---------------- */
let _pdfLibsLoaded = false;
function ensurePdfLibs(){
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.html2canvas) { _pdfLibsLoaded = true; resolve(); return; }
    if (_pdfLibsLoaded) { resolve(); return; }
    const scripts = ['jspdf.umd.min.js', 'html2canvas.min.js'];
    let loaded = 0;
    scripts.forEach(src => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { loaded++; if (loaded === scripts.length) { _pdfLibsLoaded = true; resolve(); } };
      s.onerror = () => reject(new Error('فشل تحميل '+src));
      document.head.appendChild(s);
    });
  });
}

/* ---------------- حفظ واستعادة الحالة ---------------- */
const LS_KEY='iqpanel_project_v2';
function _readInputs(){ return {
  planName:($('#planName')&&$('#planName').value)||'',
  kerf:($('#kerf')&&$('#kerf').value)||'',
  cutFee:($('#cutFee')&&$('#cutFee').value)||'',
  cutDir:($('#cutDir')&&$('#cutDir').value)||'length',
  allowRotate:($('#allowRotate')&&$('#allowRotate').checked)||false
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

function sizeKey(p){ const a=(p.origL!=null?p.origL:p.l), b=(p.origW!=null?p.origW:p.w); const mn=Math.min(a,b), mx=Math.max(a,b); return mn+'x'+mx; }

function groupSheets(){
  const groups=[]; const map={};
  (layout||[]).forEach((sh,idx)=>{
    const fp=sh.pieces.map(p=>[Math.round(p.x*10),Math.round(p.y*10),Math.round(p.l*10),Math.round(p.w*10),(p.rot?1:0),(p.bandId||''),(p.edges?(''+(!!p.edges.t)+(!!p.edges.b)+(!!p.edges.l)+(!!p.edges.r)):'')].join(',')).sort().join('|');
    if(map[fp]!=null){ const g=groups[map[fp]]; g.count++; g.idxs.push(idx); }
    else { map[fp]=groups.length; groups.push({sheet:sh, idx:idx, count:1, idxs:[idx], fp:fp}); }
  });
  return groups;
}
function cutDirLabel(d){ return d==='length'?'طولي ‖':(d==='cross'?'عرضي ═':'حر ✲'); }

async function logoDataUrl(){
  if(window._logoDU!==undefined) return window._logoDU;
  try{ const r=await fetch('logo.jpeg'); const bl=await r.blob();
    window._logoDU=await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=()=>res(null); fr.readAsDataURL(bl); });
  }catch(_){ window._logoDU=null; }
  return window._logoDU;
}

/* ---------------- جداول الإدخال ---------------- */
function renderBandTable(){
  const tb = $('#bandTable tbody'); tb.innerHTML='';
  bandTypes.forEach(b=>{
    const tr=document.createElement('tr');
    tr.innerHTML = `<td><input value="${b.name}" data-id="${b.id}" data-f="name"></td><td><input type="number" step="0.01" min="0" value="${b.price}" data-id="${b.id}" data-f="price"></td><td><button class="btn btn-danger" data-del="${b.id}">✕</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input').forEach(inp=>inp.addEventListener('input',e=>{
    const b=bandTypes.find(x=>x.id===e.target.dataset.id); const f=e.target.dataset.f;
    b[f] = f==='price' ? (parseFloat(e.target.value)||0) : e.target.value;
  }));
  tb.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',e=>{
    bandTypes=bandTypes.filter(x=>x.id!==e.target.dataset.del); renderBandTable(); renderPieceTable();
  }));
}

function renderSheetTable(){
  const tb=$('#sheetTable tbody'); if(!tb) return; tb.innerHTML='';
  const val=v=>v==null?'':v;
  sheetTypes.forEach(s=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input value="${val(s.name)}" data-id="${s.id}" data-f="name" style="min-width:54px"></td><td><input type="number" min="1" value="${val(s.l)}" data-id="${s.id}" data-f="l"></td><td><input type="number" min="1" value="${val(s.w)}" data-id="${s.id}" data-f="w"></td><td><input type="number" min="1" value="${val(s.qty)}" data-id="${s.id}" data-f="qty"></td><td><input type="number" min="0" step="0.01" value="${val(s.price)}" data-id="${s.id}" data-f="price"></td><td style="text-align:center"><input type="radio" name="activeSheet" ${s.id===activeSheetId?'checked':''} data-active="${s.id}"></td><td><button class="btn btn-danger" data-del="${s.id}">\u2715</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input[data-f]').forEach(inp=>inp.addEventListener('input',e=>{
    const s=sheetTypes.find(x=>x.id===e.target.dataset.id); const f=e.target.dataset.f;
    s[f]=['l','w','qty','price'].includes(f)?(e.target.value===''?null:parseFloat(e.target.value)):e.target.value;
  }));
  tb.querySelectorAll('[data-active]').forEach(r=>r.addEventListener('change',e=>{ activeSheetId=e.target.dataset.active; }));
  tb.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',e=>{
    if(sheetTypes.length<=1){ toast('يجب إبقاء نوع لوح واحد على الأقل'); return; }
    const id=e.target.dataset.del;
    sheetTypes=sheetTypes.filter(x=>x.id!==id);
    if(activeSheetId===id) activeSheetId=sheetTypes[0].id;
    renderSheetTable();
  }));
}

function renderPieceTable(){
  const tb=$('#pieceTable tbody'); tb.innerHTML='';
  const val=v=>v==null?'':v;
  pieces.forEach(p=>{
    const opts=bandTypes.map(b=>`<option value="${b.id}" ${b.id===p.bandId?'selected':''}>${b.name}</option>`).join('');
    const eb=(k,sym)=>`<button class="edge-btn ${p.edges[k]?'on':''}" data-id="${p.id}" data-e="${k}" title="${k}">${sym}</button>`;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input type="number" min="1" value="${val(p.l)}" data-id="${p.id}" data-f="l"></td><td><input type="number" min="1" value="${val(p.w)}" data-id="${p.id}" data-f="w"></td><td><input type="number" min="1" value="${val(p.qty)}" data-id="${p.id}" data-f="qty"></td><td><button class="btn btn-danger" data-del="${p.id}">✕</button></td>`;
    tb.appendChild(tr);
    if(showExtra){
      const tro=document.createElement('tr');
      tro.className='opt-row';
      tro.dataset.optrow=p.id;
      tro.innerHTML=`<td colspan="4"><div class="opt-grid"><label class="opt-field">اسم القطعة<input value="${val(p.name)}" data-id="${p.id}" data-f="name" placeholder="اختياري"></label><label class="opt-field">نوع الحرف<select data-id="${p.id}" data-f="bandId">${opts}</select></label><div class="opt-field">مكان التلبيس (الأطراف)<div class="edge-toggles">${eb('t','↑')}${eb('b','↓')}${eb('l','←')}${eb('r','→')}</div></div></div></td>`;
      tb.appendChild(tro);
    }
  });
  tb.querySelectorAll('input,select').forEach(inp=>inp.addEventListener('input',e=>{
    const p=pieces.find(x=>x.id===e.target.dataset.id); const f=e.target.dataset.f;
    p[f]=['l','w','qty'].includes(f)?(e.target.value===''?null:parseFloat(e.target.value)):e.target.value;
  }));
  tb.querySelectorAll('.edge-btn').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{
      e.preventDefault();
      const p=pieces.find(x=>x.id===btn.dataset.id); const k=btn.dataset.e;
      if(!p) return; p.edges[k]=!p.edges[k]; btn.classList.toggle('on',p.edges[k]);
    });
  });
  tb.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('mousedown',e=>e.preventDefault());
    btn.addEventListener('click',e=>{
      const delId=e.currentTarget.dataset.del;
      const idx=pieces.findIndex(x=>x.id===delId);
      pieces=pieces.filter(x=>x.id!==delId); renderPieceTable();
      if(pieces.length){
        const ni=Math.min(idx, pieces.length-1);
        const inp=document.querySelector(`#pieceTable tbody input[data-id="${pieces[ni].id}"][data-f="l"]`);
        if(inp) inp.focus();
      }
    });
  });
}

/* ---------------- الخوارزمية والإحصائيات ---------------- */
function optimize(){
  const at=sheetTypes.find(s=>s.id===activeSheetId)||sheetTypes[0];
  const L=+at.l, W=+at.w, qty=+at.qty||0;
  const kerf=+$('#kerf').value||0, cutDir=$('#cutDir').value, allowRotate=$('#allowRotate').checked;
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
    let best=null,score=Infinity,rot=false;
    for(const fr of s.free){
      if(fits(fr,it._l,it._w)){ const sc=Math.min(fr.w-it._l,fr.h-it._w); if(sc<score){score=sc;best=fr;rot=false;} }
      if(allowRotate && fits(fr,it._w,it._l)){ const sc=Math.min(fr.w-it._w,fr.h-it._l); if(sc<score){score=sc;best=fr;rot=true;} }
    }
    if(!best) return false;
    const pl=rot?it._w:it._l, pw=rot?it._l:it._w;
    s.placed.push({ x:best.x, y:best.y, l:pl, w:pw, rot, src:it, origL:it._l, origW:it._w });
    const rightW=best.w-pl-kerf, bottomH=best.h-pw-kerf;
    if(rightW>0.05) s.cuts++; if(bottomH>0.05) s.cuts++;
    s.free=s.free.filter(f=>f!==best);
    let r1,r2;
    if(cutDir==='length'){ r1={x:best.x+pl+kerf, y:best.y, w:rightW, h:best.h}; r2={x:best.x, y:best.y+pw+kerf, w:pl, h:bottomH}; }
    else if(cutDir==='cross'){ r1={x:best.x, y:best.y+pw+kerf, w:best.w, h:bottomH}; r2={x:best.x+pl+kerf, y:best.y, w:rightW, h:pw}; }
    else {
      const aR1={x:best.x+pl+kerf, y:best.y, w:rightW, h:best.h}; const aR2={x:best.x, y:best.y+pw+kerf, w:pl, h:bottomH};
      const bR1={x:best.x, y:best.y+pw+kerf, w:best.w, h:bottomH}; const bR2={x:best.x+pl+kerf, y:best.y, w:rightW, h:pw};
      const maxA=Math.max(aR1.w*aR1.h, aR2.w*aR2.h); const maxB=Math.max(bR1.w*bR1.h, bR2.w*bR2.h);
      if(maxA>=maxB){ r1=aR1; r2=aR2; } else { r1=bR1; r2=bR2; }
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
  layout = sheets.map(s=>({ cuts:s.cuts, pieces:s.placed.map(p=>({ id:nid(), x:p.x, y:p.y, l:p.l, w:p.w, rot:p.rot, name:p.src.name, bandId:p.src.bandId, edges:{...p.src.edges}, origL:p.origL, origW:p.origW })) }));
  
  // تخزين القطع غير الموضوعة عالمياً للتقرير
  _unplacedItems = unplaced;
  
  if(unplaced.length) toast(`⚠️ ${unplaced.length} قطعة أكبر من اللوح ولم تُوضع`);
  else if(sheets.length>qty) toast(`⚠️ تحتاج ${sheets.length} لوحاً وهو أكثر من المتاح (${qty})`);
  else toast(`✓ تم: ${sheets.length} لوح، ${items.length} قطعة`);
  renderResults();
  saveState();
}

function pieceBanding(p){ let cm=0; if(p.edges.t) cm+=p.origL; if(p.edges.b) cm+=p.origL; if(p.edges.l) cm+=p.origW; if(p.edges.r) cm+=p.origW; const m=cm/100; return { m, cost:m*bandById(p.bandId).price }; }
function recomputeCuts(sheet){ const xs=new Set(), ys=new Set(); sheet.pieces.forEach(p=>{ const x1=Math.round(p.x*10)/10, x2=Math.round((p.x+p.l)*10)/10; const y1=Math.round(p.y*10)/10, y2=Math.round((p.y+p.w)*10)/10; if(x1>0.1) xs.add(x1); if(x2<settings.L-0.1) xs.add(x2); if(y1>0.1) ys.add(y1); if(y2<settings.W-0.1) ys.add(y2); }); return xs.size + ys.size; }
function sheetStats(sheet){ const area=settings.L*settings.W; let used=0,m=0,cost=0; sheet.pieces.forEach(p=>{ used+=p.l*p.w; const b=pieceBanding(p); m+=b.m; cost+=b.cost; }); return { used, area, util:used/area*100, waste:(1-used/area)*100, meters:m, cost, count:sheet.pieces.length, cuts:recomputeCuts(sheet) }; }
function sheetCutLength(sheet){ const xs=new Set(), ys=new Set(); sheet.pieces.forEach(p=>{ const x2=Math.round((p.x+p.l)*10)/10, y2=Math.round((p.y+p.w)*10)/10; if(x2<settings.L-0.1) xs.add(x2); if(y2<settings.W-0.1) ys.add(y2); }); return xs.size*settings.W + ys.size*settings.L; }
function totals(){ let used=0,m=0,cost=0,cuts=0,count=0,cutLen=0; const byType={}; layout.forEach(sh=>sh.pieces.forEach(p=>{ used+=p.l*p.w; const b=pieceBanding(p); m+=b.m; cost+=b.cost; const t=bandById(p.bandId).name; byType[t]=byType[t]||{m:0,cost:0}; byType[t].m+=b.m; byType[t].cost+=b.cost; })); layout.forEach(sh=>{cuts+=recomputeCuts(sh);count+=sh.pieces.length;cutLen+=sheetCutLength(sh);}); const area=layout.length*settings.L*settings.W; return { sheets:layout.length, area, used, util:area?used/area*100:0, waste:area?(1-used/area)*100:0, meters:m, cost, cuts, count, cutLen, byType }; }

/* ---------------- عرض النتائج ---------------- */
const fmtNum=n=>Number.isInteger(n)?n:Math.round(n*10)/10;

function recomputeWaste(sheet){
  const L=settings.L, W=settings.W;
  const cl=(v,a,b)=>Math.max(a,Math.min(b,v));
  const xsSet=new Set([0,L]), ysSet=new Set([0,W]);
  sheet.pieces.forEach(p=>{ xsSet.add(cl(p.x,0,L)); xsSet.add(cl(p.x+p.l,0,L)); ysSet.add(cl(p.y,0,W)); ysSet.add(cl(p.y+p.w,0,W)); });
  const xs=[...xsSet].sort((a,b)=>a-b), ys=[...ysSet].sort((a,b)=>a-b);
  const nC=xs.length-1, nR=ys.length-1;
  if(nC<1||nR<1) return [];
  const occ=[], usedC=[];
  for(let r=0;r<nR;r++){ occ[r]=[]; usedC[r]=new Array(nC).fill(false);
    for(let c=0;c<nC;c++){ const cx=(xs[c]+xs[c+1])/2, cy=(ys[r]+ys[r+1])/2; occ[r][c]=sheet.pieces.some(p=>cx>=p.x&&cx<=p.x+p.l&&cy>=p.y&&cy<=p.y+p.w); }
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
  const st=sheetStats(sheet);
  const block=document.createElement('div'); block.className='sheet-block';
  block.innerHTML=`<div class="sheet-head"><h3>${count>1?`ألواح متطابقة <span class="sheet-mult">×${count}</span>`:`اللوح ${idx+1}`} <span class="dim-note">${settings.sheetName} · ${settings.L}×${settings.W} سم</span></h3><div class="sheet-meta"><span>القص: <b>${cutDirLabel(settings.cutDir)}</b></span><span>القطع: <b>${st.count}</b></span><span>القصّات: <b>${st.cuts}</b></span><span>الاستفادة: <b style="color:#16a34a">${st.util.toFixed(1)}%</b></span><span>الهدر: <b style="color:#dc2626">${st.waste.toFixed(1)}%</b></span><span>التلبيس: <b>${st.meters.toFixed(2)} م</b></span></div></div><div class="stage">${count>1?`<div class="mult-badge" title="عدد الألواح المتطابقة">*${count}</div>`:''}<div class="canvas-wrap"><div class="sheet-canvas" data-sheet="${idx}"></div></div><div class="ruler-y"><span>${fmtNum(settings.W)}</span></div><div class="ruler-x"><span>${fmtNum(settings.L)}</span></div></div>`;
  const canvas=block.querySelector('.sheet-canvas');
  canvas.style.direction='ltr';
  canvas._sheet=sheet; canvas._idx=idx; canvas._colorMap=colorMap; canvas._interactive=interactive;
  return { block, canvas };
}

function positionPieces(canvas, scale){
  const sheet=canvas._sheet, idx=canvas._idx;
  canvas.style.height=(settings.W*scale)+'px';
  canvas.innerHTML='';
  canvas.style.background = '#ffffff';
  canvas.classList.add(settings.cutDir==='length'?'cut-length':'cut-width');
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
    el.dataset.sheet=idx; el.dataset.pi=pi;
    const small=(p.l*scale<44||p.w*scale<26);
    el.innerHTML=`<span class="dim-h">${fmtNum(p.l)}</span><span class="dim-v">${fmtNum(p.w)}</span>${small?'':`<span class="pname">${p.name}${p.rot?' ⟳':''}</span>`}`;
    const de=displayEdges(p);
    ['t','b','l','r'].forEach(s=>{ if(de[s]){ const bd=document.createElement('span'); bd.className='band '+s; el.appendChild(bd);} });
    if(canvas._interactive){ el.addEventListener('pointerdown',startDrag); }
    canvas.appendChild(el);
  });
  markOverlaps(canvas);
}

function displayEdges(p){ const e=p.edges; if(!p.rot) return {t:e.t,b:e.b,l:e.l,r:e.r}; return { t:e.l, b:e.r, l:e.b, r:e.t }; }
function markOverlaps(canvas){ const els=[...canvas.querySelectorAll('.piece')]; els.forEach(e=>e.classList.remove('overlap')); for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){ const a=els[i].getBoundingClientRect(), b=els[j].getBoundingClientRect(); if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1){ els[i].classList.add('overlap'); els[j].classList.add('overlap'); } } }

let liveCanvases=[];
function renderResults(){
  const area=$('#sheetsArea'); area.innerHTML=''; liveCanvases=[];
  $('#statsBar').innerHTML=''; 
  if(!layout||!layout.length){ $('#emptyState').classList.remove('hidden'); $('#dragHint').classList.add('hidden'); return; }
  $('#emptyState').classList.add('hidden'); $('#dragHint').classList.remove('hidden');
  const t=totals();
  const stat=(l,v,cls='')=>`<div class="stat ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const m2=(cm2)=>(cm2/10000).toLocaleString('en',{maximumFractionDigits:2});
  const sheetsCost=t.sheets*(settings.sheetPrice||0); const cutCost=t.sheets*(settings.cutFee||0); const grand=sheetsCost+cutCost+t.cost;
  $('#statsBar').innerHTML = (settings.planName?stat('مخطط العمل',settings.planName):'')+stat('الألواح المستخدمة',t.sheets+' × '+settings.L+'×'+settings.W)+stat('المساحة المستخدمة',m2(t.used)+' م² · '+t.util.toFixed(0)+'%','good')+stat('المساحة المهدورة',m2(t.area-t.used)+' م² · '+t.waste.toFixed(0)+'%','warn')+stat('إجمالي القصّات',t.cuts)+stat('طول القص (تقديري)',fmtNum(Math.round(t.cutLen))+' سم')+stat('حرف التلبيس',t.meters.toFixed(2)+' م')+stat('تكلفة الألواح','$'+sheetsCost.toFixed(2))+stat('أجور القص','$'+cutCost.toFixed(2))+stat('تكلفة التلبيس','$'+t.cost.toFixed(2))+stat('التكلفة الإجمالية','$'+grand.toFixed(2),'good');
  const colorMap={};
  const groups=groupSheets();
  groups.forEach(g=>{ const {block,canvas}=buildSheetCanvas(g.sheet,g.idx,colorMap,true,g.count); area.appendChild(block); liveCanvases.push(canvas); });
  requestAnimationFrame(()=>liveCanvases.forEach(c=>positionPieces(c, c.clientWidth/settings.L)));
}
window.addEventListener('resize',()=>{ if(layout) liveCanvases.forEach(c=>c.isConnected&&positionPieces(c,c.clientWidth/settings.L)); });

/* ---------------- السحب والإفلات ---------------- */
const HOLD_MS=200, MOVE_TOL=9; let drag=null;
function startDrag(e){ if(e.button && e.button!==0) return; const el=e.currentTarget; const canvas=el.parentElement; const r=el.getBoundingClientRect(); drag={ el, canvas, fromSheet:+canvas.dataset.sheet, pi:+el.dataset.pi, piece:layout[+canvas.dataset.sheet].pieces[+el.dataset.pi], offX:e.clientX-r.left, offY:e.clientY-r.top, w:r.width, h:r.height, startX:e.clientX, startY:e.clientY, lastX:e.clientX, lastY:e.clientY, lifted:false, pointerId:e.pointerId }; try{ el.setPointerCapture(e.pointerId); }catch(_){} el.classList.add('armed'); drag.timer=setTimeout(lift, HOLD_MS); document.addEventListener('pointermove',onDrag); document.addEventListener('pointerup',endDrag); document.addEventListener('pointercancel',cancelDrag); }
function lift(){ if(!drag) return; drag.lifted=true; const el=drag.el; el.classList.remove('armed'); el.classList.add('lifting'); if(navigator.vibrate) try{ navigator.vibrate(25); }catch(_){} el.style.position='fixed'; el.style.margin='0'; el.style.width=drag.w+'px'; el.style.height=drag.h+'px'; moveFixed(drag.lastX,drag.lastY); highlightTarget(drag.lastX,drag.lastY); }
function moveFixed(x,y){ drag.el.style.left=(x-drag.offX)+'px'; drag.el.style.top=(y-drag.offY)+'px'; }
function highlightTarget(x,y){ drag.el.style.pointerEvents='none'; const t=document.elementFromPoint(x,y); drag.el.style.pointerEvents=''; const tc=t?t.closest('.sheet-canvas'):null; liveCanvases.forEach(c=>c.classList.toggle('drop-target', c===tc)); }
function onDrag(e){ if(!drag) return; drag.lastX=e.clientX; drag.lastY=e.clientY; if(!drag.lifted){ if(Math.hypot(e.clientX-drag.startX, e.clientY-drag.startY)>MOVE_TOL) cancelDrag(); return; } e.preventDefault(); moveFixed(e.clientX,e.clientY); highlightTarget(e.clientX,e.clientY); }
function cancelDrag(){ if(!drag) return; clearTimeout(drag.timer); drag.el.classList.remove('armed','lifting'); document.removeEventListener('pointermove',onDrag); document.removeEventListener('pointerup',endDrag); document.removeEventListener('pointercancel',cancelDrag); drag=null; }
function overlapsAny(sheetIdx, piece, x, y, exceptIdx){ const ps=layout[sheetIdx].pieces; for(let i=0;i<ps.length;i++){ if(i===exceptIdx) continue; const o=ps[i]; if(x < o.x+o.l && x+piece.l > o.x && y < o.y+o.w && y+piece.w > o.y) return true; } return false; }
function findFreeSpot(sheetIdx, piece, wx, wy, exceptIdx){ if(!overlapsAny(sheetIdx,piece,wx,wy,exceptIdx)) return {x:wx,y:wy}; const step=2, maxX=settings.L-piece.l, maxY=settings.W-piece.w; let best=null, bestD=Infinity; for(let gy=0; gy<=maxY+0.001; gy+=step){ for(let gx=0; gx<=maxX+0.001; gx+=step){ if(!overlapsAny(sheetIdx,piece,gx,gy,exceptIdx)){ const d=(gx-wx)*(gx-wx)+(gy-wy)*(gy-wy); if(d<bestD){ bestD=d; best={x:gx,y:gy}; } } } } return best; }
function magnetSnap(sheetIdx, piece, nx, ny, exceptIdx){ const ps=layout[sheetIdx].pieces, kerf=settings.kerf||0; const maxX=settings.L-piece.l, maxY=settings.W-piece.w; const cand=[]; const add=(x,y)=>{ x=Math.max(0,Math.min(x,maxX)); y=Math.max(0,Math.min(y,maxY)); cand.push({x,y}); }; add(0,0); add(maxX,0); add(0,maxY); add(maxX,maxY); ps.forEach((o,i)=>{ if(i===exceptIdx) return; const right=o.x+o.l+kerf, left=o.x-piece.l-kerf; const below=o.y+o.w+kerf, above=o.y-piece.w-kerf; const yTop=o.y, yBot=o.y+o.w-piece.w; const xLeft=o.x, xRight=o.x+o.l-piece.l; add(right,yTop); add(right,yBot); add(left,yTop); add(left,yBot); add(xLeft,below);add(xRight,below); add(xLeft,above);add(xRight,above); }); let best=null, bd=Infinity; for(const c of cand){ if(c.x<-0.01||c.x>maxX+0.01||c.y<-0.01||c.y>maxY+0.01) continue; if(overlapsAny(sheetIdx,piece,c.x,c.y,exceptIdx)) continue; const d=(c.x-nx)*(c.x-nx)+(c.y-ny)*(c.y-ny); if(d<bd){ bd=d; best=c; } } return best; }
function endDrag(e){ if(!drag) return; clearTimeout(drag.timer); document.removeEventListener('pointermove',onDrag); document.removeEventListener('pointerup',endDrag); document.removeEventListener('pointercancel',cancelDrag); liveCanvases.forEach(c=>c.classList.remove('drop-target')); if(!drag.lifted){ drag.el.classList.remove('armed'); drag=null; return; } const el=drag.el, piece=drag.piece; el.style.pointerEvents='none'; const target=document.elementFromPoint(drag.lastX,drag.lastY); el.style.pointerEvents=''; const tCanvas=target?target.closest('.sheet-canvas'):null; if(tCanvas){ const toSheet=+tCanvas.dataset.sheet; if(piece.l>settings.L+0.01 || piece.w>settings.W+0.01){ toast('⚠️ القطعة أكبر من اللوح — رُفض الإفلات'); } else { const cr=tCanvas.getBoundingClientRect(); const scale=tCanvas.clientWidth/settings.L; let nx=(drag.lastX-cr.left-drag.offX)/scale; let ny=(drag.lastY-cr.top-drag.offY)/scale; nx=Math.max(0,Math.min(nx, settings.L-piece.l)); ny=Math.max(0,Math.min(ny, settings.W-piece.w)); const except = (toSheet===drag.fromSheet) ? drag.pi : -1; let pos = magnetSnap(toSheet, piece, nx, ny, except); if(!pos) pos = findFreeSpot(toSheet, piece, nx, ny, except); if(!pos){ toast('⚠️ لا يوجد مكان كافٍ في هذا اللوح'); } else { piece.x=Math.round(pos.x*10)/10; piece.y=Math.round(pos.y*10)/10; if(toSheet!==drag.fromSheet){ layout[drag.fromSheet].pieces.splice(drag.pi,1); layout[toSheet].pieces.push(piece); layout=layout.filter(s=>s.pieces.length>0); } } } } el.classList.remove('lifting'); el.style.position=''; el.style.pointerEvents=''; drag=null; refreshLive(); }
function refreshLive(){ const scrollY=window.scrollY; renderResults(); window.scrollTo(0,scrollY); }

/* ---------------- رسم المخططات لملف PDF ---------------- */
function _haloText(ctx,text,x,y,color,halo){ ctx.save(); ctx.lineJoin='round'; ctx.lineWidth=3; ctx.strokeStyle=halo||'#ffffff'; ctx.strokeText(text,x,y); ctx.fillStyle=color||'#0f2233'; ctx.fillText(text,x,y); ctx.restore(); }
function _roundRect(ctx,x,y,w,h,r){ r=Math.max(0,Math.min(r,w/2,h/2)); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function _band(ctx,x,y,w,h){ ctx.save(); ctx.fillStyle='#0f766e'; _roundRect(ctx,x,y,w,h,Math.min(w,h)/2); ctx.fill(); ctx.restore(); }

function drawSheetToCanvasEl(sheet, idx, scale){
  const cv=document.createElement('canvas');
  const Wpx=Math.max(1,Math.round(settings.L*scale)), Hpx=Math.max(1,Math.round(settings.W*scale));
  const dpr=2;
  cv.width=Wpx*dpr; cv.height=Hpx*dpr;
  cv.style.width='100%'; cv.style.height='auto'; cv.style.display='block';
  const ctx=cv.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.direction='ltr';
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,Wpx,Hpx);
  ctx.lineWidth=2; ctx.strokeStyle='#8a5e26'; ctx.strokeRect(0,0,Wpx,Hpx);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  recomputeWaste(sheet).forEach(w=>{ const x=w.x*scale,y=w.y*scale,ww=w.w*scale,hh=w.h*scale; if(ww<=0||hh<=0) return; ctx.save(); ctx.setLineDash([5,4]); ctx.lineWidth=1; ctx.strokeStyle='#cbd3dc'; ctx.strokeRect(x+0.5,y+0.5,ww-1,hh-1); ctx.restore(); if(ww>22&&hh>14){ ctx.font='800 9px Cairo, Arial, sans-serif'; _haloText(ctx, fmtNum(w.w)+'', x+ww/2, y+7, '#475569', '#ffffff'); ctx.save(); ctx.translate(x+7, y+hh/2); ctx.rotate(-Math.PI/2); _haloText(ctx, fmtNum(w.h)+'', 0, 0, '#475569', '#ffffff'); ctx.restore(); } });
  sheet.pieces.forEach((p,pi)=>{ const x=p.x*scale,y=p.y*scale,pw=p.l*scale,ph=p.w*scale; ctx.fillStyle=palette[pi % palette.length]; ctx.fillRect(x,y,pw,ph); ctx.lineWidth=1; ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.strokeRect(x+0.5,y+0.5,Math.max(0,pw-1),Math.max(0,ph-1)); const de=displayEdges(p); const ins=2.5, th=2.5, mg=Math.min(5, pw/4, ph/4); if(de.t) _band(ctx, x+mg, y+ins, Math.max(2,pw-2*mg), th); if(de.b) _band(ctx, x+mg, y+ph-ins-th, Math.max(2,pw-2*mg), th); if(de.l) _band(ctx, x+ins, y+mg, th, Math.max(2,ph-2*mg)); if(de.r) _band(ctx, x+pw-ins-th, y+mg, th, Math.max(2,ph-2*mg)); ctx.font='700 8.5px Cairo, Arial, sans-serif'; if(pw>20) _haloText(ctx, fmtNum(p.l)+'', x+pw/2, y+11, '#0f2233', '#ffffff'); if(ph>20){ ctx.save(); ctx.translate(x+11, y+ph/2); ctx.rotate(-Math.PI/2); _haloText(ctx, fmtNum(p.w)+'', 0, 0, '#0f2233', '#ffffff'); ctx.restore(); } const small=(pw<52||ph<32); if(!small && p.name){ ctx.font='600 9px Cairo, Arial, sans-serif'; _haloText(ctx, p.name+(p.rot?' ⟳':''), x+pw/2, y+ph/2, '#475569', '#ffffff'); } });
  return cv;
}

/* ============================================================
   تصدير PDF — تنسيق مطابق للملف النموذجي
   ============================================================ */
async function doExportPDF(opts){
  opts=opts||{summary:true,sheetData:true,cutOrder:true,banding:true,costs:true};
  if(!layout||!layout.length){ toast('قم بالتحسين أولاً'); return; }

  toast('جارٍ إنشاء ملف PDF…');
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pw = 210, ph = 297, margin = 10;
  const pageWidth = pw - margin*2;

  // إحصائيات عامة
  const t = totals();
  const totalSheets = t.sheets;
  const totalUsed = Math.round(t.used);
  const totalWaste = Math.round(t.area - t.used);
  const totalUtil = t.util;
  const totalWastePct = t.waste;
  const totalCuts = t.cuts;
  const totalCutLen = Math.round(t.cutLen * 10) / 10;
  const kerf = settings.kerf;

  // مجموعات الألواح المتطابقة
  const groups = groupSheets();
  const unplacedCount = _unplacedItems ? _unplacedItems.length : 0;

  // توزيع القطع غير الموضوعة على الألواح
  let wastedPerGroup = new Array(groups.length).fill(0);
  if (unplacedCount > 0 && groups.length > 0) {
    const base = Math.floor(unplacedCount / groups.length);
    const remainder = unplacedCount % groups.length;
    for (let i = 0; i < groups.length; i++) {
      wastedPerGroup[i] = base + (i < remainder ? 1 : 0);
    }
  }

  // دالة لإنشاء HTML لكل مجموعة
  function buildGroupHTML(g, idx) {
    const sh = g.sheet;
    const count = g.count;
    const st = sheetStats(sh);
    const usedArea = Math.round(st.used);
    const wasteArea = Math.round(st.waste);
    const utilPct = Math.round(st.util);
    const wastePct = Math.round(st.waste);
    const cuts = st.cuts;
    const cutLen = Math.round(sheetCutLength(sh) * 10) / 10;
    const panels = st.count;
    const wastedPanels = wastedPerGroup[idx] || 0;

    // تجميع القطع حسب الحجم لعرض Panel Qty
    const panelMap = {};
    sh.pieces.forEach(p => {
      const key = `${p.origL}x${p.origW}`;
      panelMap[key] = (panelMap[key] || 0) + 1;
    });
    const panelQtyStr = Object.entries(panelMap)
      .map(([size, qty]) => `${size} ${qty}`)
      .join(' ');

    // بناء جدول قطع النتائج
    let rows = '';
    sh.pieces.forEach((p, i) => {
      const num = i + 1;
      const l = p.l;
      const w = p.w;
      // إذا كان الدوران مفعلاً، نتبادل الأبعاد في العرض
      const displayL = p.rot ? w : l;
      const displayW = p.rot ? l : w;
      const xCoord = Math.round(p.x);
      const yCoord = Math.round(p.y);
      // بناء سلسلة النتيجة: إما x=... أو y=... حسب الإحداثيات الأكبر (محاكاة للنموذج)
      let resultStr = '';
      if (xCoord > 0 && yCoord === 0) resultStr = `x=${xCoord}`;
      else if (yCoord > 0 && xCoord === 0) resultStr = `y=${yCoord}`;
      else if (xCoord > 0 && yCoord > 0) resultStr = `x=${xCoord} y=${yCoord}`;
      else resultStr = '';
      rows += `<tr><td>${num}</td><td>${displayL}×${displayW}</td><td>${resultStr}</td></tr>`;
    });

    // علامة التكرار أسفل الصفحة (مثل x5)
    const repeatMark = count > 1 ? `<div style="text-align:center; margin-top:10px; font-weight:bold;">x${count}</div>` : '';

    return `
      <div style="font-family: 'Cairo', 'Courier New', monospace; direction: ltr; padding: 15px; width: 100%; box-sizing:border-box; background:#fff; font-size:11px; line-height:1.6;">
        <div>Stock sheet ${settings.L}×${settings.W} Qty ${count}</div>
        <div>Used area ${usedArea} ${utilPct}%</div>
        <div>Wasted area ${wasteArea} ${wastePct}%</div>
        <div>Cuts ${cuts}</div>
        <div>Cut length ${cutLen}</div>
        <div>Panels ${panels}</div>
        <div>Wasted panels ${wastedPanels}</div>
        <div>Panel Qty ${panelQtyStr}</div>
        <div style="margin-top:6px;">
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <tr style="border-bottom:1px solid #000;"><th style="text-align:left;padding:2px 0;">#</th><th style="text-align:left;padding:2px 0;">Panel</th><th style="text-align:left;padding:2px 0;">Cut Result</th></tr>
            ${rows}
          </table>
        </div>
        ${repeatMark}
      </div>
    `;
  }

  // ===== 1. صفحة الملخص =====
  const summaryHTML = `
    <div style="font-family: 'Cairo', 'Courier New', monospace; direction: ltr; padding: 15px; width: 100%; box-sizing:border-box; background:#fff; font-size:11px; line-height:1.6;">
      <div>Used stock sheets ${totalSheets}</div>
      <div>Total used area ${totalUsed} ${Math.round(totalUtil)}%</div>
      <div>Total wasted area ${totalWaste} ${Math.round(totalWastePct)}%</div>
      <div>Total cuts ${totalCuts}</div>
      <div>Total cut length ${totalCutLen}</div>
      <div>Cut / blade / kerf thickness ${kerf}</div>
    </div>
  `;

  // إضافة صفحة الملخص
  const summaryDiv = document.createElement('div');
  summaryDiv.innerHTML = summaryHTML;
  try {
    const canvasSum = await window.html2canvas(summaryDiv, { scale: 2, backgroundColor: '#ffffff' });
    const imgSum = canvasSum.toDataURL('image/jpeg', 0.95);
    const wSum = pageWidth;
    const hSum = canvasSum.height * wSum / canvasSum.width;
    pdf.addPage();
    pdf.addImage(imgSum, 'JPEG', margin, margin, wSum, hSum);
  } catch(e) { toast('تعذّر إنشاء صفحة الملخص'); }

  // ===== 2. صفحات الألواح =====
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const htmlContent = buildGroupHTML(g, i);
    const div = document.createElement('div');
    div.innerHTML = htmlContent;

    try {
      const canvas = await window.html2canvas(div, { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false, allowTaint: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const w = pageWidth;
      const h = canvas.height * w / canvas.width;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, margin, w, h);
    } catch (e) {
      toast('تعذّر إنشاء صفحة اللوح ' + (i+1));
      console.error(e);
    }
  }

  // حفظ الملف
  const base = (opts.name || settings.planName || 'IQ-Panel-مخطط-القص').toString().trim().replace(/[\\/:*?"<>|]+/g,'-') || 'IQ-Panel';
  const fname = base + '.pdf';
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('✓ تم حفظ الملف في مجلد التنزيلات');
  } catch (e) {
    toast('❌ فشل الحفظ: ' + e.message);
    window.open(url);
  }
  URL.revokeObjectURL(url);
}

function openPdfOptions(){
  if(!layout||!layout.length){ toast('قم بالتحسين أولاً'); return; }
  const nm=$('#pdfName'); if(nm) nm.value=(settings&&settings.planName)||($('#planName')&&$('#planName').value)||'';
  $('#pdfOptModal').classList.remove('hidden');
}

function resetProject(){
  if(!confirm('بدء مشروع جديد سيحذف كل البيانات الحالية. هل تريد المتابعة؟')) return;
  try{ localStorage.removeItem(LS_KEY); }catch(_){}
  pieces=Array.from({length:10},()=>emptyPiece());
  sheetTypes=[{id:'s1',name:'لوح',l:null,w:null,qty:null,price:null}];
  activeSheetId='s1';
  layout=null; settings=null;
  const pn=$('#planName'); if(pn) pn.value='';
  const kf=$('#kerf'); if(kf) kf.value='';
  const cf=$('#cutFee'); if(cf) cf.value='';
  const cd=$('#cutDir'); if(cd) cd.value='length';
  const ar=$('#allowRotate'); if(ar) ar.checked=false;
  showExtra=false; applyExtraToggleUI();
  renderSheetTable(); renderPieceTable(); renderResults();
  window.scrollTo(0,0);
  toast('✓ تم بدء مشروع جديد');
}

async function checkVersion() {
  try {
    const response = await fetch(VERSION_CHECK_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    const remoteVersion = data.version;
    const minRequired = data.minVersion || MIN_VERSION;
    const verSpan = document.getElementById('appVersion');
    if (verSpan) verSpan.textContent = APP_VERSION;
    const compare = (v1, v2) => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const n1 = parts1[i] || 0;
        const n2 = parts2[i] || 0;
        if (n1 !== n2) return n1 - n2;
      }
      return 0;
    };
    if (compare(remoteVersion, APP_VERSION) > 0) {
      const updater = document.getElementById('updateBanner');
      if (updater) {
        updater.classList.remove('hidden');
        updater.querySelector('.update-version').textContent = remoteVersion;
        updater.querySelector('.update-btn').addEventListener('click', () => {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
              if (reg) { reg.update().then(() => { window.location.reload(); }); } 
              else { window.location.reload(); }
            });
          } else { window.location.reload(); }
        });
      }
    } else {
      document.getElementById('updateBanner')?.classList.add('hidden');
    }
    if (compare(APP_VERSION, minRequired) < 0) {
      const blocker = document.getElementById('versionBlocker');
      if (blocker) {
        blocker.classList.remove('hidden');
        blocker.querySelector('.required-version').textContent = minRequired;
        document.body.style.pointerEvents = 'none';
        blocker.style.pointerEvents = 'auto';
        toast('⚠️ هذا الإصدار قديم، يرجى التحديث');
      }
    }
  } catch (e) {
    console.log('Version check failed, continuing offline.');
    document.getElementById('updateBanner')?.classList.add('hidden');
  }
}

function applyExtraToggleUI(){
  const btn=document.getElementById('toggleExtra'); if(!btn) return;
  btn.classList.toggle('on', showExtra);
  btn.textContent = showExtra ? '⚙ إخفاء الخيارات الإضافية' : '⚙ خيارات إضافية';
}
const emptyPiece=()=>({id:nid(),name:'',l:null,w:null,qty:null,bandId:bandTypes[0]?.id,edges:{t:false,b:false,l:false,r:false}});

// ربط الأحداث
$('#addBand').addEventListener('click',()=>{ bandTypes.push({id:nid(),name:'نوع جديد',price:0.5}); renderBandTable(); renderPieceTable(); });
$('#addPiece').addEventListener('mousedown',e=>e.preventDefault());
$('#addPiece').addEventListener('click',()=>{
  const id=nid();
  pieces.push({id,name:'',l:null,w:null,qty:null,bandId:bandTypes[0]?.id,edges:{t:false,b:false,l:false,r:false}});
  renderPieceTable();
  const inp=document.querySelector(`#pieceTable tbody input[data-id="${id}"][data-f="l"]`);
  if(inp) inp.focus();
});
const btnAdd10=$('#addPiece10');
if(btnAdd10){
  btnAdd10.addEventListener('mousedown',e=>e.preventDefault());
  btnAdd10.addEventListener('click',()=>{
    let firstId=null;
    for(let i=0;i<10;i++){ const id=nid(); if(!firstId) firstId=id;
      pieces.push({id,name:'',l:null,w:null,qty:null,bandId:bandTypes[0]?.id,edges:{t:false,b:false,l:false,r:false}}); }
    renderPieceTable();
    const inp=document.querySelector(`#pieceTable tbody input[data-id="${firstId}"][data-f="l"]`);
    if(inp) inp.focus();
    toast('✓ تمت إضافة ١٠ صفوف');
  });
}
const btnExtra=$('#toggleExtra');
if(btnExtra){ btnExtra.addEventListener('click',()=>{ showExtra=!showExtra; applyExtraToggleUI(); renderPieceTable(); }); }
applyExtraToggleUI();

$('#btnNew').addEventListener('click',resetProject);
$('#btnOptimize').addEventListener('click',optimize);
$('#btnPdf').addEventListener('click',openPdfOptions);
const _pc=$('#pdfOptCancel'); if(_pc) _pc.addEventListener('click',()=>$('#pdfOptModal').classList.add('hidden'));
const _pg=$('#pdfOptGo'); if(_pg) _pg.addEventListener('click',()=>{
  const opts={ name:($('#pdfName')&&$('#pdfName').value.trim())||'',
    summary:$('#optSummary').checked, sheetData:$('#optSheetData').checked,
    cutOrder:$('#optCutOrder').checked, banding:$('#optBanding').checked, costs:$('#optCosts').checked };
  if(settings && opts.name) settings.planName=opts.name;
  if(opts.name){ const pn=$('#planName'); if(pn) pn.value=opts.name; }
  $('#pdfOptModal').classList.add('hidden');
  doExportPDF(opts);
});
$('#addSheet').addEventListener('click',()=>{ sheetTypes.push({id:nid(),name:'لوح',l:null,w:null,qty:null,price:null}); renderSheetTable(); });
['allowRotate','cutDir'].forEach(id=>$('#'+id).addEventListener('change',()=>{ if(layout) optimize(); }));

const _saved=loadState();
if(!pieces.length){ for(let i=0;i<10;i++) pieces.push(emptyPiece()); }
if(_saved){
  const setV=(id,v)=>{ const el=$('#'+id); if(el!=null&&v!=null&&v!=='') el.value=v; };
  setV('planName',_saved.planName); setV('kerf',_saved.kerf); setV('cutFee',_saved.cutFee);
  if(_saved.cutDir){ const cd=$('#cutDir'); if(cd) cd.value=_saved.cutDir; }
  const ar=$('#allowRotate'); if(ar) ar.checked=!!_saved.allowRotate;
}
applyExtraToggleUI();
renderSheetTable();
renderBandTable();
renderPieceTable();
if(layout&&layout.length) renderResults();
document.addEventListener('input', scheduleSave);
document.addEventListener('change', scheduleSave);
checkVersion();
