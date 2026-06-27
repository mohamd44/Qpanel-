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
function colorForSize(l,w,map){ const k=`${l}x${w}`; if(!(k in map)) map[k]=palette[Object.keys(map).length%palette.length]; return map[k]; }

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
  allowRotate: false // ملغى نهائياً
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

/* ---------------- المقاسات المكررة ---------------- */
function sizeKey(p){ const a=(p.origL!=null?p.origL:p.l), b=(p.origW!=null?p.origW:p.w); const mn=Math.min(a,b), mx=Math.max(a,b); return mn+'x'+mx; }
function layoutSizeCounts(){ const m={}; (layout||[]).forEach(sh=>sh.pieces.forEach(p=>{ const k=sizeKey(p); m[k]=(m[k]||0)+1; })); return m; }

/* ---------------- تجميع الألواح المتطابقة ---------------- */
function sheetFingerprint(sh){
  return sh.pieces.map(p=>[Math.round(p.x*10),Math.round(p.y*10),Math.round(p.l*10),Math.round(p.w*10),(p.rot?1:0),(p.bandId||''),(p.edges?(''+(!!p.edges.t)+(!!p.edges.b)+(!!p.edges.l)+(!!p.edges.r)):'')].join(','))
    .sort().join('|');
}
function groupSheets(){
  const groups=[]; const map={};
  (layout||[]).forEach((sh,idx)=>{
    const fp=sheetFingerprint(sh);
    if(map[fp]!=null){ const g=groups[map[fp]]; g.count++; g.idxs.push(idx); }
    else { map[fp]=groups.length; groups.push({sheet:sh, idx:idx, count:1, idxs:[idx], fp:fp}); }
  });
  return groups;
}

/* ---------------- وصف اتجاه القص ---------------- */
function cutDirLabel(d){ return d==='length'?'طولي ‖':(d==='cross'?'عرضي ═':'حر ✲'); }

/* شعار التطبيق كـ Data URL */
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
    tr.innerHTML = `
      <td><input value="${b.name}" data-id="${b.id}" data-f="name"></td>
      <td><input type="number" step="0.01" min="0" value="${b.price}" data-id="${b.id}" data-f="price"></td>
      <td><button class="btn btn-danger" data-del="${b.id}">✕</button></td>`;
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

/* ---------------- خوارزمية الـ Guillotine ---------------- */
function optimize(){
  const at=sheetTypes.find(s=>s.id===activeSheetId)||sheetTypes[0];
  const L=+at.l, W=+at.w, qty=+at.qty||0;
  const kerf=+$('#kerf').value||0, cutDir=$('#cutDir').value, allowRotate=false; // التدوير ملغى نهائياً
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
    if(cutDir==='length'){
      r1={x:best.x+pl+kerf, y:best.y, w:rightW, h:best.h};
      r2={x:best.x, y:best.y+pw+kerf, w:pl, h:bottomH};
    } else if(cutDir==='cross'){
      r1={x:best.x, y:best.y+pw+kerf, w:best.w, h:bottomH};
      r2={x:best.x+pl+kerf, y:best.y, w:rightW, h:pw};
    } else {
      const aR1={x:best.x+pl+kerf, y:best.y, w:rightW, h:best.h};
      const aR2={x:best.x, y:best.y+pw+kerf, w:pl, h:bottomH};
      const bR1={x:best.x, y:best.y+pw+kerf, w:best.w, h:bottomH};
      const bR2={x:best.x+pl+kerf, y:best.y, w:rightW, h:pw};
      const maxA=Math.max(aR1.w*aR1.h, aR2.w*aR2.h);
      const maxB=Math.max(bR1.w*bR1.h, bR2.w*bR2.h);
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
  // سيتم استدعاء saveProjectToCloud() لاحقاً عند تفعيل السحابة
}

/* ---------------- حساب الإحصائيات ---------------- */
function pieceBanding(p){
  let cm=0;
  if(p.edges.t) cm+=p.origL; if(p.edges.b) cm+=p.origL;
  if(p.edges.l) cm+=p.origW; if(p.edges.r) cm+=p.origW;
  const m=cm/100; return { m, cost:m*bandById(p.bandId).price };
}
function recomputeCuts(sheet){
  const xs=new Set(), ys=new Set();
  sheet.pieces.forEach(p=>{
    const x1=Math.round(p.x*10)/10, x2=Math.round((p.x+p.l)*10)/10;
    const y1=Math.round(p.y*10)/10, y2=Math.round((p.y+p.w)*10)/10;
    if(x1>0.1) xs.add(x1); if(x2<settings.L-0.1) xs.add(x2);
    if(y1>0.1) ys.add(y1); if(y2<settings.W-0.1) ys.add(y2);
  });
  return xs.size + ys.size;
}
function sheetStats(sheet){
  const area=settings.L*settings.W;
  let used=0,m=0,cost=0;
  sheet.pieces.forEach(p=>{ used+=p.l*p.w; const b=pieceBanding(p); m+=b.m; cost+=b.cost; });
  return { used, area, util:used/area*100, waste:(1-used/area)*100, meters:m, cost, count:sheet.pieces.length, cuts:recomputeCuts(sheet) };
}
function sheetCutLength(sheet){
  const xs=new Set(), ys=new Set();
  sheet.pieces.forEach(p=>{
    const x2=Math.round((p.x+p.l)*10)/10, y2=Math.round((p.y+p.w)*10)/10;
    if(x2<settings.L-0.1) xs.add(x2);
    if(y2<settings.W-0.1) ys.add(y2);
  });
  return xs.size*settings.W + ys.size*settings.L;
}
function totals(){
  let used=0,m=0,cost=0,cuts=0,count=0,cutLen=0; const byType={};
  layout.forEach(sh=>sh.pieces.forEach(p=>{
    used+=p.l*p.w; const b=pieceBanding(p); m+=b.m; cost+=b.cost;
    const t=bandById(p.bandId).name; byType[t]=byType[t]||{m:0,cost:0}; byType[t].m+=b.m; byType[t].cost+=b.cost;
  }));
  layout.forEach(sh=>{cuts+=recomputeCuts(sh);count+=sh.pieces.length;cutLen+=sheetCutLength(sh);});
  const area=layout.length*settings.L*settings.W;
  return { sheets:layout.length, area, used, util:area?used/area*100:0, waste:area?(1-used/area)*100:0,
           meters:m, cost, cuts, count, cutLen, byType };
}

/* ---------------- رسم النتائج ---------------- */
const fmtNum=n=>Number.isInteger(n)?n:Math.round(n*10)/10;
const SHEET_TINTS=[['#efeaf6','#e4daee'],['#f6eaee','#f0dbe3'],['#f4f1e1','#eae3c9'],
                   ['#e7f0ea','#d8ebdf'],['#e7eef1','#d8e7ec'],['#f1ece5','#e8e0d4']];
function sheetTint(i){ return SHEET_TINTS[i%SHEET_TINTS.length]; }

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
  const st=sheetStats(sheet);
  const block=document.createElement('div'); block.className='sheet-block';
  block.innerHTML=`
    <div class="sheet-head">
      <h3>${count>1?`ألواح متطابقة <span class="sheet-mult">×${count}</span>`:`اللوح ${idx+1}`} <span class="dim-note">${settings.sheetName} • ${settings.L}×${settings.W} سم</span></h3>
      <div class="sheet-meta">
        <span>القص: <b>${cutDirLabel(settings.cutDir)}</b></span>
        <span>القطع: <b>${st.count}</b></span>
        <span>القصّات: <b>${st.cuts}</b></span>
        <span>الاستفادة: <b style="color:#16a34a">${st.util.toFixed(1)}%</b></span>
        <span>الهدر: <b style="color:#dc2626">${st.waste.toFixed(1)}%</b></span>
        <span>التلبيس: <b>${st.meters.toFixed(2)} م</b></span>
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
  const sheet=canvas._sheet, idx=canvas._idx;
  canvas.style.height=(settings.W*scale)+'px';
  canvas.innerHTML='';
  const tint=sheetTint(idx);
  canvas.style.background = '#ffffff';
  canvas.classList.remove('cut-length','cut-width');
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
    el.innerHTML=`<span class="dim-h">${fmtNum(p.l)}</span>
                  <span class="dim-v">${fmtNum(p.w)}</span>
                  ${small?'':`<span class="pname">${p.name}${p.rot?' ⟳':''}</span>`}`;
    const de=displayEdges(p);
    ['t','b','l','r'].forEach(s=>{ if(de[s]){ const bd=document.createElement('span'); bd.className='band '+s; el.appendChild(bd);} });
    if(canvas._interactive){ el.addEventListener('pointerdown',startDrag); }
    canvas.appendChild(el);
  });
  markOverlaps(canvas);
}

function displayEdges(p){
  const e=p.edges;
  if(!p.rot) return {t:e.t,b:e.b,l:e.l,r:e.r};
  return { t:e.l, b:e.r, l:e.b, r:e.t };
}

function markOverlaps(canvas){
  const els=[...canvas.querySelectorAll('.piece')];
  els.forEach(e=>e.classList.remove('overlap'));
  for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
    const a=els[i].getBoundingClientRect(), b=els[j].getBoundingClientRect();
    if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1){
      els[i].classList.add('overlap'); els[j].classList.add('overlap');
    }
  }
}

let liveCanvases=[];
function renderResults(){
  const area=$('#sheetsArea'); area.innerHTML=''; liveCanvases=[];
  $('#statsBar').innerHTML=''; 
  if(!layout||!layout.length){ $('#emptyState').classList.remove('hidden'); $('#dragHint').classList.add('hidden'); return; }
  $('#emptyState').classList.add('hidden'); $('#dragHint').classList.remove('hidden');

  const t=totals();
  const stat=(l,v,cls='')=>`<div class="stat ${cls}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  const m2=(cm2)=>(cm2/10000).toLocaleString('en',{maximumFractionDigits:2});
  const sheetsCost=t.sheets*(settings.sheetPrice||0);
  const cutCost=t.sheets*(settings.cutFee||0);
  const grand=sheetsCost+cutCost+t.cost;
  $('#statsBar').innerHTML =
    (settings.planName?stat('مخطط العمل',settings.planName):'')+
    stat('الألواح المستخدمة',t.sheets+' × '+settings.L+'×'+settings.W)+
    stat('المساحة المستخدمة',m2(t.used)+' م² • '+t.util.toFixed(0)+'%','good')+
    stat('المساحة المهدورة',m2(t.area-t.used)+' م² • '+t.waste.toFixed(0)+'%','warn')+
    stat('إجمالي القصّات',t.cuts)+
    stat('طول القص (تقديري)',fmtNum(Math.round(t.cutLen))+' سم')+
    stat('حرف التلبيس',t.meters.toFixed(2)+' م')+
    stat('تكلفة الألواح','$'+sheetsCost.toFixed(2))+
    stat('أجور القص','$'+cutCost.toFixed(2))+
    stat('تكلفة التلبيس','$'+t.cost.toFixed(2))+
    stat('التكلفة الإجمالية','$'+grand.toFixed(2),'good');

  const colorMap={};
  const groups=groupSheets();
  groups.forEach(g=>{ const {block,canvas}=buildSheetCanvas(g.sheet,g.idx,colorMap,true,g.count); area.appendChild(block); liveCanvases.push(canvas); });
  requestAnimationFrame(()=>liveCanvases.forEach(c=>positionPieces(c, c.clientWidth/settings.L)));
}

window.addEventListener('resize',()=>{ if(layout) liveCanvases.forEach(c=>c.isConnected&&positionPieces(c,c.clientWidth/settings.L)); });

/* ---------------- السحب والإفلات الاحترافي ---------------- */
const HOLD_MS=200;
const MOVE_TOL=9;
let drag=null;

function startDrag(e){
  if(e.button && e.button!==0) return;
  const el=e.currentTarget;
  const canvas=el.parentElement;
  const r=el.getBoundingClientRect();
  drag={ el, canvas, fromSheet:+canvas.dataset.sheet, pi:+el.dataset.pi,
         piece:layout[+canvas.dataset.sheet].pieces[+el.dataset.pi],
         offX:e.clientX-r.left, offY:e.clientY-r.top, w:r.width, h:r.height,
         startX:e.clientX, startY:e.clientY, lastX:e.clientX, lastY:e.clientY,
         lifted:false, pointerId:e.pointerId };
  try{ el.setPointerCapture(e.pointerId); }catch(_){}
  el.classList.add('armed');
  drag.timer=setTimeout(lift, HOLD_MS);
  document.addEventListener('pointermove',onDrag);
  document.addEventListener('pointerup',endDrag);
  document.addEventListener('pointercancel',cancelDrag);
}

function lift(){
  if(!drag) return;
  drag.lifted=true;
  const el=drag.el;
  el.classList.remove('armed'); el.classList.add('lifting');
  if(navigator.vibrate) try{ navigator.vibrate(25); }catch(_){}
  el.style.position='fixed'; el.style.margin='0';
  el.style.width=drag.w+'px'; el.style.height=drag.h+'px';
  moveFixed(drag.lastX,drag.lastY);
  highlightTarget(drag.lastX,drag.lastY);
}

function moveFixed(x,y){ drag.el.style.left=(x-drag.offX)+'px'; drag.el.style.top=(y-drag.offY)+'px'; }

function highlightTarget(x,y){
  drag.el.style.pointerEvents='none';
  const t=document.elementFromPoint(x,y);
  drag.el.style.pointerEvents='';
  const tc=t?t.closest('.sheet-canvas'):null;
  liveCanvases.forEach(c=>c.classList.toggle('drop-target', c===tc));
}

function onDrag(e){
  if(!drag) return;
  drag.lastX=e.clientX; drag.lastY=e.clientY;
  if(!drag.lifted){
    if(Math.hypot(e.clientX-drag.startX, e.clientY-drag.startY)>MOVE_TOL) cancelDrag();
    return;
  }
  e.preventDefault();
  moveFixed(e.clientX,e.clientY);
  highlightTarget(e.clientX,e.clientY);
}

function cancelDrag(){
  if(!drag) return;
  clearTimeout(drag.timer);
  drag.el.classList.remove('armed','lifting');
  document.removeEventListener('pointermove',onDrag);
  document.removeEventListener('pointerup',endDrag);
  document.removeEventListener('pointercancel',cancelDrag);
  drag=null;
}

function overlapsAny(sheetIdx, piece, x, y, exceptIdx){
  const ps=layout[sheetIdx].pieces;
  for(let i=0;i<ps.length;i++){
    if(i===exceptIdx) continue;
    const o=ps[i];
    if(x < o.x+o.l && x+piece.l > o.x && y < o.y+o.w && y+piece.w > o.y) return true;
  }
  return false;
}
function findFreeSpot(sheetIdx, piece, wx, wy, exceptIdx){
  if(!overlapsAny(sheetIdx,piece,wx,wy,exceptIdx)) return {x:wx,y:wy};
  const step=2, maxX=settings.L-piece.l, maxY=settings.W-piece.w;
  let best=null, bestD=Infinity;
  for(let gy=0; gy<=maxY+0.001; gy+=step){
    for(let gx=0; gx<=maxX+0.001; gx+=step){
      if(!overlapsAny(sheetIdx,piece,gx,gy,exceptIdx)){
        const d=(gx-wx)*(gx-wx)+(gy-wy)*(gy-wy);
        if(d<bestD){ bestD=d; best={x:gx,y:gy}; }
      }
    }
  }
  return best;
}

function magnetSnap(sheetIdx, piece, nx, ny, exceptIdx){
  const ps=layout[sheetIdx].pieces, kerf=settings.kerf||0;
  const maxX=settings.L-piece.l, maxY=settings.W-piece.w;
  const cand=[];
  const add=(x,y)=>{
    x=Math.max(0,Math.min(x,maxX)); y=Math.max(0,Math.min(y,maxY));
    cand.push({x,y});
  };
  add(0,0); add(maxX,0); add(0,maxY); add(maxX,maxY);
  ps.forEach((o,i)=>{ if(i===exceptIdx) return;
    const right=o.x+o.l+kerf, left=o.x-piece.l-kerf;
    const below=o.y+o.w+kerf, above=o.y-piece.w-kerf;
    const yTop=o.y, yBot=o.y+o.w-piece.w;
    const xLeft=o.x, xRight=o.x+o.l-piece.l;
    add(right,yTop); add(right,yBot);
    add(left,yTop);  add(left,yBot);
    add(xLeft,below);add(xRight,below);
    add(xLeft,above);add(xRight,above);
  });
  let best=null, bd=Infinity;
  for(const c of cand){
    if(c.x<-0.01||c.x>maxX+0.01||c.y<-0.01||c.y>maxY+0.01) continue;
    if(overlapsAny(sheetIdx,piece,c.x,c.y,exceptIdx)) continue;
    const d=(c.x-nx)*(c.x-nx)+(c.y-ny)*(c.y-ny);
    if(d<bd){ bd=d; best=c; }
  }
  return best;
}

function endDrag(e){
  if(!drag) return;
  clearTimeout(drag.timer);
  document.removeEventListener('pointermove',onDrag);
  document.removeEventListener('pointerup',endDrag);
  document.removeEventListener('pointercancel',cancelDrag);
  liveCanvases.forEach(c=>c.classList.remove('drop-target'));

  if(!drag.lifted){
    drag.el.classList.remove('armed'); drag=null; return;
  }

  const el=drag.el, piece=drag.piece;
  el.style.pointerEvents='none';
  const target=document.elementFromPoint(drag.lastX,drag.lastY);
  el.style.pointerEvents='';
  const tCanvas=target?target.closest('.sheet-canvas'):null;

  if(tCanvas){
    const toSheet=+tCanvas.dataset.sheet;
    if(piece.l>settings.L+0.01 || piece.w>settings.W+0.01){
      toast('⚠️ القطعة أكبر من اللوح — رُفض الإفلات');
    } else {
      const cr=tCanvas.getBoundingClientRect();
      const scale=tCanvas.clientWidth/settings.L;
      let nx=(drag.lastX-cr.left-drag.offX)/scale;
      let ny=(drag.lastY-cr.top-drag.offY)/scale;
      nx=Math.max(0,Math.min(nx, settings.L-piece.l));
      ny=Math.max(0,Math.min(ny, settings.W-piece.w));
      const except = (toSheet===drag.fromSheet) ? drag.pi : -1;
      let pos = magnetSnap(toSheet, piece, nx, ny, except);
      if(!pos) pos = findFreeSpot(toSheet, piece, nx, ny, except);
      if(!pos){
        toast('⚠️ لا يوجد مكان كافٍ في هذا اللوح');
      } else {
        piece.x=Math.round(pos.x*10)/10; piece.y=Math.round(pos.y*10)/10;
        if(toSheet!==drag.fromSheet){
          layout[drag.fromSheet].pieces.splice(drag.pi,1);
          layout[toSheet].pieces.push(piece);
          layout=layout.filter(s=>s.pieces.length>0);
        }
      }
    }
  }
  el.classList.remove('lifting'); el.style.position=''; el.style.pointerEvents='';
  drag=null;
  refreshLive();
}

function refreshLive(){
  const scrollY=window.scrollY;
  renderResults();
  window.scrollTo(0,scrollY);
}

/* ---------------- رسم المخطط على Canvas حقيقي ---------------- */
function _haloText(ctx,text,x,y,color,halo){
  ctx.save();
  ctx.lineJoin='round';
  ctx.lineWidth=3; ctx.strokeStyle=halo||'#ffffff';
  ctx.strokeText(text,x,y);
  ctx.fillStyle=color||'#0f2233';
  ctx.fillText(text,x,y);
  ctx.restore();
}
function _roundRect(ctx,x,y,w,h,r){
  r=Math.max(0,Math.min(r,w/2,h/2));
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function _band(ctx,x,y,w,h){
  ctx.save(); ctx.fillStyle='#0f766e';
  _roundRect(ctx,x,y,w,h,Math.min(w,h)/2); ctx.fill();
  ctx.restore();
}
function drawSheetToCanvasEl(sheet, idx, s){
  const MR=44, MB=40;   // هوامش أكبر لمنع التداخل
  const cv=document.createElement('canvas');
  const Wpx=Math.max(1,Math.round(settings.L*s)), Hpx=Math.max(1,Math.round(settings.W*s));
  const dpr=2;
  cv.width=(Wpx+MR)*dpr; cv.height=(Hpx+MB)*dpr;
  cv.style.width='100%'; cv.style.height='auto'; cv.style.display='block';
  const ctx=cv.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.direction='ltr';
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,Wpx+MR,Hpx+MB);
  // إطار خارجي محذوف
  ctx.textAlign='center'; ctx.textBaseline='middle';
  recomputeWaste(sheet).forEach(w=>{
    const x=w.x*s,y=w.y*s,ww=w.w*s,hh=w.h*s;
    if(ww<=0||hh<=0) return;
    ctx.save();
    ctx.setLineDash([5,4]); ctx.lineWidth=1; ctx.strokeStyle='#cbd3dc';
    ctx.strokeRect(x+0.5,y+0.5,ww-1,hh-1);
    ctx.restore();
    if(ww>30&&hh>22){
      ctx.font='500 15px Cairo, Arial, sans-serif';
      _haloText(ctx, fmtNum(w.w)+'', x+ww/2, y+11, '#475569', '#ffffff');
      ctx.save(); ctx.translate(x+11, y+hh/2); ctx.rotate(-Math.PI/2);
      _haloText(ctx, fmtNum(w.h)+'', 0, 0, '#475569', '#ffffff'); ctx.restore();
    }
  });
  sheet.pieces.forEach((p,pi)=>{
    const x=p.x*s,y=p.y*s,pw=p.l*s,ph=p.w*s;
    ctx.fillStyle=palette[pi % palette.length];
    ctx.fillRect(x,y,pw,ph);
    ctx.lineWidth=1; ctx.strokeStyle='rgba(0,0,0,.35)';
    ctx.strokeRect(x+0.5,y+0.5,Math.max(0,pw-1),Math.max(0,ph-1));
    const de=displayEdges(p); const ins=2.5, th=2.5, mg=Math.min(5, pw/4, ph/4);
    if(de.t) _band(ctx, x+mg, y+ins, Math.max(2,pw-2*mg), th);
    if(de.b) _band(ctx, x+mg, y+ph-ins-th, Math.max(2,pw-2*mg), th);
    if(de.l) _band(ctx, x+ins, y+mg, th, Math.max(2,ph-2*mg));
    if(de.r) _band(ctx, x+pw-ins-th, y+mg, th, Math.max(2,ph-2*mg));
    ctx.font='500 20px Cairo, Arial, sans-serif';
    if(pw>20) _haloText(ctx, fmtNum(p.l)+'', x+pw/2, y+18, '#0f2233', '#ffffff');
    if(ph>20){ ctx.save(); ctx.translate(x+18, y+ph/2); ctx.rotate(-Math.PI/2);
      _haloText(ctx, fmtNum(p.w)+'', 0, 0, '#0f2233', '#ffffff'); ctx.restore(); }
    const small=(pw<52||ph<32);
    if(!small && p.name){
      ctx.font='500 18px Cairo, Arial, sans-serif';
      _haloText(ctx, p.name+(p.rot?' ⟳':''), x+pw/2, y+ph/2, '#475569', '#ffffff');
    }
  });
  ctx.save();
  ctx.strokeStyle='#a8706f'; ctx.fillStyle='#a8706f'; ctx.lineWidth=1.2;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const by=Hpx+22;   // مسافة أكبر للمسطرة السفلية
  ctx.beginPath(); ctx.moveTo(0,by); ctx.lineTo(Wpx,by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,by-4); ctx.lineTo(0,by+4); ctx.moveTo(Wpx,by-4); ctx.lineTo(Wpx,by+4); ctx.stroke();
  ctx.font='600 16px Cairo, Arial, sans-serif';
  const lt=fmtNum(settings.L)+''; const ltw=ctx.measureText(lt).width;
  ctx.fillStyle='#ffffff'; ctx.fillRect(Wpx/2-ltw/2-5, by-10, ltw+10, 20);
  ctx.fillStyle='#a8706f'; ctx.fillText(lt, Wpx/2, by);
  const rx=Wpx+22;   // مسافة أكبر للمسطرة الجانبية
  ctx.beginPath(); ctx.moveTo(rx,0); ctx.lineTo(rx,Hpx); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx-4,0); ctx.lineTo(rx+4,0); ctx.moveTo(rx-4,Hpx); ctx.lineTo(rx+4,Hpx); ctx.stroke();
  ctx.save(); ctx.translate(rx, Hpx/2); ctx.rotate(-Math.PI/2);
  const wt=fmtNum(settings.W)+''; const wtw=ctx.measureText(wt).width;
  ctx.fillStyle='#ffffff'; ctx.fillRect(-wtw/2-5,-10,wtw+10,20);
  ctx.fillStyle='#a8706f'; ctx.fillText(wt,0,0); ctx.restore();
  ctx.restore();
  return cv;
}

/* ---------------- تصدير PDF (تصميم أنيق + مؤشر تقدم) ---------------- */
async function doExportPDF(opts){
  opts=opts||{summary:true,sheetData:true,cutOrder:true,banding:true,costs:true};
  if(!layout||!layout.length){ toast('قم بالتحسين أولاً'); return; }
  showProgress(3,'جارٍ التحضير…');
  await _sleep(30);
  await ensurePdfLibs();
  showProgress(12,'تحميل المكتبات…');
  const LOGO=await logoDataUrl();
  const t=totals(); const rep=$('#pdfReport'); rep.innerHTML='';
  const sheetsCost=t.sheets*(settings.sheetPrice||0);
  const cutCost=t.sheets*(settings.cutFee||0);
  const grand=sheetsCost+cutCost+t.cost;
  const colorMap={};
  const today=new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const m2=(cm2)=>(cm2/10000).toLocaleString('en',{maximumFractionDigits:2});

  const headerHTML=(subtitle)=>`
    <div class="rpt-head">
      ${LOGO?`<img src="${LOGO}" class="rpt-logo">`:''}
      <div class="rpt-head-txt">
        <div class="rpt-brand">IQ Panel</div>
        <div class="rpt-sub">${subtitle}</div>
      </div>
      <div class="rpt-date">${today}</div>
    </div>`;

  if(opts.summary){
    const summary=document.createElement('div'); summary.className='pdf-page rpt';
    const card=(label,val,cls='')=>`
      <div class="rpt-card ${cls}">
        <div class="rpt-card-v">${val}</div>
        <div class="rpt-card-l">${label}</div>
      </div>`;
    const cards=`
      <div class="rpt-cards">
        ${card('الألواح المستخدمة', t.sheets)}
        ${card('إجمالي القطع', t.count)}
        ${card('عمليات القص', t.cuts)}
        ${card('الاستفادة', t.util.toFixed(1)+'%','ok')}
        ${card('الهدر', t.waste.toFixed(1)+'%','warn')}
        ${card('حرف التلبيس', t.meters.toFixed(1)+' م')}
      </div>`;

    let typeRows=Object.entries(t.byType).map(([k,v],i)=>
      `<tr class="${i%2?'alt':''}"><td>${k}</td><td>${v.m.toFixed(2)} م</td><td>$${v.cost.toFixed(2)}</td></tr>`).join('');
    const bandingBlock = opts.banding && typeRows ? `
      <h3 class="rpt-h">تفصيل التلبيس حسب النوع</h3>
      <table class="rpt-table">
        <thead><tr><th>النوع</th><th>الأمتار</th><th>التكلفة</th></tr></thead>
        <tbody>${typeRows}</tbody>
      </table>` : '';

    const costsBlock = opts.costs ? `
      <h3 class="rpt-h">التكاليف</h3>
      <table class="rpt-table rpt-costs">
        <tbody>
          ${rrow('سعر اللوح الواحد', '$'+(settings.sheetPrice||0).toFixed(2))}
          ${rrow('تكلفة الألواح ('+t.sheets+' لوح)', '$'+sheetsCost.toFixed(2))}
          ${rrow('أجور القص ('+t.sheets+' لوح)', '$'+cutCost.toFixed(2))}
          ${rrow('تكلفة حرف التلبيس', '$'+t.cost.toFixed(2))}
          <tr class="rpt-grand"><td>التكلفة الإجمالية للمشروع</td><td>$${grand.toFixed(2)}</td></tr>
        </tbody>
      </table>` : '';

    summary.innerHTML=`
      ${headerHTML(settings.planName?('مشروع: '+settings.planName):'تقرير مشروع القص')}
      ${cards}
      <h3 class="rpt-h">تفاصيل المشروع</h3>
      <table class="rpt-table rpt-details">
        <tbody>
          ${rrow('اللوح الخام', settings.sheetName+' — '+settings.L+' × '+settings.W+' سم')}
          ${rrow('المساحة الكلية', m2(t.area)+' م²')}
          ${rrow('المساحة المستخدمة', m2(t.used)+' م²')}
          ${rrow('سُمك المنشار (الحرف)', settings.kerf+' سم')}
          ${rrow('اتجاه القص', cutDirLabel(settings.cutDir))}
        </tbody>
      </table>
      ${bandingBlock}
      ${costsBlock}`;
    rep.appendChild(summary);
  }
  showProgress(25,'تجهيز المخططات…');

  groupSheets().forEach((g)=>{
    const sh=g.sheet, i=g.idx, _cnt=g.count;
    const st=sheetStats(sh);
    const page=document.createElement('div'); page.className='pdf-page rpt';
    const _title=_cnt>1
      ? `ألواح متطابقة ×${_cnt} (أرقام ${g.idxs.map(x=>x+1).join('، ')})`
      : `اللوح رقم ${i+1}`;

    page.innerHTML = headerHTML(_title+' — '+settings.sheetName+' '+settings.L+'×'+settings.W+' سم');

    const info=document.createElement('div');
    info.className='rpt-sheet-info';
    info.innerHTML=`
      <span><b>${st.count}</b> قطعة</span>
      <span><b>${st.cuts}</b> قصّة</span>
      <span class="ok">استفادة <b>${st.util.toFixed(1)}%</b></span>
      <span class="warn">هدر <b>${st.waste.toFixed(1)}%</b></span>
      <span>تلبيس <b>${st.meters.toFixed(2)} م</b></span>
      ${_cnt>1?`<span class="mult">×${_cnt} ألواح</span>`:''}`;
    page.appendChild(info);

    const wrap=document.createElement('div'); wrap.className='rpt-layout';

    const imgCol=document.createElement('div'); imgCol.className='rpt-img-col';
    const {block}=buildSheetCanvas(sh,i,colorMap,false,_cnt);
    block.style.cssText='box-shadow:none;border:none;padding:0;background:transparent';
    const _hd=block.querySelector('.sheet-head'); if(_hd) _hd.style.display='none';
    block.querySelectorAll('.ruler-x,.ruler-y').forEach(r=>r.style.display='none');
    const _stg=block.querySelector('.stage'); if(_stg) _stg.style.padding='0';
    const _host=block.querySelector('.sheet-canvas');
    _host.style.height='auto'; _host.style.overflow='visible'; _host.innerHTML='';
    _host.appendChild(drawSheetToCanvasEl(sh,i,5));
    imgCol.appendChild(block);

    const dataCol=document.createElement('div'); dataCol.className='rpt-data-col';

    if(opts.cutOrder){
      const grp={};
      sh.pieces.forEach(p=>{
        const k=sizeKey(p);
        if(!grp[k]) grp[k]={
          l:(p.origL!=null?p.origL:p.l), w:(p.origW!=null?p.origW:p.w),
          name:p.name||'', band:bandById(p.bandId).name, n:0
        };
        grp[k].n++;
      });
      let rows=Object.values(grp).map((g,idx)=>`
        <tr class="${idx%2?'alt':''}">
          <td><b>${g.l}×${g.w}</b></td>
          <td class="c">${g.n}</td>
          <td>${g.name||'—'}</td>
          <td class="sm">${g.band}</td>
        </tr>`).join('');
      dataCol.innerHTML=`
        <h3 class="rpt-h rpt-h-sm">قائمة القطع</h3>
        <table class="rpt-table rpt-pieces">
          <thead><tr><th>المقاس (سم)</th><th class="c">العدد</th><th>الاسم</th><th>التلبيس</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    if(opts.sheetData){
      const L=(label,val)=>`<div class="rpt-kv"><span>${label}</span><b>${val}</b></div>`;
      const det=document.createElement('div');
      det.innerHTML=`
        <h3 class="rpt-h rpt-h-sm">بيانات اللوح</h3>
        <div class="rpt-kv-box">
          ${_cnt>1?L('ألواح متطابقة','×'+_cnt):''}
          ${L('اتجاه القص', cutDirLabel(settings.cutDir))}
          ${L('عدد القطع', st.count)}
          ${L('عمليات القص', st.cuts)}
          ${L('الاستفادة','<span class="okc">'+st.util.toFixed(1)+'%</span>')}
          ${L('الهدر','<span class="warnc">'+st.waste.toFixed(1)+'%</span>')}
          ${L('أمتار التلبيس', st.meters.toFixed(2)+' م')}
          ${opts.costs?L('تكلفة التلبيس','$'+st.cost.toFixed(2)):''}
        </div>`;
      dataCol.appendChild(det);
    }

    wrap.appendChild(imgCol); wrap.appendChild(dataCol);
    page.appendChild(wrap);
    rep.appendChild(page);
  });

  const { jsPDF }=window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  const pw=210, ph=297, margin=8;
  const pagesEls=rep.querySelectorAll('.pdf-page');
  const total=pagesEls.length||1;
  for(let i=0;i<pagesEls.length;i++){
    showProgress(30 + (i/total)*60, `معالجة الصفحة ${i+1} من ${total}…`);
    await _sleep(20);
    const cv=await html2canvas(pagesEls[i],{scale:2,backgroundColor:'#ffffff',useCORS:true,allowTaint:false,imageTimeout:0});
    const img=cv.toDataURL('image/jpeg',0.92);
    const w=pw-margin*2; const h=cv.height*w/cv.width;
    if(i>0) pdf.addPage();
    let y=margin;
    if(h<=ph-margin*2){ pdf.addImage(img,'JPEG',margin,y,w,h); }
    else {
      let remaining=h, sy=0; const pageH=ph-margin*2;
      const ratio=cv.width/w;
      while(remaining>0){
        const sliceH=Math.min(pageH,remaining);
        const sCanvas=document.createElement('canvas');
        sCanvas.width=cv.width; sCanvas.height=sliceH*ratio;
        sCanvas.getContext('2d').drawImage(cv,0,sy*ratio,cv.width,sliceH*ratio,0,0,cv.width,sliceH*ratio);
        pdf.addImage(sCanvas.toDataURL('image/jpeg',0.92),'JPEG',margin,margin,w,sliceH);
        remaining-=sliceH; sy+=sliceH; if(remaining>0)pdf.addPage();
      }
    }
  }
  showProgress(94,'إنهاء الملف…');
  const base=(opts.name||settings.planName||'IQ-Panel-مخطط-القص').toString().trim().replace(/[\\/:*?"<>|]+/g,'-')||'IQ-Panel';
  const fname=base+'.pdf';
  try{
    const blob=pdf.output('blob');
    const url=URL.createObjectURL(blob);
    if(window._qpUrl){ try{ URL.revokeObjectURL(window._qpUrl); }catch(_){ } }
    window._qpUrl=url;
    try{ const a=document.createElement('a'); a.href=url; a.download=fname; document.body.appendChild(a); a.click(); a.remove(); }catch(_){}
    showProgress(100,'تم ✓');
    await _sleep(350);
    openPdfModal(url, fname);
    toast('✓ تم إنشاء ملف PDF');
  }catch(err){
    try{ pdf.save(fname); toast('✓ تم حفظ ملف PDF'); }
    catch(e2){ toast('تعذّر إنشاء الملف: '+(e2.message||e2)); }
  }
  hideProgress();
  rep.innerHTML='';
}

function openPdfOptions(){
  if(!layout||!layout.length){ toast('قم بالتحسين أولاً'); return; }
  const nm=$('#pdfName'); if(nm) nm.value=(settings&&settings.planName)||($('#planName')&&$('#planName').value)||'';
  $('#pdfOptModal').classList.remove('hidden');
}
function openPdfModal(url, fname){
  const m=$('#pdfModal');
  $('#pdfFrame').src=url;
  const dl=$('#pdfDownload'); dl.href=url; dl.setAttribute('download',fname);
  $('#pdfOpen').href=url;
  m.classList.remove('hidden');
}
function row(l,v){ return `<tr><td style="padding:6px;border-bottom:1px solid #eee;color:#64748b">${l}</td><td style="padding:6px;border-bottom:1px solid #eee;font-weight:700">${v}</td></tr>`; }
function rrow(l,v){ return `<tr><td>${l}</td><td class="rpt-val">${v}</td></tr>`; }

function resetProject(){
  if(!confirm('بدء مشروع جديد سيحذف كل البيانات الحالية (الاسم، الأنواع، القطع، الإعدادات والمخطط). هل تريد المتابعة؟')) return;
  try{ localStorage.removeItem(LS_KEY); }catch(_){}
  pieces=Array.from({length:10},()=>emptyPiece());
  sheetTypes=[{id:'s1',name:'لوح',l:null,w:null,qty:null,price:null}];
  activeSheetId='s1';
  layout=null; settings=null;
  const pn=$('#planName'); if(pn) pn.value='';
  const kf=$('#kerf'); if(kf) kf.value='';
  const cf=$('#cutFee'); if(cf) cf.value='';
  const cd=$('#cutDir'); if(cd) cd.value='length';
  showExtra=false; applyExtraToggleUI();
  renderSheetTable(); renderPieceTable(); renderResults();
  window.scrollTo(0,0);
  toast('✓ تم بدء مشروع جديد');
}

/* ---------------- ربط الأحداث ---------------- */
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
if(btnExtra){
  btnExtra.addEventListener('click',()=>{
    showExtra=!showExtra;
    applyExtraToggleUI();
    renderPieceTable();
  });
}
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
$('#pdfClose').addEventListener('click',()=>{ $('#pdfModal').classList.add('hidden'); $('#pdfFrame').src='about:blank'; });
$('#pdfPrint').addEventListener('click',()=>{ const f=$('#pdfFrame'); try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('استخدم زر التنزيل بدل الطباعة'); } });
$('#addSheet').addEventListener('click',()=>{ sheetTypes.push({id:nid(),name:'لوح',l:null,w:null,qty:null,price:null}); renderSheetTable(); });
$('#cutDir').addEventListener('change',()=>{ if(layout) optimize(); });

const emptyPiece=()=>({id:nid(),name:'',l:null,w:null,qty:null,bandId:bandTypes[0]?.id,edges:{t:false,b:false,l:false,r:false}});
const _saved=loadState();
if(!pieces.length){ for(let i=0;i<10;i++) pieces.push(emptyPiece()); }
if(_saved){
  const setV=(id,v)=>{ const el=$('#'+id); if(el!=null&&v!=null&&v!=='') el.value=v; };
  setV('planName',_saved.planName); setV('kerf',_saved.kerf); setV('cutFee',_saved.cutFee);
  if(_saved.cutDir){ const cd=$('#cutDir'); if(cd) cd.value=_saved.cutDir; }
}
applyExtraToggleUI();

renderSheetTable();
renderBandTable();
renderPieceTable();
if(layout&&layout.length) renderResults();

document.addEventListener('input', scheduleSave);
document.addEventListener('change', scheduleSave);

/* ========== Firebase Auth (جديد) ========== */
let currentUser = null;

function showAuthModal() {
  $('#authModal').classList.remove('hidden');
}
function hideAuthModal() {
  $('#authModal').classList.add('hidden');
  $('#authEmail').value = '';
  $('#authPassword').value = '';
  $('#authError').style.display = 'none';
}

$('#btnLogin').addEventListener('click', showAuthModal);
$('#authClose').addEventListener('click', hideAuthModal);

$('#authLoginBtn').addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  if(!email || !password) {
    $('#authError').textContent = 'الرجاء إدخال البريد وكلمة المرور';
    $('#authError').style.display = 'block';
    return;
  }
  try {
    await signInWithEmailAndPassword(window.auth, email, password);
    hideAuthModal();
    toast('✓ تم تسجيل الدخول');
  } catch(e) {
    $('#authError').textContent = 'خطأ: ' + e.message;
    $('#authError').style.display = 'block';
  }
});

$('#authSignupBtn').addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  if(!email || !password) {
    $('#authError').textContent = 'الرجاء إدخال البريد وكلمة المرور';
    $('#authError').style.display = 'block';
    return;
  }
  try {
    const cred = await createUserWithEmailAndPassword(window.auth, email, password);
    await setDoc(doc(window.db, 'users', cred.user.uid), {
      email: email,
      plan: 'free',
      createdAt: new Date()
    });
    hideAuthModal();
    toast('✓ تم إنشاء الحساب بنجاح');
  } catch(e) {
    $('#authError').textContent = 'خطأ: ' + e.message;
    $('#authError').style.display = 'block';
  }
});

$('#btnLogout').addEventListener('click', async () => {
  try {
    await signOut(window.auth);
    toast('✓ تم تسجيل الخروج');
  } catch(e) {
    toast('خطأ في الخروج: ' + e.message);
  }
});

onAuthStateChanged(window.auth, (user) => {
  currentUser = user;
  if (user) {
    $('#btnLogin').style.display = 'none';
    $('#btnLogout').style.display = '';
    console.log('مرحباً،', user.email);
  } else {
    $('#btnLogin').style.display = '';
    $('#btnLogout').style.display = 'none';
    showAuthModal();
  }
});
