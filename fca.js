// ── SUPABASE ─────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SB_URL = 'https://tdpgaqiktinngiuptatq.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkcGdhcWlrdGlubmdpdXB0YXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjUwNjAsImV4cCI6MjA5NDEwMTA2MH0.a76Kgj9Flj6NkasYETC5BXMoIhXMBoCUM-w2BqJBlS4';
const sb = createClient(SB_URL, SB_KEY);

const FCA_TABLE = 'fcas';
const IA_PROXY  = 'https://tdpgaqiktinngiuptatq.supabase.co/functions/v1/ia-proxy';

// ── ESTADO ───────────────────────────────────────────────
let nome        = '';
let fcaCache    = [];      // todos os FCAs do banco
let fcaFiltered = [];      // FCAs após filtro de busca
let fcaViewId   = null;    // id do FCA aberto no modal de visualização
let fcaEditId   = null;    // id do FCA em edição (null = novo)
let fcaIaSugestao = null;  // última sugestão da IA
let confCb      = null;

// ── UTILS ────────────────────────────────────────────────
function setSt(t, m) {
  const e = document.getElementById('db-st');
  e.className = 'sbar sb-' + t;
  e.innerHTML = `<span class="puls"></span>${m}`;
}

function showToast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  void t.offsetWidth;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2500);
}

// ── NOME ─────────────────────────────────────────────────
window.saveNome = function () {
  const v = document.getElementById('f-nome').value.trim();
  if (!v) { showToast('Informe seu nome.', 1); return; }
  nome = v;
  try { localStorage.setItem('tn', v); } catch (e) {}
  document.getElementById('nbanner').innerHTML =
    `<div class="nbanner"><span class="puls"></span>Logado como <strong>${v}</strong></div>`;
  showToast('Nome salvo!');
};

// ── OVERLAY ──────────────────────────────────────────────
window.closeOv = function (id) {
  document.getElementById(id).classList.remove('on');
};

document.querySelectorAll('.ov').forEach(ov => {
  if (ov.id === 'ov-confirm') return;
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('on'); });
});

function askConf(msg, cb) {
  confCb = cb;
  document.getElementById('conf-msg').textContent = msg;
  document.getElementById('conf-ok').onclick = async () => {
    closeOv('ov-confirm');
    if (confCb) await confCb();
  };
  document.getElementById('ov-confirm').classList.add('on');
}

// ── SHEET: ABRIR / FECHAR ─────────────────────────────────
window.openFcaSheet = function (editId) {
  fcaEditId = editId || null;
  const titulo = document.getElementById('fca-sheet-title');
  const saveBtn = document.getElementById('fca-save-btn');

  if (fcaEditId) {
    // Modo edição — preenche com dados existentes
    const r = fcaCache.find(x => x.id === fcaEditId);
    if (!r) return;
    document.getElementById('fca-equip').value = r.equip || '';
    document.getElementById('fca-data').value  = r.data  || '';
    document.getElementById('fca-fato').value  = r.fato  || '';
    document.getElementById('fca-causa').value = r.causa || '';
    document.getElementById('fca-acao').value  = r.acao  || '';
    titulo.textContent = '✏ Editar FCA';
    saveBtn.textContent = '✓ Salvar Alterações';
  } else {
    // Modo novo
    document.getElementById('fca-equip').value = '';
    document.getElementById('fca-data').value  = new Date().toISOString().split('T')[0];
    document.getElementById('fca-fato').value  = '';
    document.getElementById('fca-causa').value = '';
    document.getElementById('fca-acao').value  = '';
    titulo.textContent = '⚡ Novo FCA';
    saveBtn.textContent = '✓ Salvar FCA';
  }

  // Reset IA
  document.getElementById('fca-ai-result').style.display = 'none';
  fcaIaSugestao = null;

  document.getElementById('ov-fca').classList.add('on');
};

window.closeFcaSheet = function () {
  document.getElementById('ov-fca').classList.remove('on');
  fcaEditId = null;
  fcaIaSugestao = null;
};

// ── SAVE FCA ─────────────────────────────────────────────
window.saveFca = async function () {
  if (!nome) { showToast('Informe seu nome primeiro.', 1); return; }

  const fato  = document.getElementById('fca-fato').value.trim();
  const causa = document.getElementById('fca-causa').value.trim();
  const acao  = document.getElementById('fca-acao').value.trim();

  if (!fato && !causa && !acao) {
    showToast('Preencha ao menos um campo.', 1);
    return;
  }

  const payload = {
    equip:     document.getElementById('fca-equip').value.trim(),
    data:      document.getElementById('fca-data').value,
    fato, causa, acao,
    autor:     nome,
  };

  const btn = document.getElementById('fca-save-btn');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if (fcaEditId) {
      // Atualizar registro existente
      const { error } = await sb.from(FCA_TABLE).update(payload).eq('id', fcaEditId);
      if (error) throw error;
      showToast('✓ FCA atualizado!');
    } else {
      // Inserir novo
      const { error } = await sb.from(FCA_TABLE).insert({ ...payload, criado_em: Date.now() });
      if (error) throw error;
      showToast('✓ FCA salvo!');
    }
    closeFcaSheet();
  } catch (e) {
    showToast('Erro: ' + e.message, 1);
  } finally {
    btn.disabled = false;
    btn.textContent = fcaEditId ? '✓ Salvar Alterações' : '✓ Salvar FCA';
  }
};

// ── LOAD FCAs ─────────────────────────────────────────────
async function loadFcas() {
  const { data, error } = await sb
    .from(FCA_TABLE)
    .select('*')
    .order('criado_em', { ascending: false });

  if (error) {
    setSt('err', 'Erro ao carregar FCAs.');
    return;
  }

  fcaCache    = data || [];
  fcaFiltered = [...fcaCache];
  atualizarContador();
  renderFcaList();
  setSt('ok', `Conectado — ${fcaCache.length} FCA(s)`);
}

function atualizarContador() {
  const el = document.getElementById('fca-count');
  if (!el) return;
  el.textContent = fcaFiltered.length === fcaCache.length
    ? `${fcaCache.length} registro(s)`
    : `${fcaFiltered.length} de ${fcaCache.length}`;
}

// ── BUSCA ─────────────────────────────────────────────────
window.filterFcas = function () {
  const q = (document.getElementById('fca-search')?.value || '').toLowerCase().trim();
  if (!q) {
    fcaFiltered = [...fcaCache];
  } else {
    fcaFiltered = fcaCache.filter(r =>
      [r.equip, r.fato, r.causa, r.acao, r.autor].some(
        v => (v || '').toLowerCase().includes(q)
      )
    );
  }
  atualizarContador();
  renderFcaList();
};

// ── RENDER LISTA ──────────────────────────────────────────
function renderFcaList() {
  const el = document.getElementById('fca-list');

  if (!fcaCache.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="ico">⚡</div>
        <p>Nenhum FCA registrado ainda.</p>
        <p>Use o botão <strong style="color:var(--fca)">+ Novo FCA</strong> para começar.</p>
        <button class="btn btn-fca-new empty-btn" onclick="openFcaSheet()">⚡ + Novo FCA</button>
      </div>`;
    return;
  }

  if (!fcaFiltered.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="ico">🔍</div>
        <p>Nenhum FCA encontrado para essa busca.</p>
      </div>`;
    return;
  }

  el.innerHTML = fcaFiltered.map(r => {
    const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
    const preview = [r.fato, r.causa, r.acao].filter(Boolean).join(' · ').slice(0, 130);
    return `
      <div class="fca-card">
        <div class="fca-card-hd" onclick="viewFca('${r.id}')">
          <div style="flex:1">
            <div class="fca-card-equip">
              ${escHtml(r.equip || 'Sem equipamento')}
              <span class="fca-card-badge">⚡ FCA</span>
            </div>
            <div class="fca-card-meta">${df} · ${escHtml(r.autor || '—')}</div>
            <div class="fca-preview">${escHtml(preview || '—')}</div>
            <div class="fca-tags">
              ${r.fato  ? `<span class="fca-tag fca-tag-f">📌 Fato</span>`  : ''}
              ${r.causa ? `<span class="fca-tag fca-tag-c">🔍 Causa</span>` : ''}
              ${r.acao  ? `<span class="fca-tag fca-tag-a">✅ Ação</span>`  : ''}
            </div>
          </div>
        </div>
        <div class="fca-card-foot">
          <button class="btn btn-grn"  onclick="viewFca('${r.id}')">👁 Ver</button>
          <button class="btn btn-blue" onclick="openFcaSheet('${r.id}')">✏ Editar</button>
          <button class="fca-ai-btn"   style="flex:1;padding:7px;margin-top:0" onclick="viewFca('${r.id}')">✦ Refinar</button>
          <button class="btn btn-red"  onclick="deleteFca('${r.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── VIEW MODAL ────────────────────────────────────────────
window.viewFca = function (id) {
  const r = fcaCache.find(x => x.id === id);
  if (!r) return;
  fcaViewId = id;

  const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
  document.getElementById('fca-view-title').textContent = `${r.equip || 'FCA'} — ${df}`;
  document.getElementById('fv-fato').textContent  = r.fato  || '—';
  document.getElementById('fv-causa').textContent = r.causa || '—';
  document.getElementById('fv-acao').textContent  = r.acao  || '—';
  document.getElementById('fca-view-meta').textContent =
    `Autor: ${r.autor || '—'}  |  Data: ${df}`;

  document.getElementById('ov-fca-view').classList.add('on');
};

window.copyFcaView = function () {
  const r = fcaCache.find(x => x.id === fcaViewId);
  if (!r) return;
  const df = r.data ? new Date(r.data + 'T12:00').toLocaleDateString('pt-BR') : '—';
  const txt =
    `⚡ FCA — ${r.equip || '—'} | ${df}\nAutor: ${r.autor || '—'}\n\n` +
    `📌 FATO\n${r.fato || '—'}\n\n` +
    `🔍 CAUSA\n${r.causa || '—'}\n\n` +
    `✅ AÇÃO\n${r.acao || '—'}`;
  navigator.clipboard.writeText(txt)
    .then(() => showToast('✓ FCA copiado!'))
    .catch(() => showToast('Erro ao copiar', 1));
};

window.editFcaView = function () {
  closeOv('ov-fca-view');
  openFcaSheet(fcaViewId);
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

// ── IA: PROMPT ────────────────────────────────────────────
function buildFcaPrompt(fato, causa, acao, equip, modo, impacto, tipo_int) {
  const ctx = [];
  if (equip)    ctx.push('Equipamento: ' + equip);
  if (modo)     ctx.push('Modo de falha (classificação): ' + modo);
  if (impacto)  ctx.push('Impacto operacional: ' + impacto);
  if (tipo_int) ctx.push('Tipo de intervenção: ' + tipo_int);

  const campos = [];
  if (fato)  campos.push('FATO (o que aconteceu): ' + fato);
  if (causa) campos.push('CAUSA (rascunho): ' + causa);
  if (acao)  campos.push('AÇÃO (o que foi feito): ' + acao);

  const modoFinal = [modo, impacto].filter(Boolean).join(' — ') || 'não informado';

  return `Você é um engenheiro de manutenção industrial sênior. Analise as descrições abaixo e reescreva o FCA em linguagem técnica formal.

REGRAS IMPORTANTES:
- O campo "fato" deve descrever objetivamente o sintoma observado.
- O campo "causa" deve ser DERIVADO das descrições textuais do fato e da ação — NÃO use o modo de falha como causa. O modo de falha é apenas uma classificação, não uma explicação técnica.
- O campo "acao" deve descrever a intervenção realizada de forma técnica e ao final sempre incluir: "Modo de falha: ${modoFinal}".
- Corrija erros gramaticais e use terminologia técnica adequada.
- Mantenha as informações originais, apenas melhore a redação.

CONTEXTO DA OCORRÊNCIA:
${ctx.join('\n')}

DADOS PARA ELABORAÇÃO:
${campos.join('\n')}

Responda SOMENTE com um JSON no formato:
{"fato":"...","causa":"...","acao":"..."}
Sem markdown, sem explicações, apenas o JSON.`;
}

// ── IA: CHAMADA ───────────────────────────────────────────
async function chamarIA(prompt) {
  const resp = await fetch(IA_PROXY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SB_KEY
    },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
  });

  const rawText = await resp.text();
  if (!rawText || rawText.trim() === '')
    throw new Error('Resposta vazia. Verifique se GROQ_KEY está configurada no Supabase.');

  let data;
  try { data = JSON.parse(rawText); }
  catch (e) { throw new Error('Resposta inválida: ' + rawText.substring(0, 120)); }

  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const raw = (data.content || []).map(b => b.text || '').join('').trim();
  if (!raw) throw new Error('IA retornou texto vazio.');

  const clean = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── IA: ELABORAR (sheet) ──────────────────────────────────
window.elaborarFcaIA = async function () {
  const fato  = document.getElementById('fca-fato').value.trim();
  const causa = document.getElementById('fca-causa').value.trim();
  const acao  = document.getElementById('fca-acao').value.trim();
  const equip = document.getElementById('fca-equip').value.trim();

  if (!fato && !causa && !acao) {
    showToast('Preencha ao menos um campo antes de elaborar.', 1);
    return;
  }

  const prompt = buildFcaPrompt(fato, causa, acao, equip, '', '', '');
  const btnEl   = document.getElementById('btn-fca-ai');
  const resultEl = document.getElementById('fca-ai-result');
  const textEl   = document.getElementById('fca-ai-text');

  btnEl.disabled = true;
  btnEl.textContent = '✦ Elaborando...';
  resultEl.style.display = 'none';
  fcaIaSugestao = null;

  try {
    const parsed = await chamarIA(prompt);
    fcaIaSugestao = parsed;
    const display =
      `📌 FATO\n${parsed.fato || '—'}\n\n` +
      `🔍 CAUSA\n${parsed.causa || '—'}\n\n` +
      `✅ AÇÃO\n${parsed.acao || '—'}`;
    textEl.textContent = display;
    resultEl.style.display = 'block';
    showToast('✓ Sugestão gerada! Revise e clique em "Aplicar".');
  } catch (e) {
    showToast('Erro ao chamar IA: ' + e.message, 1);
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = '✦ Elaborar com IA';
  }
};

window.aplicarSugestaoIA = function () {
  if (!fcaIaSugestao) return;
  if (fcaIaSugestao.fato)  document.getElementById('fca-fato').value  = fcaIaSugestao.fato;
  if (fcaIaSugestao.causa) document.getElementById('fca-causa').value = fcaIaSugestao.causa;
  if (fcaIaSugestao.acao)  document.getElementById('fca-acao').value  = fcaIaSugestao.acao;
  document.getElementById('fca-ai-result').style.display = 'none';
  showToast('✓ Campos preenchidos com a sugestão!');
};

// ── IA: REFINAR (modal de visualização) ───────────────────
window.refinarFcaViewIA = async function () {
  const r = fcaCache.find(x => x.id === fcaViewId);
  if (!r) return;

  const prompt = buildFcaPrompt(
    r.fato, r.causa, r.acao,
    r.equip, r.modo || '', r.impacto || '', r.tipo_int || ''
  );

  const btn = document.querySelector('#ov-fca-view .fca-ai-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '✦ Refinando...';

  try {
    const parsed = await chamarIA(prompt);

    if (parsed.fato)  document.getElementById('fv-fato').textContent  = parsed.fato;
    if (parsed.causa) document.getElementById('fv-causa').textContent = parsed.causa;
    if (parsed.acao)  document.getElementById('fv-acao').textContent  = parsed.acao;

    // Salvar de volta no Supabase
    await sb.from(FCA_TABLE).update({
      fato: parsed.fato, causa: parsed.causa, acao: parsed.acao
    }).eq('id', fcaViewId);

    showToast('✓ FCA refinado e salvo!');
  } catch (e) {
    showToast('Erro: ' + e.message, 1);
  } finally {
    btn.disabled = false;
    btn.textContent = '✦ Refinar com IA';
  }
};

// ── REALTIME ─────────────────────────────────────────────
function startRT() {
  sb.channel('rt-fca-page')
    .on('postgres_changes', { event: '*', schema: 'public', table: FCA_TABLE }, async () => {
      await loadFcas();
    })
    .subscribe();
}

// ── INIT ─────────────────────────────────────────────────
(async function init() {
  // Restaura nome do localStorage
  try {
    const n = localStorage.getItem('tn');
    if (n) {
      nome = n;
      document.getElementById('f-nome').value = n;
      document.getElementById('nbanner').innerHTML =
        `<div class="nbanner"><span class="puls"></span>Logado como <strong>${n}</strong></div>`;
    }
  } catch (e) {}

  setSt('load', 'Conectando ao Supabase...');
  await loadFcas();
  startRT();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
