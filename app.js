// ── SUPABASE ─────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SB_URL = 'https://tdpgaqiktinngiuptatq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkcGdhcWlrdGlubmdpdXB0YXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjUwNjAsImV4cCI6MjA5NDEwMTA2MH0.a76Kgj9Flj6NkasYETC5BXMoIhXMBoCUM-w2BqJBlS4';
const sb = createClient(SB_URL, SB_KEY);

const CO = 'relatorios_abertos';
const CH = 'relatorios';
const BUCKET = 'fotos';

// ── CONSTANTES ───────────────────────────────────────────
const MODOS    = ['Elétrico','Mecânico','Instrumental','Processo','Outro'];
const IMPACTOS = ['Parada total','Redução de capacidade','Sem impacto'];
const TIPOS    = ['Corretiva','Paliativa','Preventiva','Substituição'];
const STATUS   = ['Concluída','Em andamento','Pendente'];
const SCLS     = {Concluída:'sc','Em andamento':'sa',Pendente:'sp'};
const SEMI     = {Concluída:'✅','Em andamento':'🔄',Pendente:'⏳'};

// ── ESTADO ───────────────────────────────────────────────
let nome = '', openCache = [], histCache = [];
let activeOpenId = null, sheetTipo = null, editItemIdx = null, confCb = null;
let waCurrentType = 'full';
let sheetPhotos = [];   // [{file, dataUrl, storagePath?, url?}]
let realtimeSubs = [];

// ── UTILS ────────────────────────────────────────────────
function setSt(t, m) {
  const e = document.getElementById('db-st');
  e.className = 'sbar sb-' + t;
  e.innerHTML = `<span class="puls"></span>${m}`;
}
function showToast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  void t.offsetWidth; t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2500);
}

// ── NOME ─────────────────────────────────────────────────
window.saveNome = function () {
  const v = document.getElementById('f-nome').value.trim();
  if (!v) { showToast('Informe seu nome.', 1); return; }
  nome = v; try { localStorage.setItem('tn', v); } catch (e) {}
  document.getElementById('nbanner').innerHTML =
    `<div class="nbanner"><span class="puls"></span>Logado como <strong>${v}</strong></div>`;
  showToast('Nome salvo!');
};

// ── TOGGLES ──────────────────────────────────────────────
window.selHdrT = function (b) {
  b.closest('.tg').querySelectorAll('.tbn').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); onHeaderChange();
};
window.shSelT = function (b) {
  const g = b.dataset.shgroup;
  document.querySelectorAll(`[data-shgroup="${g}"]`).forEach(x => x.classList.remove('on'));
  b.classList.add('on');
};
function getShT(g) { const a = document.querySelector(`[data-shgroup="${g}"].on`); return a ? a.textContent.trim() : null; }
function getHdrT() { const a = document.querySelector('#f-turno .tbn.on'); return a ? a.textContent.trim() : null; }
function getSetor() {
  const n = document.getElementById('f-setor').value.trim(); if (n) return n;
  if (activeOpenId) { const r = openCache.find(x => x.id === activeOpenId); return r ? r.setor || '' : ''; }
  return '';
}

// ── SETOR SELECT ─────────────────────────────────────────
function refreshSel() {
  const sel = document.getElementById('f-sel'); const cur = sel.value;
  sel.innerHTML = '<option value="">— Carregar relatório aberto —</option>';
  openCache.forEach(r => {
    const o = document.createElement('option'); o.value = r.id;
    const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '';
    o.textContent = `${r.setor || 'Sem setor'} — ${df} ${r.turno || ''}`;
    if (r.id === cur) o.selected = true;
    sel.appendChild(o);
  });
}

window.onSelChange = function () {
  const id = document.getElementById('f-sel').value;
  if (!id) { activeOpenId = null; document.getElementById('auto-ind').style.display = 'none'; renderItemsFromCache(null); updatePreview(); return; }
  const r = openCache.find(x => x.id === id); if (!r) return;
  activeOpenId = id;
  document.getElementById('f-data').value = r.data || '';
  document.getElementById('f-setor').value = '';
  document.querySelectorAll('#f-turno .tbn').forEach(b => b.classList.toggle('on', b.textContent.trim() === r.turno));
  renderItemsFromCache(r); updatePreview();
  document.getElementById('auto-ind').style.display = 'flex';
};

window.onHeaderChange = function () { updatePreview(); if (activeOpenId) autoSyncHeader(); };

async function autoSyncHeader() {
  if (!activeOpenId) return;
  await sb.from(CO).update({
    data: document.getElementById('f-data').value,
    turno: getHdrT(), setor: getSetor(), updated_at: Date.now()
  }).eq('id', activeOpenId);
}

// ── RENDER ITEMS ─────────────────────────────────────────
function renderItemsFromCache(r) {
  const list = document.getElementById('items-list');
  list.innerHTML = '';
  if (!r) return;
  (r.itens || []).forEach((it, idx) => list.appendChild(makeItemRow(it, idx)));
  updatePreview();
}

function makeItemRow(it, idx) {
  const isOcc = it.tipo === 'occ';
  const dot = isOcc ? 'sdot-g' : ({ Concluída: 'sdot-g', 'Em andamento': 'sdot-b', Pendente: 'sdot-r' }[it.status] || 'sdot-m');
  const sub = isOcc ? [it.modo, it.impacto, it.tipo_int].filter(Boolean).join(' · ') || '—' : `${it.desc || '—'} · ${SEMI[it.status] || ''} ${it.status || '—'}`;
  const nF = (it.fotos || []).length;
  const el = document.createElement('div');
  el.className = `item-row tipo-${it.tipo}`; el.dataset.idx = idx;
  el.innerHTML = `
    <span class="ibadge ${isOcc ? 'ib-o' : 'ib-a'}">${isOcc ? '🔧' : '📅'}</span>
    <div class="item-txt">
      <strong>${it.equip || '(sem equipamento)'}</strong>
      <span>${sub}${it.autor ? ' · <em>' + it.autor + '</em>' : ''}</span>
      ${nF ? `<span class="photo-count">📷 ${nF} foto${nF > 1 ? 's' : ''}</span>` : ''}
    </div>
    <span class="sdot ${dot}"></span>
    <div class="item-btns">
      <button class="btn btn-blue" style="padding:3px 8px;font-size:9px" onclick="editItem(${idx})">✏</button>
      <button class="btn btn-red"  style="padding:3px 8px;font-size:9px" onclick="deleteItem(${idx})">✕</button>
    </div>`;
  return el;
}

window.editItem = function (idx) {
  if (!activeOpenId) return;
  const r = openCache.find(x => x.id === activeOpenId); if (!r) return;
  const it = (r.itens || [])[idx]; if (!it) return;
  editItemIdx = idx;
  sheetPhotos = (it.fotos || []).map(f => ({ url: f.url, storagePath: f.path, file: null, dataUrl: f.url }));
  openSheet(it.tipo, it);
};

window.deleteItem = function (idx) {
  if (!activeOpenId) return;
  askConf('Remover este item e suas fotos?', async () => {
    const r = openCache.find(x => x.id === activeOpenId); if (!r) return;
    const itens = [...(r.itens || [])];
    await Promise.all((itens[idx]?.fotos || []).map(f => deleteStorageFile(f.path)));
    itens.splice(idx, 1);
    const { error } = await sb.from(CO).update({ itens, updated_at: Date.now() }).eq('id', activeOpenId);
    if (error) showToast('Erro ao remover.', 1); else showToast('Item removido.');
  });
};

async function deleteStorageFile(path) {
  if (!path) return;
  await sb.storage.from(BUCKET).remove([path]);
}

// ── SHEET ────────────────────────────────────────────────
window.openSheet = function (tipo, existing) {
  if (!nome) { showToast('Informe seu nome primeiro.', 1); return; }
  const setor = document.getElementById('f-setor').value.trim();
  const selId = document.getElementById('f-sel').value;
  if (!setor && !selId && !activeOpenId) { showToast('Selecione ou crie um setor primeiro.', 1); return; }
  sheetTipo = tipo;
  if (editItemIdx === null) sheetPhotos = [];
  const isOcc = tipo === 'occ';
  document.getElementById('sh-title').textContent = isOcc ? '🔧 Ocorrência' : '📅 Atividade';
  document.getElementById('sh-title').className = 'sheet-title ' + (isOcc ? 'st-occ' : 'st-ativ');
  document.getElementById('sh-save-btn').textContent = editItemIdx !== null ? '✓ Salvar Alterações' : '✓ Confirmar e Salvar';
  document.getElementById('sh-body').innerHTML = (isOcc ? buildOccForm(existing) : buildAtivForm(existing)) + buildPhotoSection();
  renderSheetPhotos();
  document.getElementById('ov-sheet').classList.add('on');
};

window.closeSheet = function () {
  document.getElementById('ov-sheet').classList.remove('on');
  sheetTipo = null; editItemIdx = null; sheetPhotos = [];
};

function buildOccForm(d) {
  d = d || {};
  return `
  <div>
    <div class="slbl" style="margin-bottom:9px">Equipamento</div>
    <div class="fg"><label>Descrição do equipamento</label>
      <textarea id="sh-eq" rows="2" placeholder="Ex: Bomba centrífuga linha 3...">${d.equip || ''}</textarea>
    </div>
  </div>
  <div class="divider"></div>
  <div style="display:flex;flex-direction:column;gap:11px">
    <div class="slbl">Falha</div>
    <div class="fg"><label>Sintoma observado</label>
      <textarea id="sh-sin" rows="2" placeholder="O que foi observado...">${d.sintoma || ''}</textarea>
    </div>
    <div class="fg"><label>Modo de falha</label>
      <div class="tg">${MODOS.map(m => `<button type="button" class="tbn${d.modo === m ? ' on' : ''}" data-shgroup="sh-modo" onclick="shSelT(this)">${m}</button>`).join('')}</div>
    </div>
    <div class="fg"><label>Impacto operacional</label>
      <div class="tg">${IMPACTOS.map(m => `<button type="button" class="tbn${d.impacto === m ? ' on' : ''}" data-shgroup="sh-imp" onclick="shSelT(this)">${m}</button>`).join('')}</div>
    </div>
  </div>
  <div class="divider"></div>
  <div style="display:flex;flex-direction:column;gap:11px">
    <div class="slbl">Solução</div>
    <div class="fg"><label>Tipo de intervenção</label>
      <div class="tg">${TIPOS.map(m => `<button type="button" class="tbn${d.tipo_int === m ? ' on' : ''}" data-shgroup="sh-tipo" onclick="shSelT(this)">${m}</button>`).join('')}</div>
    </div>
    <div class="fg"><label>Descrição da solução</label>
      <textarea id="sh-sol" rows="2" placeholder="Como foi resolvido...">${d.solucao || ''}</textarea>
    </div>
  </div>`;
}

function buildAtivForm(d) {
  d = d || {};
  return `
  <div>
    <div class="slbl" style="margin-bottom:9px">Atividade</div>
    <div class="fg"><label>Equipamento</label>
      <textarea id="sh-eq" rows="2" placeholder="Ex: Motor esteira 2...">${d.equip || ''}</textarea>
    </div>
    <div class="fg" style="margin-top:10px"><label>Descrição da atividade</label>
      <textarea id="sh-desc" rows="2" placeholder="Descreva a atividade...">${d.desc || ''}</textarea>
    </div>
  </div>
  <div class="divider"></div>
  <div class="fg"><label>Status</label>
    <div class="tg">${STATUS.map(s => `<button type="button" class="tbn ${SCLS[s]}${d.status === s ? ' on' : ''}" data-shgroup="sh-status" onclick="shSelT(this)">${s}</button>`).join('')}</div>
  </div>`;
}

function buildPhotoSection() {
  return `
  <div class="divider"></div>
  <div>
    <div class="slbl" style="margin-bottom:9px">📷 Fotos</div>
    <div class="photo-upload-area" onclick="document.getElementById('sh-file-input').click()">
      <div style="font-size:32px">📷</div>
      <div class="photo-upload-text">Tirar foto ou escolher da galeria</div>
      <div class="photo-upload-sub">Câmera · Galeria · Sem limite de fotos</div>
    </div>
    <input type="file" id="sh-file-input" accept="image/*" multiple
      style="display:none" onchange="onPhotosSelected(event)">
    <div class="photo-grid" id="sh-photo-grid"></div>
  </div>`;
}

window.onPhotosSelected = function (e) {
  [...e.target.files].forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      sheetPhotos.push({ file, dataUrl: ev.target.result, url: null, storagePath: null });
      renderSheetPhotos();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
};

function renderSheetPhotos() {
  const grid = document.getElementById('sh-photo-grid'); if (!grid) return;
  if (!sheetPhotos.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = sheetPhotos.map((p, i) => `
    <div class="photo-thumb-wrap">
      <img class="photo-thumb" src="${p.dataUrl || p.url}" alt="Foto ${i + 1}">
      <button class="photo-remove" onclick="removeSheetPhoto(${i})">✕</button>
      ${!p.url ? '<div class="photo-pending">⏳ aguardando</div>' : ''}
    </div>`).join('');
}

window.removeSheetPhoto = function (i) {
  const p = sheetPhotos[i];
  if (p.storagePath && p.url) deleteStorageFile(p.storagePath);
  sheetPhotos.splice(i, 1);
  renderSheetPhotos();
};

async function uploadSheetPhotos(reportId, label) {
  const uploaded = [];
  for (let i = 0; i < sheetPhotos.length; i++) {
    const p = sheetPhotos[i];
    if (p.url && p.storagePath) { uploaded.push({ url: p.url, path: p.storagePath }); continue; }
    if (!p.file) continue;
    const path = `${reportId}/${label}_${Date.now()}_${i}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, p.file, { upsert: true });
    if (error) { console.error('Upload error:', error); continue; }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    uploaded.push({ url: data.publicUrl, path });
  }
  return uploaded;
}

// ── CONFIRM SHEET ────────────────────────────────────────
window.confirmSheet = async function () {
  const tipo = sheetTipo; const isOcc = tipo === 'occ';
  const it = { tipo, autor: nome };
  it.equip = (document.getElementById('sh-eq')?.value || '').trim();
  if (isOcc) {
    it.sintoma  = (document.getElementById('sh-sin')?.value || '').trim();
    it.modo     = getShT('sh-modo');
    it.impacto  = getShT('sh-imp');
    it.tipo_int = getShT('sh-tipo');
    it.solucao  = (document.getElementById('sh-sol')?.value || '').trim();
  } else {
    it.desc   = (document.getElementById('sh-desc')?.value || '').trim();
    it.status = getShT('sh-status');
  }
  if (!it.equip) { showToast('Informe o equipamento.', 1); return; }

  const btn = document.getElementById('sh-save-btn');
  btn.textContent = 'Enviando fotos...'; btn.disabled = true;

  try {
    if (!activeOpenId) await ensureOpenReport();
    if (!activeOpenId) return;

    const label = `${tipo}_${editItemIdx !== null ? editItemIdx : 'new'}_${Date.now()}`;
    it.fotos = await uploadSheetPhotos(activeOpenId, label);

    const { data: cur } = await sb.from(CO).select('itens').eq('id', activeOpenId).single();
    const itens = [...(cur?.itens || [])];

    if (editItemIdx !== null) {
      it.autor = itens[editItemIdx]?.autor || nome;
      itens[editItemIdx] = it;
    } else {
      itens.push(it);
    }

    const { error } = await sb.from(CO).update({ itens, updated_at: Date.now(), editado_por: nome }).eq('id', activeOpenId);
    if (error) throw error;
    closeSheet(); updatePreview();
    showToast(editItemIdx !== null ? '✓ Item atualizado!' : isOcc ? '✓ Ocorrência salva!' : '✓ Atividade salva!');
  } catch (e) {
    showToast('Erro: ' + e.message, 1); console.error(e);
  } finally {
    btn.textContent = editItemIdx !== null ? '✓ Salvar Alterações' : '✓ Confirmar e Salvar';
    btn.disabled = false;
  }
};

// ── ENSURE OPEN REPORT ───────────────────────────────────
async function ensureOpenReport() {
  if (!nome) { showToast('Informe seu nome.', 1); return; }
  const setor = getSetor() || document.getElementById('f-setor').value.trim();
  if (!setor) { showToast('Informe o setor.', 1); return; }
  const { data, error } = await sb.from(CO).insert({
    setor, data: document.getElementById('f-data').value,
    turno: getHdrT(), itens: [], criado_em: Date.now(), criado_por: nome
  }).select().single();
  if (error) { showToast('Erro ao criar relatório.', 1); return; }
  activeOpenId = data.id;
  document.getElementById('f-sel').value = data.id;
  document.getElementById('f-setor').value = '';
  document.getElementById('auto-ind').style.display = 'flex';
  openCache.unshift(data); refreshSel();
  showToast('Relatório criado automaticamente.');
}

// ── CLOSE TO HISTORY ─────────────────────────────────────
window.closeToHist = async function () {
  if (!nome) { showToast('Informe seu nome.', 1); return; }
  const setor = getSetor();
  if (!setor) { showToast('Informe o setor.', 1); return; }
  askConf('Fechar e salvar definitivamente no Histórico?', async () => {
    try {
      setSt('load', 'Salvando...');
      if (activeOpenId) {
        const { data: r } = await sb.from(CO).select('*').eq('id', activeOpenId).single();
        await sb.from(CO).delete().eq('id', activeOpenId);
        await sb.from(CH).insert({
          ...r, id: undefined,
          data: document.getElementById('f-data').value,
          turno: getHdrT(), setor,
          fechado_por: nome, fechado_em: Date.now(),
          criado_em: r.criado_em || Date.now(), criado_por: r.criado_por || nome
        });
      } else {
        await sb.from(CH).insert({
          setor, data: document.getElementById('f-data').value,
          turno: getHdrT(), itens: [],
          criado_em: Date.now(), criado_por: nome,
          fechado_por: nome, fechado_em: Date.now()
        });
      }
      setSt('ok', 'Conectado'); showToast('✓ Salvo no histórico!'); clearForm(true);
    } catch (e) { setSt('err', 'Erro: ' + e.message); showToast('Erro.', 1); }
  });
};

// ── ABRIR RELATÓRIO SEM OCORRÊNCIA ───────────────────────
window.openReportOnly = async function () {
  if (!nome) { showToast('Informe seu nome.', 1); return; }
  const setor = getSetor() || document.getElementById('f-setor').value.trim();
  if (!setor) { showToast('Informe o setor.', 1); return; }
  if (!document.getElementById('f-data').value) { showToast('Informe a data.', 1); return; }
  if (!getHdrT()) { showToast('Selecione o turno.', 1); return; }
  if (activeOpenId) { showToast('Já há um relatório aberto. Feche-o antes de abrir outro.', 1); return; }
  askConf(`Abrir relatório de "${setor}" sem ocorrências?`, async () => {
    try {
      setSt('load', 'Salvando...');
      const { data, error } = await sb.from(CO).insert({
        setor, data: document.getElementById('f-data').value,
        turno: getHdrT(), itens: [],
        criado_em: Date.now(), criado_por: nome
      }).select().single();
      if (error) throw error;
      activeOpenId = data.id;
      document.getElementById('f-sel').value = data.id;
      document.getElementById('f-setor').value = '';
      document.getElementById('auto-ind').style.display = 'flex';
      openCache.unshift(data); refreshSel();
      setSt('ok', 'Conectado');
      showToast('✓ Relatório aberto!');
    } catch (e) { setSt('err', 'Erro: ' + e.message); showToast('Erro: ' + e.message, 1); }
  });
};

// ── PREVIEW ──────────────────────────────────────────────
function getPreviewData() {
  const selId = document.getElementById('f-sel').value;
  const r = selId ? openCache.find(x => x.id === selId) : null;
  return { data: document.getElementById('f-data').value, turno: getHdrT(), setor: getSetor(), itens: r?.itens || [] };
}
function hdr(d) { const df = d.data ? new Date(d.data + 'T12:00').toLocaleDateString('pt-BR') : '—'; return `Setor: ${d.setor || '—'}  |  Data: ${df}  |  Turno: ${d.turno || '—'}`; }
function bOcc(d) {
  const oc = (d.itens || []).filter(x => x.tipo === 'occ');
  if (!oc.length) return '📋 *OCORRÊNCIAS DO TURNO*\n' + hdr(d) + '\n\nNenhuma ocorrência registrada.';
  let t = ['📋 *OCORRÊNCIAS DO TURNO*', hdr(d)];
  oc.forEach((o, i) => {
    t.push('\n─────────────────────');
    t.push(`🔧 *OCORRÊNCIA ${i + 1}*`);
    t.push(`Equipamento: ${o.equip || '—'}`);
    t.push(`Sintoma: ${o.sintoma || '—'}`);
    t.push(`Modo de falha: ${o.modo || '—'}  |  Impacto: ${o.impacto || '—'}`);
    t.push(`Intervenção: ${o.tipo_int || '—'}`);
    t.push(`Solução: ${o.solucao || '—'}`);
  });
  t.push('─────────────────────'); return t.join('\n');
}
function bAtiv(d) {
  const av = (d.itens || []).filter(x => x.tipo === 'ativ');
  if (!av.length) return '📅 *ATIVIDADES PROGRAMADAS*\n' + hdr(d) + '\n\nNenhuma atividade registrada.';
  let t = ['📅 *ATIVIDADES PROGRAMADAS*', hdr(d)];
  av.forEach((a, i) => {
    t.push('\n─────────────────────');
    t.push(`${SEMI[a.status] || '•'} *ATIVIDADE ${i + 1}*`);
    t.push(`Equipamento: ${a.equip || '—'}`);
    t.push(`Atividade: ${a.desc || '—'}`);
    t.push(`Status: ${a.status || '—'}`);
  });
  t.push('─────────────────────'); return t.join('\n');
}
function bFull(d) { return bOcc(d) + '\n\n' + bAtiv(d); }

window.updatePreview = function () {
  const pbo = document.getElementById('pb-o');
  if (!pbo) return; // preview removida da tela principal
  const d = getPreviewData();
  pbo.textContent = bOcc(d);
  document.getElementById('pb-a').textContent = bAtiv(d);
  document.getElementById('pb-f').textContent = bFull(d);
};

// ── REALTIME ─────────────────────────────────────────────
async function loadInitialData() {
  const { data: openData, error: e1 } = await sb.from(CO).select('*').order('criado_em', { ascending: false });
  if (e1) { setSt('err', 'Erro ao carregar dados.'); return; }
  openCache = openData || [];
  document.getElementById('cnt-open').textContent = openCache.length;
  refreshSel();
  if (activeOpenId) { const r = openCache.find(x => x.id === activeOpenId); if (r) renderItemsFromCache(r); }
  updatePreview();

  const { data: histData, error: e2 } = await sb.from(CH).select('*').order('criado_em', { ascending: false });
  if (e2) return;
  histCache = histData || [];
  document.getElementById('cnt-hist').textContent = histCache.length;
  await loadFcas();
  setSt('ok', `Conectado — ${openCache.length} aberto(s), ${histCache.length} no histórico`);
}

function startRT() {
  // Realtime para relatorios_abertos
  const sub1 = sb.channel('rt-open')
    .on('postgres_changes', { event: '*', schema: 'public', table: CO }, async () => {
      const { data } = await sb.from(CO).select('*').order('criado_em', { ascending: false });
      openCache = data || [];
      document.getElementById('cnt-open').textContent = openCache.length;
      refreshSel();
      if (activeOpenId) { const r = openCache.find(x => x.id === activeOpenId); if (r) renderItemsFromCache(r); }
      updatePreview();
      if (document.getElementById('pg-abertos').classList.contains('on')) renderOpen();
      setSt('ok', `Conectado — ${openCache.length} aberto(s), ${histCache.length} no histórico`);
    })
    .subscribe();

  // Realtime para histórico
  const sub2 = sb.channel('rt-hist')
    .on('postgres_changes', { event: '*', schema: 'public', table: CH }, async () => {
      const { data } = await sb.from(CH).select('*').order('criado_em', { ascending: false });
      histCache = data || [];
      document.getElementById('cnt-hist').textContent = histCache.length;
      if (document.getElementById('pg-hist').classList.contains('on')) renderHistory();
      setSt('ok', `Conectado — ${openCache.length} aberto(s), ${histCache.length} no histórico`);
    })
    .subscribe();

  realtimeSubs = [sub1, sub2];
  startFcaRT();
}

// ── RENDER OPEN ──────────────────────────────────────────
function renderOpen() {
  const el = document.getElementById('open-list');
  if (!openCache.length) {
    el.innerHTML = `<div class="empty"><div class="ico">◉</div><p>Nenhum relatório aberto.</p><p style="margin-top:5px;font-size:11px;color:var(--mut)">Preencha a aba Novo — salvo automaticamente.</p></div>`;
    return;
  }
  el.innerHTML = openCache.map(r => {
    const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : 'Sem data';
    const oc = (r.itens || []).filter(x => x.tipo === 'occ').length;
    const av = (r.itens || []).filter(x => x.tipo === 'ativ').length;
    const rows = (r.itens || []).slice(0, 5).map(it => {
      const isOcc = it.tipo === 'occ';
      return `<div class="item-row tipo-${it.tipo}" style="background:var(--surf3)">
        <span class="ibadge ${isOcc ? 'ib-o' : 'ib-a'}">${isOcc ? '🔧' : '📅'}</span>
        <div class="item-txt"><strong>${it.equip || '—'}</strong>
        <span>${isOcc ? (it.sintoma || '—') : (it.desc || '—')}${it.autor ? ' · <em>' + it.autor + '</em>' : ''}</span>
        ${it.fotos?.length ? `<span class="photo-count">📷 ${it.fotos.length}</span>` : ''}</div>
        ${it.status ? `<span>${SEMI[it.status] || ''}</span>` : ''}
      </div>`;
    }).join('');
    return `<div class="ocard">
      <div class="ocard-hd"><div style="flex:1">
        <div class="ocard-sector">${r.setor || 'Sem setor'}</div>
        <div class="ocard-meta">${df} · ${r.turno || '?'} · por ${r.criado_por || '—'}</div>
      </div>
      <div class="otags">
        ${oc ? `<span class="tag tag-o">🔧 ${oc}</span>` : ''}
        ${av ? `<span class="tag tag-a">📅 ${av}</span>` : ''}
      </div></div>
      ${rows ? `<div class="ocard-items">${rows}</div>` : ''}
      <div class="ocard-actions">
        <button class="btn btn-blue" onclick="contribuir('${r.id}')">➕ Contribuir</button>
        <button class="btn btn-grn"  onclick="viewOpen('${r.id}')">👁 Ver</button>
        <button class="btn btn-acc"  onclick="fecharOpen('${r.id}')">✓ Fechar</button>
        <button class="btn btn-red"  onclick="delOpen('${r.id}')">🗑</button>
      </div></div>`;
  }).join('');
}

window.contribuir = function (id) {
  showPg('novo', document.querySelector('.tb'));
  document.getElementById('f-sel').value = id;
  onSelChange();
  showToast('Carregado — adicione itens.');
};

window.fecharOpen = function (id) {
  const r = openCache.find(x => x.id === id); if (!r) return;
  if (!nome) { showToast('Informe seu nome.', 1); return; }
  askConf('Mover para o Histórico?', async () => {
    await sb.from(CO).delete().eq('id', id);
    const { error } = await sb.from(CH).insert({ ...r, id: undefined, fechado_por: nome, fechado_em: Date.now() });
    if (error) showToast('Erro.', 1); else showToast('Fechado e salvo!');
  });
};

window.delOpen = function (id) {
  askConf('Excluir este relatório aberto?', async () => {
    const { error } = await sb.from(CO).delete().eq('id', id);
    if (error) showToast('Erro: ' + error.message, 1); else showToast('Excluído.');
  });
};

window.viewOpen = function (id) {
  const r = openCache.find(x => x.id === id); if (r) openViewModal(r, false);
};

// ── HISTORY ──────────────────────────────────────────────
function renderHistory() {
  const el = document.getElementById('hist-list');
  if (!histCache.length) { el.innerHTML = `<div class="empty"><div class="ico">📋</div><p>Nenhum relatório no histórico.</p></div>`; return; }
  el.innerHTML = histCache.map(r => {
    const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : 'Sem data';
    const oc = (r.itens || []).filter(x => x.tipo === 'occ').length;
    const av = (r.itens || []).filter(x => x.tipo === 'ativ').length;
    const nf = (r.itens || []).reduce((s, it) => s + (it.fotos?.length || 0), 0);
    return `<div class="hcard">
      <div class="hcard-hd" onclick="viewHist('${r.id}')"><div style="flex:1">
        <div class="hdate">${r.setor || 'Sem setor'} — ${df}</div>
        <div class="hsub">${r.turno || '?'} · ${r.criado_por || '—'}${r.fechado_por ? ' · fechado: ' + r.fechado_por : ''}</div>
      </div>
      <div class="htags">
        ${r.turno ? `<span class="tag tag-t">${r.turno}</span>` : ''}
        ${oc ? `<span class="tag tag-o">🔧 ${oc}</span>` : ''}
        ${av ? `<span class="tag tag-a">📅 ${av}</span>` : ''}
        ${nf ? `<span class="tag tag-foto">📷 ${nf}</span>` : ''}
      </div></div>
      <div class="hcard-foot">
        <button class="btn btn-grn"  onclick="viewHist('${r.id}')">👁 Ver</button>
        <button class="btn btn-pdf"  onclick="gerarPDF(histCache.find(x=>x.id==='${r.id}'))">📄 PDF</button>
        <button class="btn btn-blue" onclick="reabrirHist('${r.id}')">↩ Reabrir</button>
        <button class="btn btn-red"  onclick="delHist('${r.id}')">🗑 Excluir</button>
      </div>
    </div>`;
  }).join('');
}

window.viewHist = function (id) { const r = histCache.find(x => x.id === id); if (r) openViewModal(r, true); };

window.delHist = function (id) {
  askConf('Excluir permanentemente este relatório?', async () => {
    const { error } = await sb.from(CH).delete().eq('id', id);
    if (error) showToast('Erro: ' + error.message, 1); else showToast('Excluído.');
  });
};

window.reabrirHist = async function (id) {
  const r = histCache.find(x => x.id === id); if (!r) return;
  if (!nome) { showToast('Informe seu nome primeiro.', 1); return; }
  askConf('Mover de volta para Abertos?', async () => {
    const { fechado_por, fechado_em, ...dados } = r;
    const { data, error } = await sb.from(CO).insert({
      ...dados, id: undefined, reaberto_em: Date.now(), reaberto_por: nome, criado_em: dados.criado_em || Date.now()
    }).select().single();
    if (error) { showToast('Erro ao reabrir.', 1); return; }
    await sb.from(CH).delete().eq('id', id);
    showToast('Relatório reaberto!');
    showPg('novo', document.querySelector('.tb'));
    setTimeout(() => { document.getElementById('f-sel').value = data.id; onSelChange(); }, 500);
  });
};

function openViewModal(r, canDel) {
  const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : 'Sem data';
  document.getElementById('view-title').textContent = `${r.setor || '—'} — ${df} ${r.turno || ''}`;
  document.getElementById('mt-o').textContent = bOcc(r);
  document.getElementById('mt-a').textContent = bAtiv(r);
  document.getElementById('mt-f').textContent = bFull(r);
  renderModalPhotos(r);
  const db_btn = document.getElementById('mod-del-btn');
  db_btn.style.display = canDel ? '' : 'none';
  if (canDel) db_btn.onclick = () => { closeOv('ov-view'); delHist(r.id); };
  document.getElementById('mod-pdf-btn').onclick = () => gerarPDF(r);
  resetMtabs();
  document.getElementById('ov-view').classList.add('on');
}

function renderModalPhotos(r) {
  const all = (r.itens || []).flatMap(it => (it.fotos || []).map(f => ({ ...f, label: `${it.tipo === 'occ' ? 'Ocorrência' : 'Atividade'} — ${it.equip || '—'}` })));
  const cont = document.getElementById('modal-photos');
  if (!all.length) { cont.style.display = 'none'; return; }
  cont.style.display = 'block';
  document.getElementById('modal-photo-grid').innerHTML = all.map((f, i) => `
    <div class="modal-photo-item">
      <img src="${f.url}" alt="Foto ${i + 1}" class="modal-photo-img" onclick="openLightbox('${f.url}')">
      <div class="modal-photo-lbl">${f.label}</div>
    </div>`).join('');
}

window.openLightbox = function (url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('ov-lightbox').classList.add('on');
};

// ── PDF ──────────────────────────────────────────────────
async function loadJsPDF() {
  if (window.jspdf) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function imgToBase64(url) {
  // Fetch via canvas to avoid tainted-canvas / CORS issues and get natural dimensions
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      try {
        res({ b64: canvas.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight });
      } catch { rej(new Error('canvas tainted')); }
    };
    img.onerror = () => rej(new Error('load failed'));
    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
  });
}
window.gerarPDF = async function (r) {
  showToast('Gerando PDF, aguarde...');
  await loadJsPDF();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, M = 14, CW = PW - M * 2; let y = M;
  const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
  const occs = (r.itens || []).filter(x => x.tipo === 'occ');
  const ativs = (r.itens || []).filter(x => x.tipo === 'ativ');
  function hexRGB(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function bgFill() { pdf.setFillColor(15, 17, 23); pdf.rect(0, 0, 210, 297, 'F'); }
  function addHeaderBar() {
    pdf.setFillColor(24, 28, 37); pdf.rect(0, 0, 210, 20, 'F');
    pdf.setFillColor(240, 165, 0); pdf.rect(0, 19, 210, 1, 'F');
    pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(240, 165, 0);
    pdf.text('PASSAGEM DE TURNO — MANUTENÇÃO', M, 12);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(138, 149, 170);
    pdf.text(`${r.setor || '—'}  |  ${df}  |  Turno: ${r.turno || '—'}`, M, 17); y = 26;
  }
  function check(h) { if (y + h > 284) { pdf.addPage(); bgFill(); addHeaderBar(); } }
  function drawLabel(txt, color) {
    check(9); pdf.setFillColor(...hexRGB(color)); pdf.roundedRect(M, y, CW, 8, 1, 1, 'F');
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255, 255, 255);
    pdf.text(txt, M + 3, y + 5.5); y += 11;
  }
  function drawItemHd(num, label, autor, bColor) {
    check(10); pdf.setFillColor(30, 35, 48); pdf.roundedRect(M, y, CW, 9, 1, 1, 'F');
    pdf.setFillColor(...hexRGB(bColor)); pdf.rect(M, y, 3, 9, 'F');
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(212, 219, 232);
    pdf.text(`${label} ${num}${autor ? ' — ' + autor : ''}`, M + 5, y + 6); y += 12;
  }
  function drawRow(lbl, val) {
    const LBL_W = 38, lineH = 4.8;
    const lines = pdf.splitTextToSize(String(val || '—'), CW - LBL_W - 4);
    const rowH  = lines.length * lineH + 3;
    check(rowH);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(110, 120, 148);
    pdf.text(lbl + ':', M + 2, y + lineH - 0.5);
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(212, 219, 232);
    pdf.text(lines, M + LBL_W, y + lineH - 0.5);
    y += rowH;
  }
  async function drawPhotos(fotos) {
    if (!fotos?.length) return;
    check(8);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(92, 102, 128);
    pdf.text(`Fotos (${fotos.length})`, M + 2, y); y += 5;
    const cols = 2, gap = 4;
    const imgW = (CW - gap * (cols - 1)) / cols;
    let col = 0;
    for (let p = 0; p < fotos.length; p++) {
      try {
        const { b64, w, h } = await imgToBase64(fotos[p].url);
        // preserve aspect ratio, max height = 60mm
        const ratio  = h / w;
        const drawW  = imgW;
        const drawH  = Math.min(drawW * ratio, 60);
        if (col === 0) check(drawH + 8);
        const x = M + col * (imgW + gap);
        pdf.addImage(b64, 'JPEG', x, y, drawW, drawH, `img_${p}`, 'MEDIUM');
        pdf.setDrawColor(58, 69, 96); pdf.roundedRect(x, y, drawW, drawH, 1, 1, 'S');
        pdf.setFontSize(6.5); pdf.setTextColor(92, 102, 128);
        pdf.text(`Foto ${p + 1}`, x + 1.5, y + drawH - 1.5);
        col++;
        if (col >= cols) { col = 0; y += drawH + gap; }
      } catch {
        const drawH = imgW * 0.6;
        if (col === 0) check(drawH + 8);
        const x = M + col * (imgW + gap);
        pdf.setFillColor(30, 35, 48); pdf.roundedRect(x, y, imgW, drawH, 1, 1, 'F');
        pdf.setDrawColor(58, 69, 96); pdf.roundedRect(x, y, imgW, drawH, 1, 1, 'S');
        pdf.setFontSize(7.5); pdf.setTextColor(92, 102, 128);
        pdf.text('Foto indisponível', x + imgW / 2, y + drawH / 2, { align: 'center' });
        col++;
        if (col >= cols) { col = 0; y += drawH + gap; }
      }
    }
    if (col > 0) {
      // close last partial row - need to know last drawH; add safe spacing
      y += imgW * 0.6 + gap;
    }
    y += 2;
  }
  bgFill(); addHeaderBar();
  check(22); pdf.setFillColor(30, 35, 48); pdf.roundedRect(M, y, CW, 20, 2, 2, 'F');
  pdf.setDrawColor(42, 48, 64); pdf.roundedRect(M, y, CW, 20, 2, 2, 'S');
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(212, 219, 232);
  y += 6; pdf.text(`Criado por: ${r.criado_por || '—'}`, M + 4, y); y += 5;
  pdf.text(`Fechado por: ${r.fechado_por || r.criado_por || '—'}`, M + 4, y); y += 5;
  pdf.text(`${occs.length} ocorrência(s)   |   ${ativs.length} atividade(s)`, M + 4, y); y += 10;
  if (occs.length) {
    drawLabel('🔧  OCORRÊNCIAS DO TURNO', '#e05c2a');
    for (let i = 0; i < occs.length; i++) {
      const o = occs[i]; drawItemHd(i + 1, 'Ocorrência', o.autor, '#e05c2a');
      drawRow('Equipamento', o.equip); drawRow('Sintoma', o.sintoma);
      drawRow('Modo de falha', o.modo); drawRow('Impacto', o.impacto);
      drawRow('Intervenção', o.tipo_int); drawRow('Solução', o.solucao);
      await drawPhotos(o.fotos);
      check(4); pdf.setDrawColor(42, 48, 64); pdf.line(M, y, M + CW, y); y += 6;
    }
  }
  if (ativs.length) {
    check(12); y += 4; drawLabel('📅  ATIVIDADES PROGRAMADAS', '#4a90e2');
    const sC = { Concluída: '#2ecc71', 'Em andamento': '#4a90e2', Pendente: '#e05050' };
    for (let i = 0; i < ativs.length; i++) {
      const a = ativs[i]; drawItemHd(i + 1, 'Atividade', a.autor, sC[a.status] || '#5c6680');
      drawRow('Equipamento', a.equip); drawRow('Descrição', a.desc); drawRow('Status', a.status);
      await drawPhotos(a.fotos);
      pdf.setDrawColor(42, 48, 64); pdf.line(M, y, M + CW, y); y += 6;
    }
  }
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i); pdf.setFontSize(7.5); pdf.setTextColor(92, 102, 128);
    pdf.text(`Página ${i} de ${total}  |  Gerado em ${new Date().toLocaleString('pt-BR')}`, PW / 2, 292, { align: 'center' });
  }
  pdf.save(`turno_${(r.setor || 'relatorio').replace(/\s+/g, '_')}_${r.data || 'sem_data'}.pdf`);
  showToast('✓ PDF baixado!');
};

// ── HELPERS ──────────────────────────────────────────────
window.closeOv = function (id) { document.getElementById(id).classList.remove('on'); };
window.copyActivePrev = function () { const a = document.querySelector('.ipanel.on .pbox'); if (a) navigator.clipboard.writeText(a.textContent).then(() => showToast('✓ Copiado!')).catch(() => showToast('Erro', 1)); };
window.copyActiveMod = function () { const a = document.querySelector('.mpanel.on .mbox'); if (a) navigator.clipboard.writeText(a.textContent).then(() => showToast('✓ Copiado!')).catch(() => showToast('Erro', 1)); };
window.swItab = function (btn, pid) { btn.closest('.card-bd').querySelectorAll('.itab').forEach(b => b.classList.remove('on')); btn.closest('.card-bd').querySelectorAll('.ipanel').forEach(p => p.classList.remove('on')); btn.classList.add('on'); document.getElementById(pid).classList.add('on'); };
window.swMtab = function (btn, pid) { btn.closest('.modal-body').querySelectorAll('.mtab').forEach(b => b.classList.remove('on')); btn.closest('.modal-body').querySelectorAll('.mpanel').forEach(p => p.classList.remove('on')); btn.classList.add('on'); document.getElementById(pid).classList.add('on'); };
function resetMtabs() { document.querySelectorAll('.mtab').forEach((b, i) => b.classList.toggle('on', i === 0)); document.querySelectorAll('.mpanel').forEach((p, i) => p.classList.toggle('on', i === 0)); }
function askConf(msg, cb) { confCb = cb; document.getElementById('conf-msg').textContent = msg; document.getElementById('conf-ok').onclick = async () => { closeOv('ov-confirm'); if (confCb) await confCb(); }; document.getElementById('ov-confirm').classList.add('on'); }

window.clearForm = function (silent) {
  if (!silent && !confirm('Limpar formulário?')) return;
  activeOpenId = null; editItemIdx = null; sheetPhotos = [];
  document.getElementById('auto-ind').style.display = 'none';
  document.getElementById('f-data').value = new Date().toISOString().split('T')[0];
  document.querySelectorAll('#f-turno .tbn').forEach(b => b.classList.remove('on'));
  document.getElementById('f-sel').value = ''; document.getElementById('f-setor').value = '';
  document.getElementById('items-list').innerHTML = ''; updatePreview();
};

window.showPg = function (id, btn) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tb').forEach(b => b.classList.remove('on'));
  document.getElementById('pg-' + id).classList.add('on');
  if (btn) btn.classList.add('on');
  if (id === 'abertos') renderOpen();
  if (id === 'hist') renderHistory();
  if (id === 'fca') renderFcaList();
};

// WhatsApp
window.openWaModal = function () {
  waCurrentType = 'full';
  document.querySelectorAll('[data-watype]').forEach(b => b.classList.toggle('on', b.dataset.watype === 'full'));
  document.getElementById('wa-preview').textContent = getWaText();
  document.getElementById('ov-wa').classList.add('on');
};
window.selWaType = function (btn) {
  document.querySelectorAll('[data-watype]').forEach(b => b.classList.remove('on'));
  btn.classList.add('on'); waCurrentType = btn.dataset.watype;
  document.getElementById('wa-preview').textContent = getWaText();
};
function getWaText() { const d = getPreviewData(); if (waCurrentType === 'occ') return bOcc(d); if (waCurrentType === 'ativ') return bAtiv(d); return bFull(d); }
window.sendWhatsApp = function () {
  const num = document.getElementById('wa-num').value.replace(/\D/g, '');
  if (!num || num.length < 10) { showToast('Informe um número válido.', 1); return; }
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(getWaText())}`, '_blank');
  closeOv('ov-wa'); showToast('WhatsApp aberto!');
};

document.querySelectorAll('.ov').forEach(ov => {
  if (ov.id === 'ov-confirm') return;
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('on'); });
});

// ── INIT ─────────────────────────────────────────────────
document.getElementById('f-data').value = new Date().toISOString().split('T')[0];
try {
  const n = localStorage.getItem('tn');
  if (n) { nome = n; document.getElementById('f-nome').value = n; document.getElementById('nbanner').innerHTML = `<div class="nbanner"><span class="puls"></span>Logado como <strong>${n}</strong></div>`; }
} catch (e) {}
updatePreview();
setSt('load', 'Conectando ao Supabase...');
loadInitialData().then(() => startRT());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});


// ── ALMOXARIFADO ─────────────────────────────────────────
const ALMOX_TABLE   = 'almoxarifado_lista';
const ALMOX_DESCS   = 'almoxarifado_descs';
const ADMIN_PASS    = 'Alpa';
const ADMIN_LS_KEY  = 'almox-admin-auth';

let almoxData     = [];   // rows from Supabase: [{id, row_idx, cells, headers}]
let almoxHeaders  = [];
let almoxFiltered = [];
let almoxDescTarget = null;
let almoxDescs    = {};   // {row_idx: {id, descricao, autor}}
let almoxIsAdmin  = false;
let almoxLoaded   = false;

// ── ADMIN AUTH ────────────────────────────────────────────
function checkAdminSession() {
  try { almoxIsAdmin = localStorage.getItem(ADMIN_LS_KEY) === '1'; } catch {}
}
function setAdminSession(v) {
  almoxIsAdmin = v;
  try { if (v) localStorage.setItem(ADMIN_LS_KEY, '1'); else localStorage.removeItem(ADMIN_LS_KEY); } catch {}
}

function promptAdminPass(onSuccess) {
  if (almoxIsAdmin) { onSuccess(); return; }
  const pass = window.prompt('Senha de administrador:');
  if (pass === ADMIN_PASS) { setAdminSession(true); showToast('✓ Acesso admin liberado!'); onSuccess(); }
  else if (pass !== null) showToast('Senha incorreta.', 1);
}

// ── OPEN MODAL ────────────────────────────────────────────
window.openAlmox = async function () {
  checkAdminSession();
  updateAlmoxAdminUI();
  document.getElementById('ov-almox').classList.add('on');
  if (!almoxLoaded) await loadAlmoxFromDB();
};

function updateAlmoxAdminUI() {
  const adminBar = document.getElementById('almox-admin-bar');
  const importBtn = document.getElementById('almox-import-btn');
  const clearBtn  = document.getElementById('almox-clear-btn');
  const adminLink = document.getElementById('almox-admin-link');
  if (!adminBar) return;
  if (almoxIsAdmin) {
    importBtn.style.display = '';
    clearBtn.style.display  = '';
    adminLink.style.display = 'none';
    adminBar.title = 'Admin ativo';
  } else {
    importBtn.style.display = 'none';
    clearBtn.style.display  = 'none';
    adminLink.style.display = '';
  }
}

// ── LOAD FROM SUPABASE ────────────────────────────────────
async function loadAlmoxFromDB() {
  document.getElementById('almox-loading').style.display = 'flex';
  document.getElementById('almox-empty-state').style.display = 'none';
  document.getElementById('almox-table-wrap').style.display  = 'none';
  try {
    // Load list rows with pagination (Supabase default limit is 1000)
    let listData = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: e1 } = await sb.from(ALMOX_TABLE)
        .select('*').order('row_idx', { ascending: true }).range(from, from + PAGE - 1);
      if (e1) throw e1;
      if (!page || page.length === 0) break;
      listData = listData.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
      document.getElementById('almox-file-info').textContent =
        `Carregando... ${listData.length} itens`;
    }

    // Load descriptions with pagination
    let descData = [];
    from = 0;
    while (true) {
      const { data: page, error: e2 } = await sb.from(ALMOX_DESCS)
        .select('*').range(from, from + PAGE - 1);
      if (e2) throw e2;
      if (!page || page.length === 0) break;
      descData = descData.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
    }

    almoxDescs = {};
    (descData || []).forEach(d => { almoxDescs[d.row_idx] = d; });

    if (listData && listData.length) {
      almoxHeaders = listData[0].headers || [];
      almoxData    = listData;
    } else {
      almoxHeaders = [];
      almoxData    = [];
    }
    almoxFiltered = [...almoxData];
    almoxLoaded   = true;

    const info = almoxData.length
      ? `${almoxData.length} itens carregados`
      : 'Nenhuma planilha carregada';
    document.getElementById('almox-file-info').textContent = info;
    document.getElementById('almox-search').value = '';
  } catch (err) {
    showToast('Erro ao carregar almoxarifado: ' + err.message, 1);
  } finally {
    document.getElementById('almox-loading').style.display = 'none';
    renderAlmoxTable();
  }
}

// ── IMPORT EXCEL ──────────────────────────────────────────
async function loadSheetJS() {
  if (window.XLSX) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

window.almoxImportClick = function () {
  promptAdminPass(() => document.getElementById('almox-file-input').click());
};

window.loadAlmoxFile = async function (e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    await loadSheetJS();
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows.length) { showToast('Planilha vazia.', 1); return; }

        const headers = rows[0].map(h => String(h).trim()).filter(Boolean);
        const items   = rows.slice(1)
          .filter(r => r.some(c => c !== ''))
          .map((row, idx) => {
            const cells = {};
            headers.forEach((h, i) => { cells[h] = String(row[i] ?? '').trim(); });
            return { row_idx: idx, cells, headers };
          });

        if (!items.length) { showToast('Nenhum dado encontrado.', 1); return; }

        showToast('Enviando para o servidor...');
        // Clear existing list
        await sb.from(ALMOX_TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        // Clear existing descs
        await sb.from(ALMOX_DESCS).delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Insert in batches of 500 (suporta até 10.000+ linhas)
        const BATCH = 500;
        const total = items.length;
        for (let i = 0; i < total; i += BATCH) {
          const batch = items.slice(i, i + BATCH);
          const { error } = await sb.from(ALMOX_TABLE).insert(batch);
          if (error) throw error;
          const pct = Math.round(((i + batch.length) / total) * 100);
          document.getElementById('almox-file-info').textContent =
            `Enviando... ${i + batch.length} / ${total} itens (${pct}%)`;
        }

        almoxLoaded = false;
        await loadAlmoxFromDB();
        document.getElementById('almox-file-info').textContent = `${file.name} — ${total} itens`;
        showToast(`\u2713 ${total} itens importados para todos!`);
      } catch (err) { showToast('Erro: ' + err.message, 1); }
    };
    reader.readAsArrayBuffer(file);
  } catch { showToast('Erro ao carregar SheetJS.', 1); }
  e.target.value = '';
};

window.almoxClearList = function () {
  promptAdminPass(() => {
    if (!confirm('Excluir TODA a lista do almoxarifado e os comentários? Esta ação não pode ser desfeita.')) return;
    (async () => {
      await sb.from(ALMOX_TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await sb.from(ALMOX_DESCS).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      almoxData = []; almoxHeaders = []; almoxFiltered = []; almoxDescs = {};
      almoxLoaded = false;
      document.getElementById('almox-file-info').textContent = 'Nenhuma planilha carregada';
      renderAlmoxTable();
      showToast('Lista excluída.');
    })();
  });
};

// ── SEARCH ────────────────────────────────────────────────
window.filterAlmox = function () {
  const q = (document.getElementById('almox-search')?.value || '').toLowerCase().trim();
  if (!q) { almoxFiltered = [...almoxData]; }
  else {
    almoxFiltered = almoxData.filter(row =>
      almoxHeaders.some(h => (row.cells[h] || '').toLowerCase().includes(q)) ||
      ((almoxDescs[row.row_idx]?.descricao) || '').toLowerCase().includes(q)
    );
  }
  renderAlmoxTable();
};

// ── RENDER TABLE ──────────────────────────────────────────
function highlight(text, query) {
  if (!query) return escHtml(text);
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escHtml(text).replace(new RegExp(esc, 'gi'),
    m => `<span class="almox-highlight">${m}</span>`);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderAlmoxTable() {
  const empty    = document.getElementById('almox-empty-state');
  const wrap     = document.getElementById('almox-table-wrap');
  const countEl  = document.getElementById('almox-count');

  if (!almoxData.length) {
    empty.style.display = 'flex'; wrap.style.display = 'none';
    countEl.textContent = '—'; return;
  }
  empty.style.display = 'none'; wrap.style.display = 'block';
  countEl.textContent = `${almoxFiltered.length} de ${almoxData.length} itens`;

  const q = (document.getElementById('almox-search')?.value || '').toLowerCase().trim();

  document.getElementById('almox-thead').innerHTML = '<tr>' +
    almoxHeaders.map(h => `<th>${escHtml(h)}</th>`).join('') +
    '<th style="min-width:180px">Onde é Usado / Obs.</th>' +
    '</tr>';

  const tbody = document.getElementById('almox-tbody');
  if (!almoxFiltered.length) {
    tbody.innerHTML = `<tr><td colspan="${almoxHeaders.length + 1}" style="text-align:center;padding:24px;color:var(--mut);font-family:var(--mono);font-size:11px">Nenhum item encontrado para "${escHtml(q)}"</td></tr>`;
    return;
  }

  tbody.innerHTML = almoxFiltered.map(row => {
    const cells   = almoxHeaders.map(h => `<td>${highlight(row.cells[h] || '', q)}</td>`).join('');
    const descObj = almoxDescs[row.row_idx];
    const hasDesc = !!(descObj?.descricao);
    const descLabel = hasDesc
      ? `<span class="almox-desc-btn has-desc" onclick="editAlmoxDesc(${row.row_idx})" title="${escHtml(descObj.descricao)}">✏ ${escHtml(descObj.descricao.length > 30 ? descObj.descricao.slice(0,30)+'…' : descObj.descricao)}<em class="almox-desc-autor"> — ${escHtml(descObj.autor || '?')}</em></span>`
      : `<span class="almox-desc-btn" onclick="editAlmoxDesc(${row.row_idx})">+ Adicionar obs.</span>`;
    return `<tr>${cells}<td class="td-desc">${descLabel}</td></tr>`;
  }).join('');
}

// ── DESCRIPTION EDIT ─────────────────────────────────────
window.editAlmoxDesc = function (rowIdx) {
  const row = almoxData.find(r => r.row_idx === rowIdx); if (!row) return;
  almoxDescTarget = rowIdx;
  const info = almoxHeaders.slice(0, 3).map(h => row.cells[h]).filter(Boolean).join(' · ');
  document.getElementById('almox-desc-item-info').textContent = info || '—';
  const existing = almoxDescs[rowIdx];
  document.getElementById('almox-desc-input').value  = existing?.descricao || '';
  document.getElementById('almox-desc-autor-info').textContent = existing
    ? `Última edição: ${existing.autor || '?'}` : '';
  document.getElementById('almox-desc-title').textContent = existing?.descricao ? 'Editar observação' : 'Adicionar observação';
  document.getElementById('ov-almox-desc').classList.add('on');
};

window.saveAlmoxDesc = async function () {
  if (almoxDescTarget === null) return;
  if (!nome) { showToast('Informe seu nome no app primeiro.', 1); return; }
  const val  = (document.getElementById('almox-desc-input').value || '').trim();
  const btn  = document.getElementById('almox-desc-save-btn');
  btn.textContent = 'Salvando...'; btn.disabled = true;
  try {
    const existing = almoxDescs[almoxDescTarget];
    if (val) {
      const payload = { row_idx: almoxDescTarget, descricao: val, autor: nome, atualizado_em: Date.now() };
      if (existing?.id) {
        await sb.from(ALMOX_DESCS).update(payload).eq('id', existing.id);
        almoxDescs[almoxDescTarget] = { ...existing, ...payload };
      } else {
        const { data } = await sb.from(ALMOX_DESCS).insert(payload).select().single();
        if (data) almoxDescs[almoxDescTarget] = data;
      }
    } else if (existing?.id) {
      await sb.from(ALMOX_DESCS).delete().eq('id', existing.id);
      delete almoxDescs[almoxDescTarget];
    }
    filterAlmox();
    closeOv('ov-almox-desc');
    showToast(val ? '✓ Observação salva para todos!' : 'Observação removida.');
  } catch (err) {
    showToast('Erro: ' + err.message, 1);
  } finally {
    btn.textContent = '✓ Salvar para todos';
    btn.disabled = false;
  }
};

// expose for inline onclick
window.promptAdminPass   = promptAdminPass;
window.updateAlmoxAdminUI = updateAlmoxAdminUI;

// ── FCA ──────────────────────────────────────────────────
const FCA_TABLE = 'fcas';
let fcaCache = [];
let fcaViewId = null;

// ── OPEN / CLOSE SHEET ───────────────────────────────────
window.openFcaSheet = function () {
  document.getElementById('fca-equip').value = '';
  document.getElementById('fca-data').value  = new Date().toISOString().split('T')[0];
  document.getElementById('fca-fato').value  = '';
  document.getElementById('fca-causa').value = '';
  document.getElementById('fca-acao').value  = '';
  document.getElementById('ov-fca').classList.add('on');
};

window.closeFcaSheet = function () {
  document.getElementById('ov-fca').classList.remove('on');
};

// ── SAVE ─────────────────────────────────────────────────
window.saveFca = async function () {
  if (!nome) { showToast('Informe seu nome primeiro.', 1); return; }
  const fato  = document.getElementById('fca-fato').value.trim();
  const causa = document.getElementById('fca-causa').value.trim();
  const acao  = document.getElementById('fca-acao').value.trim();
  if (!fato && !causa && !acao) { showToast('Preencha ao menos um campo.', 1); return; }

  const payload = {
    equip:      document.getElementById('fca-equip').value.trim(),
    data:       document.getElementById('fca-data').value,
    fato, causa, acao,
    autor:      nome,
    criado_em:  Date.now()
  };
  try {
    const { error } = await sb.from(FCA_TABLE).insert(payload);
    if (error) throw error;
    closeFcaSheet();
    showToast('✓ FCA salvo!');
  } catch (e) { showToast('Erro: ' + e.message, 1); }
};

// ── LOAD ─────────────────────────────────────────────────
async function loadFcas() {
  const { data, error } = await sb.from(FCA_TABLE).select('*').order('criado_em', { ascending: false });
  if (error) return;
  fcaCache = data || [];
  document.getElementById('cnt-fca').textContent = fcaCache.length || '';
  if (document.getElementById('pg-fca').classList.contains('on')) renderFcaList();
}

// ── RENDER LIST ──────────────────────────────────────────
function renderFcaList() {
  const el = document.getElementById('fca-list');
  if (!fcaCache.length) {
    el.innerHTML = `<div class="empty"><div class="ico">⚡</div><p>Nenhum FCA registrado ainda.</p></div>`;
    return;
  }
  el.innerHTML = fcaCache.map(r => {
    const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
    const preview = [r.fato, r.causa, r.acao].filter(Boolean).join(' · ').slice(0, 120);
    return `<div class="fca-card">
      <div class="fca-card-hd" onclick="viewFca('${r.id}')">
        <div style="flex:1">
          <div style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--lbl)">${r.equip || 'Sem equipamento'} <span style="color:#b07fe0">⚡ FCA</span></div>
          <div class="fca-card-meta">${df} · ${r.autor || '—'}</div>
          <div class="fca-preview">${preview || '—'}</div>
        </div>
      </div>
      <div class="fca-card-foot">
        <button class="btn btn-grn" onclick="viewFca('${r.id}')">👁 Ver</button>
        <button class="fca-gpt-btn" style="flex:1;padding:7px" onclick="openFcaGptById('${r.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.371 2.019-1.168a.075.075 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.4-.674zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.603 1.5v2.999l-2.597 1.5-2.603-1.5z"/></svg>
          ChatGPT
        </button>
        <button class="btn btn-red" onclick="deleteFca('${r.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

// ── VIEW MODAL ───────────────────────────────────────────
window.viewFca = function (id) {
  const r = fcaCache.find(x => x.id === id); if (!r) return;
  fcaViewId = id;
  const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
  document.getElementById('fca-view-title').textContent = `${r.equip || 'FCA'} — ${df}`;
  document.getElementById('fv-fato').textContent  = r.fato  || '—';
  document.getElementById('fv-causa').textContent = r.causa || '—';
  document.getElementById('fv-acao').textContent  = r.acao  || '—';
  document.getElementById('ov-fca-view').classList.add('on');
};

window.copyFcaView = function () {
  const r = fcaCache.find(x => x.id === fcaViewId); if (!r) return;
  const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
  const txt = `⚡ FCA — ${r.equip || '—'} | ${df}\nAutor: ${r.autor || '—'}\n\n📌 FATO\n${r.fato || '—'}\n\n🔍 CAUSA\n${r.causa || '—'}\n\n✅ AÇÃO\n${r.acao || '—'}`;
  navigator.clipboard.writeText(txt).then(() => showToast('✓ FCA copiado!')).catch(() => showToast('Erro ao copiar', 1));
};

window.deleteFcaView = function () {
  if (!fcaViewId) return;
  closeOv('ov-fca-view');
  deleteFca(fcaViewId);
};

window.deleteFca = function (id) {
  askConf('Excluir este FCA permanentemente?', async () => {
    const { error } = await sb.from(FCA_TABLE).delete().eq('id', id);
    if (error) showToast('Erro: ' + error.message, 1);
    else showToast('FCA excluído.');
  });
};

// ── CHATGPT LINK ─────────────────────────────────────────
function buildGptPrompt(fato, causa, acao, equip) {
  const parts = [];
  if (equip) parts.push(`Equipamento/Setor: ${equip}`);
  if (fato)  parts.push(`Fato: ${fato}`);
  if (causa) parts.push(`Causa: ${causa}`);
  if (acao)  parts.push(`Ação: ${acao}`);
  const contexto = parts.join('\n');
  const prompt = `Você é um engenheiro de manutenção industrial sênior. Elabore, organize e formate o seguinte registro de FCA (Fato, Causa, Ação) em linguagem técnica formal, clara e objetiva, mantendo a estrutura FCA. Corrija erros gramaticais, use terminologia técnica adequada e torne o texto profissional.\n\n${contexto}\n\nResponda com o FCA formatado em três seções bem definidas: FATO, CAUSA e AÇÃO.`;
  return encodeURIComponent(prompt);
}

window.openFcaGpt = function () {
  const fato  = document.getElementById('fca-fato').value.trim();
  const causa = document.getElementById('fca-causa').value.trim();
  const acao  = document.getElementById('fca-acao').value.trim();
  const equip = document.getElementById('fca-equip').value.trim();
  const url = `https://chat.openai.com/?q=${buildGptPrompt(fato, causa, acao, equip)}`;
  window.open(url, '_blank');
};

window.openFcaGptFromView = function () {
  openFcaGptById(fcaViewId);
};

window.openFcaGptById = function (id) {
  const r = fcaCache.find(x => x.id === id); if (!r) return;
  const url = `https://chat.openai.com/?q=${buildGptPrompt(r.fato, r.causa, r.acao, r.equip)}`;
  window.open(url, '_blank');
};

// ── REALTIME ─────────────────────────────────────────────
function startFcaRT() {
  sb.channel('rt-fca')
    .on('postgres_changes', { event: '*', schema: 'public', table: FCA_TABLE }, async () => {
      await loadFcas();
    })
    .subscribe();
}

// FCA button wired via inline script in index.html
