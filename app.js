import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc,
  updateDoc, deleteDoc, orderBy,
  query, onSnapshot, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const db = getFirestore(initializeApp({
  apiKey:"AIzaSyCFUBsmpZkK4SzZFinK89nrl1dj28VCAYY",
  authDomain:"passagem-turno-3c668.firebaseapp.com",
  projectId:"passagem-turno-3c668",
  storageBucket:"passagem-turno-3c668.appspot.com",
  messagingSenderId:"942055408398",
  appId:"1:942055408398:web:05c846a291f2edf91e0d5f"
}));

const [CO, CH] = ['relatorios_abertos', 'relatorios'];

const MODOS=['Elétrico','Mecânico','Instrumental','Processo','Outro'];
const IMPACTOS=['Parada total','Redução de capacidade','Sem impacto'];
const TIPOS=['Corretiva','Paliativa','Preventiva','Substituição'];
const STATUS=['Concluída','Em andamento','Pendente'];
const SCLS={Concluída:'sc','Em andamento':'sa',Pendente:'sp'};
const SEMI={Concluída:'✅','Em andamento':'🔄',Pendente:'⏳'};

let nome='', openCache=[], histCache=[];
let activeOpenId=null;
let sheetTipo=null;
let editItemIdx=null;
let confCb=null;

// ── UTILS ─────────────────────────────────────────────────
function setSt(t,m){const e=document.getElementById('db-st');e.className='sbar sb-'+t;e.innerHTML=`<span class="puls"></span>${m}`;}
function showToast(msg,err){const t=document.getElementById('toast');t.textContent=msg;t.className='toast'+(err?' err':'');void t.offsetWidth;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2500);}

// ── NOME ──────────────────────────────────────────────────
window.saveNome=function(){
  const v=document.getElementById('f-nome').value.trim();
  if(!v){showToast('Informe seu nome.',1);return;}
  nome=v;try{localStorage.setItem('tn',v);}catch(e){}
  document.getElementById('nbanner').innerHTML=`<div class="nbanner"><span class="puls"></span>Logado como <strong>${v}</strong></div>`;
  showToast('Nome salvo!');
};

// ── HEADER TOGGLES ────────────────────────────────────────
window.selHdrT=function(b){
  b.closest('.tg').querySelectorAll('.tbn').forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
  onHeaderChange();
};

window.shSelT=function(b){
  const g=b.dataset.shgroup;
  document.querySelectorAll(`[data-shgroup="${g}"]`).forEach(x=>x.classList.remove('on'));
  b.classList.add('on');
};

function getShT(group){
  const a=document.querySelector(`[data-shgroup="${group}"].on`);
  return a?a.textContent.trim():null;
}
function setShT(group,val){
  document.querySelectorAll(`[data-shgroup="${group}"]`).forEach(b=>{
    b.classList.toggle('on',b.textContent.trim()===val);
  });
}

// ── SETOR / SELECT ────────────────────────────────────────
function refreshSel(){
  const sel=document.getElementById('f-sel');const cur=sel.value;
  sel.innerHTML='<option value="">— Carregar relatório aberto —</option>';
  openCache.forEach(r=>{
    const o=document.createElement('option');o.value=r.id;
    const df=r.data?new Date(r.data+'T12:00').toLocaleDateString('pt-BR'):'';
    o.textContent=`${r.setor||'Sem setor'} — ${df} ${r.turno||''}`;
    if(r.id===cur)o.selected=true;
    sel.appendChild(o);
  });
}

window.onSelChange=function(){
  const id=document.getElementById('f-sel').value;
  if(!id){
    activeOpenId=null;
    document.getElementById('auto-ind').style.display='none';
    renderItemsFromCache(null);
    updatePreview();
    return;
  }
  const r=openCache.find(x=>x.id===id);if(!r)return;
  activeOpenId=id;
  document.getElementById('f-data').value=r.data||'';
  document.getElementById('f-setor').value='';
  document.querySelectorAll('#f-turno .tbn').forEach(b=>b.classList.toggle('on',b.textContent.trim()===r.turno));
  renderItemsFromCache(r);
  updatePreview();
  document.getElementById('auto-ind').style.display='flex';
};

window.onHeaderChange=function(){
  updatePreview();
  if(activeOpenId) autoSyncHeader();
};

async function autoSyncHeader(){
  if(!activeOpenId)return;
  const data=document.getElementById('f-data').value;
  const turno=getHdrT();
  const setor=getSetor();
  try{await updateDoc(doc(db,CO,activeOpenId),{data,turno,setor,updatedAt:Date.now()});}
  catch(e){/* silent */}
}
function getHdrT(){const a=document.querySelector('#f-turno .tbn.on');return a?a.textContent.trim():null;}
function getSetor(){
  const n=document.getElementById('f-setor').value.trim();if(n)return n;
  if(activeOpenId){const r=openCache.find(x=>x.id===activeOpenId);return r?r.setor||'':'';}
  return'';
}

// ── RENDER ITEMS ──────────────────────────────────────────
function renderItemsFromCache(r){
  const list=document.getElementById('items-list');
  list.innerHTML='';
  if(!r)return;
  (r.itens||[]).forEach((it,idx)=>list.appendChild(makeItemRow(it,idx)));
  updatePreview();
}

function makeItemRow(it,idx){
  const isOcc=it.tipo==='occ';
  const dot=isOcc?'sdot-g':(it.status?{Concluída:'sdot-g','Em andamento':'sdot-b',Pendente:'sdot-r'}[it.status]||'sdot-m':'sdot-m');
  const sub=isOcc
    ?[it.modo,it.impacto,it.tipo_int].filter(Boolean).join(' · ')||'—'
    :`${it.desc||'—'} · ${SEMI[it.status]||''} ${it.status||'—'}`;
  const el=document.createElement('div');
  el.className=`item-row tipo-${it.tipo}`;
  el.dataset.idx=idx;
  el.innerHTML=`
    <span class="ibadge ${isOcc?'ib-o':'ib-a'}">${isOcc?'🔧':'📅'}</span>
    <div class="item-txt">
      <strong>${it.equip||'(sem equipamento)'}</strong>
      <span>${sub}${it.autor?' · <em>'+it.autor+'</em>':''}</span>
    </div>
    <span class="sdot ${dot}"></span>
    <div class="item-btns">
      <button class="btn btn-blue" style="padding:3px 8px;font-size:9px" onclick="editItem(${idx})">✏</button>
      <button class="btn btn-red" style="padding:3px 8px;font-size:9px" onclick="deleteItem(${idx})">✕</button>
    </div>`;
  return el;
}

window.editItem=function(idx){
  if(!activeOpenId)return;
  const r=openCache.find(x=>x.id===activeOpenId);if(!r)return;
  const it=(r.itens||[])[idx];if(!it)return;
  editItemIdx=idx;
  openSheet(it.tipo,it);
};

window.deleteItem=function(idx){
  if(!activeOpenId)return;
  askConf('Remover este item?',async()=>{
    const r=openCache.find(x=>x.id===activeOpenId);if(!r)return;
    const itens=[...(r.itens||[])];
    itens.splice(idx,1);
    try{
      await updateDoc(doc(db,CO,activeOpenId),{itens,updatedAt:Date.now()});
      showToast('Item removido.');
    }catch(e){showToast('Erro.',1);}
  });
};

// ── SHEET ─────────────────────────────────────────────────
window.openSheet=function(tipo,existing){
  if(!nome){showToast('Informe seu nome primeiro.',1);return;}
  const setor=document.getElementById('f-setor').value.trim();
  const selId=document.getElementById('f-sel').value;
  if(!setor&&!selId&&!activeOpenId){showToast('Selecione ou crie um setor primeiro.',1);return;}
  sheetTipo=tipo;
  const isOcc=tipo==='occ';
  document.getElementById('sh-title').textContent=isOcc?'🔧 Ocorrência':'📅 Atividade';
  document.getElementById('sh-title').className='sheet-title '+(isOcc?'st-occ':'st-ativ');
  document.getElementById('sh-save-btn').textContent=editItemIdx!==null?'✓ Salvar Alterações':'✓ Confirmar e Salvar';
  document.getElementById('sh-body').innerHTML=isOcc?buildOccForm(existing):buildAtivForm(existing);
  document.getElementById('ov-sheet').classList.add('on');
};

window.closeSheet=function(){
  document.getElementById('ov-sheet').classList.remove('on');
  sheetTipo=null;editItemIdx=null;
};

function buildOccForm(d){
  d=d||{};
  return`
  <div>
    <div class="slbl" style="margin-bottom:9px">Equipamento</div>
    <div class="fg"><label>Descrição do equipamento</label>
      <textarea id="sh-eq" rows="2" placeholder="Ex: Bomba centrífuga linha 3...">${d.equip||''}</textarea>
    </div>
  </div>
  <div class="divider"></div>
  <div style="display:flex;flex-direction:column;gap:11px">
    <div class="slbl">Falha</div>
    <div class="fg"><label>Sintoma observado</label>
      <textarea id="sh-sin" rows="2" placeholder="O que foi observado...">${d.sintoma||''}</textarea>
    </div>
    <div class="fg">
      <label>Modo de falha</label>
      <div class="tg">${MODOS.map(m=>`<button type="button" class="tbn${d.modo===m?' on':''}" data-shgroup="sh-modo" onclick="shSelT(this)">${m}</button>`).join('')}</div>
    </div>
    <div class="fg">
      <label>Impacto operacional</label>
      <div class="tg">${IMPACTOS.map(m=>`<button type="button" class="tbn${d.impacto===m?' on':''}" data-shgroup="sh-imp" onclick="shSelT(this)">${m}</button>`).join('')}</div>
    </div>
  </div>
  <div class="divider"></div>
  <div style="display:flex;flex-direction:column;gap:11px">
    <div class="slbl">Solução</div>
    <div class="fg">
      <label>Tipo de intervenção</label>
      <div class="tg">${TIPOS.map(m=>`<button type="button" class="tbn${d.tipo_int===m?' on':''}" data-shgroup="sh-tipo" onclick="shSelT(this)">${m}</button>`).join('')}</div>
    </div>
    <div class="fg"><label>Descrição da solução</label>
      <textarea id="sh-sol" rows="2" placeholder="Como foi resolvido...">${d.solucao||''}</textarea>
    </div>
  </div>`;
}

function buildAtivForm(d){
  d=d||{};
  return`
  <div>
    <div class="slbl" style="margin-bottom:9px">Atividade</div>
    <div class="fg"><label>Equipamento</label>
      <textarea id="sh-eq" rows="2" placeholder="Ex: Motor esteira 2...">${d.equip||''}</textarea>
    </div>
    <div class="fg" style="margin-top:10px"><label>Descrição da atividade</label>
      <textarea id="sh-desc" rows="2" placeholder="Descreva a atividade...">${d.desc||''}</textarea>
    </div>
  </div>
  <div class="divider"></div>
  <div class="fg">
    <label>Status</label>
    <div class="tg">${STATUS.map(s=>`<button type="button" class="tbn ${SCLS[s]}${d.status===s?' on':''}" data-shgroup="sh-status" onclick="shSelT(this)">${s}</button>`).join('')}</div>
  </div>`;
}

window.confirmSheet=async function(){
  const tipo=sheetTipo;const isOcc=tipo==='occ';
  const it={tipo,autor:nome};
  it.equip=(document.getElementById('sh-eq')?.value||'').trim();
  if(isOcc){
    it.sintoma=(document.getElementById('sh-sin')?.value||'').trim();
    it.modo=getShT('sh-modo');
    it.impacto=getShT('sh-imp');
    it.tipo_int=getShT('sh-tipo');
    it.solucao=(document.getElementById('sh-sol')?.value||'').trim();
  }else{
    it.desc=(document.getElementById('sh-desc')?.value||'').trim();
    it.status=getShT('sh-status');
  }
  if(!it.equip){showToast('Informe o equipamento.',1);return;}

  const btn=document.getElementById('sh-save-btn');
  btn.textContent='Salvando...';btn.disabled=true;

  try{
    if(!activeOpenId){
      await ensureOpenReport();
    }
    if(!activeOpenId){btn.textContent='✓ Confirmar e Salvar';btn.disabled=false;return;}

    const snap=await getDoc(doc(db,CO,activeOpenId));
    const current=snap.exists()?snap.data():{};
    const itens=[...(current.itens||[])];

    if(editItemIdx!==null){
      it.autor=itens[editItemIdx]?.autor||nome;
      itens[editItemIdx]=it;
    }else{
      itens.push(it);
    }

    await updateDoc(doc(db,CO,activeOpenId),{itens,updatedAt:Date.now(),editadoPor:nome});
    closeSheet();
    updatePreview();
    showToast(editItemIdx!==null?'✓ Item atualizado!':'✓ '+(isOcc?'Ocorrência':'Atividade')+' salva!');
  }catch(e){
    showToast('Erro: '+e.message,1);
    console.error(e);
  }finally{
    btn.textContent=editItemIdx!==null?'✓ Salvar Alterações':'✓ Confirmar e Salvar';
    btn.disabled=false;
  }
};

// ── AUTO-CREATE OPEN REPORT ───────────────────────────────
async function ensureOpenReport(){
  if(!nome){showToast('Informe seu nome.',1);return;}
  const setor=getSetor()||document.getElementById('f-setor').value.trim();
  if(!setor){showToast('Informe o setor.',1);return;}
  const data=document.getElementById('f-data').value;
  const turno=getHdrT();
  try{
    const ref=await addDoc(collection(db,CO),{setor,data,turno,itens:[],criadoEm:Date.now(),criadoPor:nome});
    activeOpenId=ref.id;
    document.getElementById('f-sel').value=ref.id;
    document.getElementById('f-setor').value='';
    document.getElementById('auto-ind').style.display='flex';
    showToast('Relatório criado automaticamente.');
  }catch(e){showToast('Erro ao criar relatório.',1);console.error(e);}
}

// ── CLOSE TO HISTORY ──────────────────────────────────────
window.closeToHist=async function(){
  if(!nome){showToast('Informe seu nome.',1);return;}
  const setor=getSetor();
  if(!setor){showToast('Informe o setor.',1);return;}
  askConf('Fechar e salvar definitivamente no Histórico?',async()=>{
    try{
      setSt('load','Salvando...');
      if(activeOpenId){
        const snap=await getDoc(doc(db,CO,activeOpenId));
        const r=snap.exists()?{id:activeOpenId,...snap.data()}:{};
        const data=document.getElementById('f-data').value;
        const turno=getHdrT();
        await deleteDoc(doc(db,CO,activeOpenId));
        await addDoc(collection(db,CH),{...r,data,turno,setor,fechadoPor:nome,fechadoEm:Date.now(),criadoEm:r.criadoEm||Date.now(),criadoPor:r.criadoPor||nome});
      }else{
        const data=document.getElementById('f-data').value;
        const turno=getHdrT();
        await addDoc(collection(db,CH),{setor,data,turno,itens:[],criadoEm:Date.now(),criadoPor:nome,fechadoPor:nome,fechadoEm:Date.now()});
      }
      setSt('ok','Conectado');showToast('✓ Salvo no histórico!');clearForm(true);
    }catch(e){setSt('err','Erro: '+e.message);showToast('Erro.',1);}
  });
};

// ── PREVIEW ───────────────────────────────────────────────
function getPreviewData(){
  const selId=document.getElementById('f-sel').value;
  const r=selId?openCache.find(x=>x.id===selId):null;
  const itens=r?.itens||[];
  return{
    data:document.getElementById('f-data').value,
    turno:getHdrT(),
    setor:getSetor(),
    itens
  };
}
function hdr(d){const df=d.data?new Date(d.data+'T12:00').toLocaleDateString('pt-BR'):'—';return`Setor: ${d.setor||'—'}  |  Data: ${df}  |  Turno: ${d.turno||'—'}`;}
function bOcc(d){
  const oc=(d.itens||[]).filter(x=>x.tipo==='occ');
  if(!oc.length)return'📋 *OCORRÊNCIAS DO TURNO*\n'+hdr(d)+'\n\nNenhuma ocorrência registrada.';
  let t=['📋 *OCORRÊNCIAS DO TURNO*',hdr(d)];
  oc.forEach((o,i)=>{t.push('\n─────────────────────');t.push(`🔧 *OCORRÊNCIA ${i+1}*`);t.push(`Equipamento: ${o.equip||'—'}`);t.push(`Sintoma: ${o.sintoma||'—'}`);t.push(`Modo de falha: ${o.modo||'—'}  |  Impacto: ${o.impacto||'—'}`);t.push(`Intervenção: ${o.tipo_int||'—'}`);t.push(`Solução: ${o.solucao||'—'}`);});
  t.push('─────────────────────');return t.join('\n');
}
function bAtiv(d){
  const av=(d.itens||[]).filter(x=>x.tipo==='ativ');
  if(!av.length)return'📅 *ATIVIDADES PROGRAMADAS*\n'+hdr(d)+'\n\nNenhuma atividade registrada.';
  let t=['📅 *ATIVIDADES PROGRAMADAS*',hdr(d)];
  av.forEach((a,i)=>{t.push('\n─────────────────────');t.push(`${SEMI[a.status]||'•'} *ATIVIDADE ${i+1}*`);t.push(`Equipamento: ${a.equip||'—'}`);t.push(`Atividade: ${a.desc||'—'}`);t.push(`Status: ${a.status||'—'}`);});
  t.push('─────────────────────');return t.join('\n');
}
function bFull(d){return bOcc(d)+'\n\n'+bAtiv(d);}

window.updatePreview=function(){
  const d=getPreviewData();
  document.getElementById('pb-o').textContent=bOcc(d);
  document.getElementById('pb-a').textContent=bAtiv(d);
  document.getElementById('pb-f').textContent=bFull(d);
};

// ── REALTIME ──────────────────────────────────────────────
function startRT(){
  onSnapshot(query(collection(db,CO),orderBy('criadoEm','desc')),snap=>{
    openCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('cnt-open').textContent=openCache.length;
    refreshSel();
    if(activeOpenId){
      const r=openCache.find(x=>x.id===activeOpenId);
      if(r)renderItemsFromCache(r);
    }
    updatePreview();
    if(document.getElementById('pg-abertos').classList.contains('on'))renderOpen();
    setSt('ok',`Conectado — ${openCache.length} aberto(s), ${histCache.length} no histórico`);
  },e=>setSt('err','Erro: '+e.message));

  onSnapshot(query(collection(db,CH),orderBy('criadoEm','desc')),snap=>{
    histCache=snap.docs.map(d=>({id:d.id,...d.data()}));
    document.getElementById('cnt-hist').textContent=histCache.length;
    if(document.getElementById('pg-hist').classList.contains('on'))renderHistory();
    setSt('ok',`Conectado — ${openCache.length} aberto(s), ${histCache.length} no histórico`);
  },e=>setSt('err','Erro: '+e.message));
}

// ── RENDER OPEN ───────────────────────────────────────────
function renderOpen(){
  const el=document.getElementById('open-list');
  if(!openCache.length){el.innerHTML=`<div class="empty"><div class="ico">◉</div><p>Nenhum relatório aberto.</p><p style="margin-top:5px;font-size:11px;color:var(--mut)">Preencha a aba Novo — o relatório é salvo automaticamente.</p></div>`;return;}
  el.innerHTML=openCache.map(r=>{
    const df=r.data?new Date(r.data+'T12:00').toLocaleDateString('pt-BR'):'Sem data';
    const oc=(r.itens||[]).filter(x=>x.tipo==='occ').length;
    const av=(r.itens||[]).filter(x=>x.tipo==='ativ').length;
    const rows=(r.itens||[]).slice(0,5).map(it=>{
      const isOcc=it.tipo==='occ';
      return`<div class="item-row tipo-${it.tipo}" style="background:var(--surf3)">
        <span class="ibadge ${isOcc?'ib-o':'ib-a'}">${isOcc?'🔧':'📅'}</span>
        <div class="item-txt"><strong>${it.equip||'—'}</strong><span>${isOcc?(it.sintoma||'—'):(it.desc||'—')}${it.autor?' · <em>'+it.autor+'</em>':''}</span></div>
        ${it.status?`<span>${SEMI[it.status]||''}</span>`:''}
      </div>`;
    }).join('');
    return`<div class="ocard">
      <div class="ocard-hd"><div style="flex:1"><div class="ocard-sector">${r.setor||'Sem setor'}</div><div class="ocard-meta">${df} · ${r.turno||'?'} · por ${r.criadoPor||'—'}</div></div>
      <div class="otags">${oc?`<span class="tag tag-o">🔧 ${oc}</span>`:''} ${av?`<span class="tag tag-a">📅 ${av}</span>`:''}</div></div>
      ${rows?`<div class="ocard-items">${rows}</div>`:''}
      <div class="ocard-actions">
        <button class="btn btn-blue" onclick="contribuir('${r.id}')">➕ Contribuir</button>
        <button class="btn btn-grn" onclick="viewOpen('${r.id}')">👁 Ver</button>
        <button class="btn btn-acc" onclick="fecharOpen('${r.id}')">✓ Fechar</button>
        <button class="btn btn-red" onclick="delOpen('${r.id}')" >🗑</button>
      </div></div>`;
  }).join('');
}

window.contribuir=function(id){
  const r=openCache.find(x=>x.id===id);if(!r)return;
  showPg('novo',document.querySelector('.tb'));
  document.getElementById('f-sel').value=id;
  onSelChange();
  showToast('Carregado — adicione ocorrências ou atividades.');
};
window.fecharOpen=function(id){
  const r=openCache.find(x=>x.id===id);if(!r)return;
  if(!nome){showToast('Informe seu nome.',1);return;}
  askConf('Mover este relatório para o Histórico?',async()=>{
    try{await deleteDoc(doc(db,CO,id));await addDoc(collection(db,CH),{...r,fechadoPor:nome,fechadoEm:Date.now()});showToast('Fechado e salvo!');}
    catch(e){showToast('Erro.',1);}
  });
};
window.delOpen=function(id){
  askConf('Excluir este relatório aberto?',async()=>{
    try{
      await deleteDoc(doc(db,CO,id));
      showToast('Excluído.');
    }catch(e){
      showToast('Erro: '+e.message,1);
      console.error('delOpen',e);
    }
  });
};
window.viewOpen=function(id){const r=openCache.find(x=>x.id===id);if(r)openViewModal(r,false,false);};

// ── HISTORY ───────────────────────────────────────────────
function renderHistory(){
  const el=document.getElementById('hist-list');
  if(!histCache.length){el.innerHTML=`<div class="empty"><div class="ico">📋</div><p>Nenhum relatório no histórico.</p></div>`;return;}
  el.innerHTML=histCache.map(r=>{
    const df=r.data?new Date(r.data+'T12:00').toLocaleDateString('pt-BR'):'Sem data';
    const oc=(r.itens||[]).filter(x=>x.tipo==='occ').length;
    const av=(r.itens||[]).filter(x=>x.tipo==='ativ').length;
    return`<div class="hcard">
      <div class="hcard-hd" onclick="viewHist('${r.id}')"><div style="flex:1"><div class="hdate">${r.setor||'Sem setor'} — ${df}</div><div class="hsub">${r.turno||'?'} · ${r.criadoPor||'—'}${r.fechadoPor?' · fechado: '+r.fechadoPor:''}</div></div>
      <div class="htags">${r.turno?`<span class="tag tag-t">${r.turno}</span>`:''} ${oc?`<span class="tag tag-o">🔧 ${oc}</span>`:''} ${av?`<span class="tag tag-a">📅 ${av}</span>`:''}</div></div>
      <div class="hcard-foot">
        <button class="btn btn-grn" onclick="viewHist('${r.id}')">👁 Ver</button>
        <button class="btn btn-blue" onclick="reabrirHist('${r.id}')">↩ Reabrir</button>
        <button class="btn btn-red" onclick="delHist('${r.id}')">🗑 Excluir</button>
      </div>
    </div>`;
  }).join('');
}

window.viewHist=function(id){const r=histCache.find(x=>x.id===id);if(r)openViewModal(r,true,false);};

window.delHist=function(id){
  askConf('Excluir este relatório do histórico?',async()=>{
    try{
      await deleteDoc(doc(db,CH,id));
      showToast('Excluído.');
    }catch(e){
      showToast('Erro: '+e.message,1);
      console.error('delHist',e);
    }
  });
};

// NOVO: Reabrir relatório do histórico como relatório aberto
window.reabrirHist=async function(id){
  const r=histCache.find(x=>x.id===id);if(!r)return;
  if(!nome){showToast('Informe seu nome primeiro.',1);return;}
  askConf('Mover este relatório de volta para Abertos?',async()=>{
    try{
      // Cria novo documento em relatorios_abertos com dados do histórico
      const {fechadoPor,fechadoEm,...dados}=r;
      const ref=await addDoc(collection(db,CO),{
        ...dados,
        reabertoEm:Date.now(),
        reaabertoPor:nome,
        criadoEm:dados.criadoEm||Date.now()
      });
      // Remove do histórico
      await deleteDoc(doc(db,CH,id));
      showToast('Relatório reaberto!');
      // Carrega no formulário
      showPg('novo',document.querySelector('.tb'));
      setTimeout(()=>{
        document.getElementById('f-sel').value=ref.id;
        onSelChange();
      },500);
    }catch(e){showToast('Erro ao reabrir.',1);console.error(e);}
  });
};

function openViewModal(r,canDel,canReopen){
  const df=r.data?new Date(r.data+'T12:00').toLocaleDateString('pt-BR'):'Sem data';
  document.getElementById('view-title').textContent=`${r.setor||'—'} — ${df} ${r.turno||''}`;
  document.getElementById('mt-o').textContent=bOcc(r);
  document.getElementById('mt-a').textContent=bAtiv(r);
  document.getElementById('mt-f').textContent=bFull(r);
  const db_btn=document.getElementById('mod-del-btn');
  db_btn.style.display=canDel?'':'none';
  if(canDel)db_btn.onclick=()=>{closeOv('ov-view');delHist(r.id);};
  resetMtabs();
  document.getElementById('ov-view').classList.add('on');
}

// ── HELPERS ───────────────────────────────────────────────
window.closeOv=function(id){document.getElementById(id).classList.remove('on');};
window.copyActivePrev=function(){const a=document.querySelector('.ipanel.on .pbox');if(a)navigator.clipboard.writeText(a.textContent).then(()=>showToast('✓ Copiado!')).catch(()=>showToast('Erro',1));};
window.copyActiveMod=function(){const a=document.querySelector('.mpanel.on .mbox');if(a)navigator.clipboard.writeText(a.textContent).then(()=>showToast('✓ Copiado!')).catch(()=>showToast('Erro',1));};
window.swItab=function(btn,pid){btn.closest('.card-bd').querySelectorAll('.itab').forEach(b=>b.classList.remove('on'));btn.closest('.card-bd').querySelectorAll('.ipanel').forEach(p=>p.classList.remove('on'));btn.classList.add('on');document.getElementById(pid).classList.add('on');};
window.swMtab=function(btn,pid){btn.closest('.modal-body').querySelectorAll('.mtab').forEach(b=>b.classList.remove('on'));btn.closest('.modal-body').querySelectorAll('.mpanel').forEach(p=>p.classList.remove('on'));btn.classList.add('on');document.getElementById(pid).classList.add('on');};
function resetMtabs(){document.querySelectorAll('.mtab').forEach((b,i)=>b.classList.toggle('on',i===0));document.querySelectorAll('.mpanel').forEach((p,i)=>p.classList.toggle('on',i===0));}

function askConf(msg,cb){confCb=cb;document.getElementById('conf-msg').textContent=msg;document.getElementById('conf-ok').onclick=async()=>{closeOv('ov-confirm');if(confCb)await confCb();};document.getElementById('ov-confirm').classList.add('on');}

window.clearForm=function(silent){
  if(!silent&&!confirm('Limpar formulário?'))return;
  activeOpenId=null;editItemIdx=null;
  document.getElementById('auto-ind').style.display='none';
  document.getElementById('f-data').value=new Date().toISOString().split('T')[0];
  document.querySelectorAll('#f-turno .tbn').forEach(b=>b.classList.remove('on'));
  document.getElementById('f-sel').value='';
  document.getElementById('f-setor').value='';
  document.getElementById('items-list').innerHTML='';
  updatePreview();
};

window.showPg=function(id,btn){
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  document.getElementById('pg-'+id).classList.add('on');
  if(btn)btn.classList.add('on');
  if(id==='abertos')renderOpen();
  if(id==='hist')renderHistory();
};

document.querySelectorAll('.ov').forEach(ov=>{
  if(ov.id==='ov-confirm')return; // confirmação só fecha por botão
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('on');});
});

// ── WHATSAPP ──────────────────────────────────────────────
let waCurrentType='full';

function getWaText(){
  const d=getPreviewData();
  if(waCurrentType==='occ')return bOcc(d);
  if(waCurrentType==='ativ')return bAtiv(d);
  return bFull(d);
}

window.openWaModal=function(){
  waCurrentType='full';
  document.querySelectorAll('[data-watype]').forEach(b=>b.classList.toggle('on',b.dataset.watype==='full'));
  document.getElementById('wa-preview').textContent=getWaText();
  document.getElementById('ov-wa').classList.add('on');
};

window.selWaType=function(btn){
  document.querySelectorAll('[data-watype]').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  waCurrentType=btn.dataset.watype;
  document.getElementById('wa-preview').textContent=getWaText();
};

window.sendWhatsApp=function(){
  const num=document.getElementById('wa-num').value.replace(/\D/g,'');
  if(!num||num.length<10){showToast('Informe um número válido.',1);return;}
  const url=`https://wa.me/${num}?text=${encodeURIComponent(getWaText())}`;
  window.open(url,'_blank');
  closeOv('ov-wa');
  showToast('WhatsApp aberto!');
};

// INIT
document.getElementById('f-data').value=new Date().toISOString().split('T')[0];
try{const n=localStorage.getItem('tn');if(n){nome=n;document.getElementById('f-nome').value=n;document.getElementById('nbanner').innerHTML=`<div class="nbanner"><span class="puls"></span>Logado como <strong>${n}</strong></div>`;}}catch(e){}
updatePreview();
startRT();

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
