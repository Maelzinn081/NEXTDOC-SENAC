(function(){

  "use strict";

  // ---------- estado mock ----------
  const USERS = {
    corporativo: { password: "corp123", type: "Corporativo", label: "Acesso total", email: "corporativo@nextdoc.local" },
    comum:       { password: "user123", type: "Comum", label: "Acesso restrito a funcionalidades básicas", email: "comum@nextdoc.local" }
  };

  // páginas permitidas por tipo de usuário
  const PAGE_PERMISSIONS = {
    dashboard:       ["Corporativo", "Comum"],
    pastas:          ["Corporativo", "Comum"],
    compartilhados:  ["Corporativo", "Comum"],
    recentes:        ["Corporativo"],
    lixeira:         ["Corporativo", "Comum"],
    configuracoes:   ["Corporativo", "Comum"],
    atividades:      ["Corporativo", "Comum"],
    escanear:        ["Corporativo"]
  };
  function canAccess(page){
    if (!state.user) return false;
    return PAGE_PERMISSIONS[page].includes(state.user.type);
  }

  const FOLDER_META = {
    "Pessoal":   { color: "#7c3aed", bg: "#f2ebfe", icon: "👤" },
    "Financeiro":{ color: "#f2a900", bg: "#fdf1da", icon: "💰" },
    "Médico":    { color: "#a855f7", bg: "#f7ecfe", icon: "⚕️" },
    "Jurídico":  { color: "#5b6178", bg: "#eceef5", icon: "⚖️" },
    "Trabalho":  { color: "#f4714f", bg: "#fdece5", icon: "💼" }
  };

  let state = {
    user: null,
    theme: "light",
    docs: [
      { id: 1, name: "Relatório Mensal.pdf", folder: "Trabalho", date: "22/07/2026 14:30", size: "5.2 MB" },
      { id: 2, name: "Nota Fiscal 001.pdf", folder: "Financeiro", date: "22/07/2026 10:15", size: "3.1 MB" },
      { id: 3, name: "Apresentação.pdf", folder: "Trabalho", date: "20/07/2026 09:45", size: "8.3 MB" },
      { id: 4, name: "Contrato 2026.pdf", folder: "Jurídico", date: "19/07/2026 16:20", size: "4.5 MB" },
      { id: 5, name: "Documento Pessoal 1.pdf", folder: "Pessoal", date: "18/07/2026 08:10", size: "1.2 MB" },
      { id: 6, name: "Recibo Consulta.pdf", folder: "Médico", date: "17/07/2026 12:00", size: "0.8 MB" }
    ],
    trash: [],
    shared: [
      { id: 101, name: "Proposta Comercial.pdf", from: "ana.souza@empresa.com", date: "21/07/2026" },
      { id: 102, name: "Manual do Colaborador.pdf", from: "rh@empresa.com", date: "15/07/2026" }
    ],
    nextId: 200,
    storageUsedGB: 2.4,
    storageTotalGB: 10,
    navHistory: [],
    activityLog: [],
    recentesSort: "recent",
    recentesFilter: ""
  };

  let currentPage = "dashboard";
  const main = document.getElementById("main-content");

  // ---------- persistência: IndexedDB (sempre) + Oracle (se disponível) ----------
  let dbReady = false;

  (async function hydrateFromIndexedDB(){
    try {
      const seeded = await SecureDB.getMeta("seeded");
      if (!seeded){
        await SecureDB.bulkPut("docs", state.docs);
        await SecureDB.bulkPut("trash", state.trash);
        await SecureDB.bulkPut("shared", state.shared);
        await SecureDB.setMeta("seeded", true);
      } else {
        const [docs, trash, shared, activity] = await Promise.all([
          SecureDB.getAll("docs"), SecureDB.getAll("trash"),
          SecureDB.getAll("shared"), SecureDB.getAll("activity")
        ]);
        state.docs = docs;
        state.trash = trash;
        state.shared = shared;
        state.activityLog = activity;
        // garante que novos documentos continuem com ids únicos
        const maxId = Math.max(0, ...docs.map(d=>d.id), ...trash.map(d=>d.id));
        if (maxId >= state.nextId) state.nextId = maxId + 1;
      }
      dbReady = true;
    } catch (err){
      console.warn("IndexedDB indisponível, usando dados apenas em memória:", err.message);
    }
  })();

  function persistAll(){
    if (!dbReady) return;
    SecureDB.clear("docs").then(()=>SecureDB.bulkPut("docs", state.docs)).catch(()=>{});
    SecureDB.clear("trash").then(()=>SecureDB.bulkPut("trash", state.trash)).catch(()=>{});
    SecureDB.clear("shared").then(()=>SecureDB.bulkPut("shared", state.shared)).catch(()=>{});
    SecureDB.clear("activity").then(()=>SecureDB.bulkPut("activity", state.activityLog)).catch(()=>{});
  }

  // dispara uma chamada best-effort ao backend Oracle, se ele estiver disponível
  function syncBackend(fn){
    if (!state.user) return;
    SecureAPI.isAvailable().then(ok=>{
      if (ok) fn(SecureAPI).catch(err=> console.warn("Sincronização com Oracle falhou:", err.message));
    });
  }

  function toast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(()=> t.classList.add("hidden"), 2400);
  }

  function logActivity(action, detail, icon){
    const now = new Date();
    const time = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    state.activityLog.push({ action, detail, time, icon: icon || "📝" });
    if (state.activityLog.length > 200) state.activityLog.shift();
    persistAll();
  }

  // ---------- login ----------
  document.getElementById("login-form").addEventListener("submit", async function(e){
    e.preventDefault();
    const u = document.getElementById("username").value.trim().toLowerCase();
    const p = document.getElementById("password").value;
    const errorBox = document.getElementById("login-error");
    const match = USERS[u];
    if (match && match.password === p){
      state.user = { username: u, ...match };
      errorBox.classList.add("hidden");
      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("app-screen").classList.remove("hidden");
      document.getElementById("sidebar-username").textContent = u.charAt(0).toUpperCase()+u.slice(1);
      document.getElementById("sidebar-usertype").textContent = match.type + " · " + match.label;
      applyPermissions();
      state.navHistory = [];
      logActivity("Login realizado", u + " (" + match.type + ")", "🔑");
      navigate("dashboard");

      // se o backend Oracle estiver disponível, ele passa a ser a fonte de verdade
      const backendOk = await SecureAPI.isAvailable();
      if (backendOk){
        try {
          const [docs, trash, shared, activity, storage] = await Promise.all([
            SecureAPI.getDocs(u), SecureAPI.getTrash(u), SecureAPI.getShared(u),
            SecureAPI.getActivity(u), SecureAPI.getStorage(u)
          ]);
          state.docs = docs.map(r=>({ id:r.DOC_ID, name:r.DOC_NAME, folder:r.FOLDER_NAME, date:r.CREATED_STR, size:r.DOC_SIZE_MB+" MB" }));
          state.trash = trash.map(r=>({ id:r.DOC_ID, name:r.DOC_NAME, folder:r.FOLDER_NAME, date:r.TRASHED_STR, size:r.DOC_SIZE_MB+" MB" }));
          state.shared = shared.map(r=>({ id:r.SHARED_ID, name:r.DOC_NAME, from:r.SHARED_FROM, date:r.SHARED_STR }));
          state.activityLog = activity.map(r=>({ action:r.ACTION_NAME, detail:r.DETAIL_TXT, icon:r.ICON, time:r.LOGGED_STR })).reverse();
          state.storageUsedGB = storage.usedGB;
          persistAll();
          toast("✅ Backend conectado — dados sincronizados");
          render();
        } catch (err){
          console.warn("Falha ao sincronizar com Oracle, mantendo dados locais:", err.message);
        }
      }
    } else {
      errorBox.classList.remove("hidden");
    }
  });

  document.getElementById("logout-btn").addEventListener("click", function(){
    if (state.user) logActivity("Logout", state.user.username, "🚪");
    state.user = null;
    state.navHistory = [];
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("login-form").reset();
  });

  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click", function(){
      navigate(btn.dataset.page);
      if (window.innerWidth <= 760){
        document.querySelector(".sidebar").classList.remove("open");
        document.getElementById("sidebar-overlay").classList.remove("show");
      }
    });
  });

  window.__toggleSidebar = function(){
    document.querySelector(".sidebar").classList.toggle("open");
    document.getElementById("sidebar-overlay").classList.toggle("show");
  };

  function navigate(page){
    if (!canAccess(page)){
      toast("Acesso restrito ao perfil Corporativo");
      page = "dashboard";
    }
    if (page !== currentPage){
      state.navHistory.push(currentPage);
      if (state.navHistory.length > 15) state.navHistory.shift();
    }
    currentPage = page;
    document.querySelectorAll(".nav-item").forEach(b=> b.classList.toggle("active", b.dataset.page===page));
    render();
  }
  window.__navigate = navigate; // usado pelos cards do dashboard

  window.__goBack = function(){
    if (!state.navHistory.length) return;
    currentPage = state.navHistory.pop();
    document.querySelectorAll(".nav-item").forEach(b=> b.classList.toggle("active", b.dataset.page===currentPage));
    render();
  };

  function applyPermissions(){
    document.querySelectorAll(".nav-item").forEach(btn=>{
      const allowed = canAccess(btn.dataset.page);
      btn.classList.toggle("hidden", !allowed);
    });
  }

  // ---------- helpers ----------
  function folderCounts(){
    const counts = {};
    Object.keys(FOLDER_META).forEach(f=> counts[f]=0);
    state.docs.forEach(d=> counts[d.folder] = (counts[d.folder]||0)+1);
    return counts;
  }
  function totalDocs(){ return state.docs.length; }
  function totalFolders(){ return Object.keys(FOLDER_META).length; }

  function docRowHTML(d, opts){
    opts = opts || {};
    return `
      <div class="list-row">
        <div class="file-icon" style="cursor:pointer;" onclick="__openPreview(${d.id}, '${opts.trashed ? "trash" : "docs"}')">📄</div>
        <div class="file-info">
          <div class="file-name clickable" onclick="__openPreview(${d.id}, '${opts.trashed ? "trash" : "docs"}')">${d.name} <span title="Criptografado">🔒</span></div>
          <div class="file-meta"><span class="tag">${d.folder}</span> ${d.date} · ${d.size}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" title="Baixar" onclick="__downloadDoc(${d.id})">⬇️</button>
          ${opts.trashed
            ? `<button class="icon-btn" title="Restaurar" onclick="__restoreDoc(${d.id})">↩️</button>
               <button class="icon-btn danger" title="Excluir definitivamente" onclick="__deleteForever(${d.id})">🗑️</button>`
            : `<button class="icon-btn" title="Renomear/mover" onclick="__openEdit(${d.id})">✏️</button>
               <button class="icon-btn danger" title="Mover para lixeira" onclick="__trashDoc(${d.id})">🗑️</button>`
          }
        </div>
      </div>`;
  }

  window.__downloadDoc = function(id){
    toast("Simulando download… (demo)");
  };
  window.__trashDoc = function(id){
    const idx = state.docs.findIndex(d=>d.id===id);
    if (idx>-1){
      const [doc] = state.docs.splice(idx,1);
      state.trash.push(doc);
      logActivity("Movido para lixeira", doc.name, "🗑️");
      toast("Documento movido para a lixeira");
      render();
      syncBackend(api => api.trashDoc(state.user.username, id));
    }
  };
  window.__restoreDoc = function(id){
    const idx = state.trash.findIndex(d=>d.id===id);
    if (idx>-1){
      const [doc] = state.trash.splice(idx,1);
      state.docs.push(doc);
      logActivity("Restaurado da lixeira", doc.name, "↩️");
      toast("Documento restaurado");
      render();
      syncBackend(api => api.restoreDoc(state.user.username, id));
    }
  };
  window.__deleteForever = function(id){
    askConfirm(
      "Excluir definitivamente?",
      "O documento será apagado permanentemente e não poderá ser restaurado.",
      function(){
        const idx = state.trash.findIndex(d=>d.id===id);
        if (idx>-1){
          const [doc] = state.trash.splice(idx,1);
          logActivity("Excluído permanentemente", doc.name, "❌");
          toast("Documento excluído definitivamente");
          render();
          syncBackend(api => api.deleteForever(state.user.username, id));
        }
      }
    );
  };

  // ---------- modal de confirmação genérico ----------
  let confirmCallback = null;
  function askConfirm(title, text, onConfirm){
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-text").textContent = text;
    confirmCallback = onConfirm;
    document.getElementById("confirm-modal").classList.remove("hidden");
  }
  window.__closeConfirm = function(){
    document.getElementById("confirm-modal").classList.add("hidden");
    confirmCallback = null;
  };
  document.getElementById("confirm-btn").addEventListener("click", function(){
    if (confirmCallback) confirmCallback();
    __closeConfirm();
  });

  // ---------- renomear / mover documento ----------
  let editCurrentId = null;
  window.__openEdit = function(id){
    const d = findDoc(id, "docs");
    if (!d) return;
    editCurrentId = id;
    document.getElementById("edit-name").value = d.name;
    const sel = document.getElementById("edit-folder");
    sel.innerHTML = Object.keys(FOLDER_META).map(f=>
      `<option value="${f}" ${f===d.folder ? "selected" : ""}>${f}</option>`
    ).join("");
    document.getElementById("edit-modal").classList.remove("hidden");
  };
  window.__closeEdit = function(){
    document.getElementById("edit-modal").classList.add("hidden");
    editCurrentId = null;
  };
  window.__saveEdit = function(){
    const d = findDoc(editCurrentId, "docs");
    if (!d) return;
    const targetId = editCurrentId;
    const newName = document.getElementById("edit-name").value.trim() || d.name;
    const newFolder = document.getElementById("edit-folder").value;
    const oldFolder = d.folder;
    const oldName = d.name;
    d.name = newName;
    d.folder = newFolder;
    if (oldFolder !== newFolder){
      logActivity("Documento movido", `${newName}: ${oldFolder} → ${newFolder}`, "📂");
    }
    if (oldName !== newName){
      logActivity("Documento renomeado", `${oldName} → ${newName}`, "✏️");
    }
    toast("Documento atualizado");
    __closeEdit();
    render();
    syncBackend(api => api.renameMoveDoc(state.user.username, targetId, d.name, d.folder));
  };

  function findDoc(id, source){
    const list = source === "trash" ? state.trash : source === "shared" ? state.shared : state.docs;
    return list.find(d=>d.id===id);
  }

  let previewCurrentId = null;
  window.__openPreview = function(id, source){
    const d = findDoc(id, source);
    if (!d) return;
    previewCurrentId = id;
    document.getElementById("preview-name").textContent = d.name;
    const metaParts = [];
    if (d.folder) metaParts.push(`<span class="tag">${d.folder}</span>`);
    if (d.date) metaParts.push(d.date);
    if (d.size) metaParts.push(d.size);
    if (d.from) metaParts.push("de " + d.from);
    document.getElementById("preview-meta").innerHTML = metaParts.join(" · ");
    document.getElementById("preview-modal").classList.remove("hidden");
  };
  window.__closePreview = function(){
    document.getElementById("preview-modal").classList.add("hidden");
    previewCurrentId = null;
  };
  document.getElementById("preview-download-btn").addEventListener("click", function(){
    if (previewCurrentId!==null) __downloadDoc(previewCurrentId);
  });

  // ---------- busca global ----------
  window.__globalSearch = function(query){
    const box = document.getElementById("search-results");
    if (!box) return;
    const q = query.trim().toLowerCase();
    if (!q){ box.classList.add("hidden"); box.innerHTML = ""; return; }
    const matches = state.docs.filter(d=> d.name.toLowerCase().includes(q)).slice(0,8);
    box.innerHTML = matches.length
      ? matches.map(d=>`
          <div class="search-item" onclick="__openPreview(${d.id}, 'docs'); __clearSearch();">
            📄 <b>${d.name}</b> <span class="tag">${d.folder}</span>
          </div>`).join("")
      : `<div class="search-empty">Nenhum resultado para “${query}”</div>`;
    box.classList.remove("hidden");
  };
  window.__clearSearch = function(){
    const input = document.getElementById("global-search");
    const box = document.getElementById("search-results");
    if (input) input.value = "";
    if (box){ box.classList.add("hidden"); box.innerHTML = ""; }
  };
  document.addEventListener("click", function(e){
    const wrap = document.querySelector(".search-wrap");
    if (wrap && !wrap.contains(e.target)){
      const box = document.getElementById("search-results");
      if (box) box.classList.add("hidden");
    }
  });

  // ---------- topbar (voltar + busca) ----------
  function renderTopBar(){
    const backBtn = state.navHistory.length
      ? `<button class="icon-btn back-btn" onclick="__goBack()" title="Voltar">←</button>`
      : "";
    return `
      <div class="app-topbar">
        ${backBtn}
        <div class="search-wrap">
          <input type="text" id="global-search" class="search-input" placeholder='$ find ~/ -name "*.pdf"' oninput="__globalSearch(this.value)" autocomplete="off">
          <div class="search-results hidden" id="search-results"></div>
        </div>
      </div>`;
  }

  // ---------- páginas ----------
  function pageDashboard(){
    const counts = folderCounts();
    return `
      <p class="page-title">Menu Principal</p>
      <p class="page-sub">O que você gostaria de fazer?</p>
      <div class="stats-row">
        <div class="stat-card"><div class="num">${totalDocs()}</div><div class="label">Docs</div></div>
        <div class="stat-card"><div class="num">${totalFolders()}</div><div class="label">Pastas</div></div>
        <div class="stat-card"><div class="num">${state.storageUsedGB} GB</div><div class="label">Uso</div></div>
      </div>
      <div class="grid">
        <div class="card" onclick="__navigate('pastas')"><div class="icon" style="background:#f2ebfe;">📂</div><h3>Minhas Pastas</h3><p>Visualize todas as suas pastas</p></div>
        ${canAccess('escanear') ? `<div class="card" onclick="__navigate('escanear')"><div class="icon" style="background:#e6f7ef;">📷</div><h3>Escanear/Enviar</h3><p>Adicione novos documentos</p></div>` : ""}
        <div class="card" onclick="__navigate('compartilhados')"><div class="icon" style="background:#f0e9fc;">🔗</div><h3>Compartilhados</h3><p>Documentos compartilhados com você</p></div>
        ${canAccess('recentes') ? `<div class="card" onclick="__navigate('recentes')"><div class="icon" style="background:#fdeadc;">🕐</div><h3>Recentes</h3><p>Seus documentos recentes</p></div>` : ""}
        <div class="card" onclick="__navigate('lixeira')"><div class="icon" style="background:#fdeceb;">🗑️</div><h3>Lixeira</h3><p>Documentos deletados</p></div>
        <div class="card" onclick="__navigate('atividades')"><div class="icon" style="background:#ede9fe;">📝</div><h3>Atividades</h3><p>Histórico de ações na conta</p></div>
        <div class="card" onclick="__navigate('configuracoes')"><div class="icon" style="background:#eceef5;">⚙️</div><h3>Configurações</h3><p>Gerencie sua conta e preferências</p></div>
      </div>`;
  }

  function pagePastas(){
    const counts = folderCounts();
    const cards = Object.keys(FOLDER_META).map(f=>{
      const meta = FOLDER_META[f];
      return `
        <div class="card folder-card" onclick="__filterFolder('${f}')">
          <span class="folder-count">${counts[f]} docs</span>
          <div class="icon" style="background:${meta.bg};">${meta.icon}</div>
          <h3>${f}</h3>
          <p>${counts[f]} documento${counts[f]===1?"":"s"}</p>
        </div>`;
    }).join("");
    return `
      <p class="page-title">Minhas Pastas</p>
      <p class="page-sub">Organize seus documentos por categoria</p>
      <div class="grid">${cards}</div>
      <div id="folder-detail" style="margin-top:26px;"></div>`;
  }

  window.__filterFolder = function(folder){
    const docs = state.docs.filter(d=>d.folder===folder);
    const box = document.getElementById("folder-detail");
    if (!box) return;
    box.innerHTML = `<h3 style="margin-bottom:12px;">📂 ${folder}</h3>` +
      (docs.length ? docs.map(d=>docRowHTML(d)).join("") : `<div class="empty-state"><div class="e-icon">📭</div>Nenhum documento nesta pasta.</div>`);
  };

  function pageRecentes(){
    const sortBy = state.recentesSort || "recent";
    const filterFolder = state.recentesFilter || "";
    let list = [...state.docs];
    if (filterFolder) list = list.filter(d=>d.folder===filterFolder);
    list.sort((a,b)=>{
      if (sortBy==="name-asc") return a.name.localeCompare(b.name);
      if (sortBy==="name-desc") return b.name.localeCompare(a.name);
      if (sortBy==="size-desc") return parseFloat(b.size)-parseFloat(a.size);
      if (sortBy==="oldest") return a.id-b.id;
      return b.id-a.id; // mais recente primeiro
    });
    return `
      <p class="page-title">Arquivos Recentes</p>
      <p class="page-sub">Documentos que você acessou recentemente</p>
      <div class="filter-bar">
        <select onchange="__setRecentesSort(this.value)">
          <option value="recent" ${sortBy==="recent"?"selected":""}>Ordenar: Mais recente</option>
          <option value="oldest" ${sortBy==="oldest"?"selected":""}>Ordenar: Mais antigo</option>
          <option value="name-asc" ${sortBy==="name-asc"?"selected":""}>Ordenar: Nome A-Z</option>
          <option value="name-desc" ${sortBy==="name-desc"?"selected":""}>Ordenar: Nome Z-A</option>
          <option value="size-desc" ${sortBy==="size-desc"?"selected":""}>Ordenar: Maior tamanho</option>
        </select>
        <select onchange="__setRecentesFilter(this.value)">
          <option value="">Todas as pastas</option>
          ${Object.keys(FOLDER_META).map(f=>`<option value="${f}" ${filterFolder===f?"selected":""}>${f}</option>`).join("")}
        </select>
      </div>
      ${list.length ? list.map(d=>docRowHTML(d)).join("") : `<div class="empty-state"><div class="e-icon">📭</div>Nenhum documento encontrado.</div>`}`;
  }
  window.__setRecentesSort = function(v){ state.recentesSort = v; render(); };
  window.__setRecentesFilter = function(v){ state.recentesFilter = v; render(); };

  function pageCompartilhados(){
    return `
      <p class="page-title">Compartilhados</p>
      <p class="page-sub">Documentos compartilhados com você</p>
      ${state.shared.map(d=>`
        <div class="list-row">
          <div class="file-icon" style="cursor:pointer;" onclick="__openPreview(${d.id}, 'shared')">🔗</div>
          <div class="file-info">
            <div class="file-name clickable" onclick="__openPreview(${d.id}, 'shared')">${d.name}</div>
            <div class="file-meta">Compartilhado por ${d.from} · ${d.date}</div>
          </div>
          <div class="row-actions"><button class="icon-btn" title="Baixar" onclick="__downloadDoc(${d.id})">⬇️</button></div>
        </div>`).join("")}`;
  }

  function pageLixeira(){
    return `
      <p class="page-title">Lixeira</p>
      <p class="page-sub">Documentos removidos — restaure ou exclua definitivamente</p>
      ${state.trash.length ? state.trash.map(d=>docRowHTML(d,{trashed:true})).join("") : `<div class="empty-state"><div class="e-icon">🗑️</div>A lixeira está vazia.</div>`}`;
  }

  function pageAtividades(){
    const logs = [...state.activityLog].reverse();
    return `
      <p class="page-title">Log de Atividades</p>
      <p class="page-sub">Histórico de ações realizadas na sua conta</p>
      ${logs.length ? logs.map(l=>`
        <div class="list-row">
          <div class="file-icon activity-icon">${l.icon}</div>
          <div class="file-info">
            <div class="file-name">${l.action}</div>
            <div class="file-meta">${l.detail} · ${l.time}</div>
          </div>
        </div>`).join("") : `<div class="empty-state"><div class="e-icon">📝</div>Nenhuma atividade registrada ainda.</div>`}`;
  }

  function pageConfiguracoes(){
    const pct = Math.min(100, Math.round((state.storageUsedGB/state.storageTotalGB)*100));
    return `
      <p class="page-title">Configurações e Personalização</p>
      <p class="page-sub">Gerencie sua conta e preferências</p>

      <div class="panel">
        <h3>☀️ Tema da Aplicação</h3>
        <p style="font-size:13px;color:var(--text-soft);margin:0 0 4px;">Escolha entre tema claro ou escuro</p>
        <div class="theme-toggle">
          <button class="theme-btn ${state.theme==='light'?'active':''}" onclick="__setTheme('light')">☀️ Claro</button>
          <button class="theme-btn ${state.theme==='dark'?'active':''}" onclick="__setTheme('dark')">🌙 Escuro</button>
        </div>
      </div>

      <div class="panel">
        <h3>👤 Gerenciamento de Conta</h3>
        <div class="form-row">
          <label>Nome de Usuário</label>
          <input type="text" value="${state.user.username}" disabled>
        </div>
        <div class="form-row">
          <label>Tipo de Usuário</label>
          <div class="badge">${state.user.type === 'Corporativo' ? '🏢' : '👤'} ${state.user.type} — ${state.user.label}</div>
        </div>
        <div class="form-row">
          <label>Email</label>
          <input type="text" value="${state.user.email}" disabled>
        </div>
      </div>

      <div class="panel">
        <h3>💾 Monitoramento de Dados</h3>
        <p style="font-size:13px;margin:0;">${state.storageUsedGB} GB de ${state.storageTotalGB} GB usados</p>
        <div class="storage-bar-track"><div class="storage-bar-fill" style="width:${pct}%;"></div></div>
      </div>

      <div class="panel">
        <h3>🗄️ Armazenamento e Sincronização</h3>
        <p style="font-size:13px;margin:0 0 8px;">Local (IndexedDB): <b style="color:var(--green);">🟢 ativo neste navegador</b></p>
        <p style="font-size:13px;margin:0;" id="backend-status">Backend remoto: verificando…</p>
      </div>`;
  }

  function pageEscanear(){
    return `
      <p class="page-title">Escanear e Enviar</p>
      <p class="page-sub">Adicione um novo documento ao seu cofre digital</p>
      <div class="upload-grid">
        <div class="dropzone" id="dropzone" onclick="document.getElementById('fake-file').click()">
          <div class="dz-icon">📎</div>
          <div class="dz-title">Arraste seu documento aqui</div>
          <div class="dz-sub">ou clique para selecionar arquivo · PDF, JPG, PNG (máx. 20MB)</div>
          <input type="file" id="fake-file" style="display:none" onchange="__fileChosen(this)">
        </div>
        <div id="chosen-file" style="margin-top:10px;font-size:13px;color:var(--text-soft);"></div>

        <form class="panel" style="margin-top:16px;" id="upload-form" onsubmit="return __submitUpload(event)">
          <h3>📄 Informações do Documento</h3>
          <div class="form-row">
            <label>Nome do Documento *</label>
            <input type="text" id="doc-name" placeholder="Ex: Recibo de Compra" required>
          </div>
          <div class="form-row">
            <label>Categoria / Pasta *</label>
            <select id="doc-folder" required>
              <option value="">Selecione uma pasta</option>
              ${Object.keys(FOLDER_META).map(f=>`<option value="${f}">${f}</option>`).join("")}
            </select>
          </div>
          <div class="form-row">
            <label>Tags (opcional)</label>
            <input type="text" id="doc-tags" placeholder="Ex: invoice, tax, 2026">
          </div>
          <div class="form-row">
            <label>Nível de Segurança</label>
            <div class="radio-option"><input type="radio" name="seguranca" value="privado" checked><div>Privado<small>Apenas você pode acessar</small></div></div>
            <div class="radio-option"><input type="radio" name="seguranca" value="compartilhado"><div>Compartilhado<small>Selecione pessoas para compartilhar</small></div></div>
          </div>
          <button class="btn-primary" type="submit">Salvar no vault</button>
        </form>
      </div>`;
  }

  window.__fileChosen = function(input){
    const box = document.getElementById("chosen-file");
    if (input.files && input.files[0]){
      box.textContent = "Selecionado: " + input.files[0].name;
      if (!document.getElementById("doc-name").value){
        document.getElementById("doc-name").value = input.files[0].name.replace(/\.[^/.]+$/, "");
      }
    }
  };

  window.__submitUpload = function(e){
    e.preventDefault();
    const name = document.getElementById("doc-name").value.trim();
    const folder = document.getElementById("doc-folder").value;
    if (!name || !folder){ toast("Preencha nome e pasta do documento"); return false; }
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    const finalName = name.match(/\.\w+$/) ? name : name + ".pdf";
    const sizeMb = +(Math.random()*8+0.5).toFixed(1);
    state.docs.unshift({
      id: state.nextId++,
      name: finalName,
      folder: folder,
      date: dateStr,
      size: sizeMb + " MB"
    });
    state.storageUsedGB = +(state.storageUsedGB + 0.1).toFixed(1);
    logActivity("Documento enviado", finalName, "📤");
    toast("Documento salvo com sucesso!");
    navigate("recentes");
    syncBackend(api => api.createDoc(state.user.username, finalName, folder, sizeMb));
    return false;
  };

  window.__setTheme = function(t){
    state.theme = t;
    document.body.setAttribute("data-theme", t);
    render();
  };

  // ---------- render principal ----------
  function render(){
    let html = "";
    switch(currentPage){
      case "dashboard": html = pageDashboard(); break;
      case "pastas": html = pagePastas(); break;
      case "recentes": html = pageRecentes(); break;
      case "compartilhados": html = pageCompartilhados(); break;
      case "lixeira": html = pageLixeira(); break;
      case "atividades": html = pageAtividades(); break;
      case "configuracoes": html = pageConfiguracoes(); break;
      case "escanear": html = pageEscanear(); break;
      default: html = pageDashboard();
    }
    main.innerHTML = renderTopBar() + html;

    if (currentPage === "configuracoes"){
      SecureAPI.isAvailable().then(ok=>{
        const el = document.getElementById("backend-status");
        if (!el) return;
        el.innerHTML = ok
          ? 'Backend remoto: <b style="color:var(--green);">🟢 conectado — sincronizando</b>'
          : 'Backend remoto: <b style="color:var(--text-soft);">⚪ não detectado (rodando só com IndexedDB)</b>';
      });
    }
  }

})();
