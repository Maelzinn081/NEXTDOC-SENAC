(function(){

  "use strict";

  // ================= USUÁRIOS =================
  // O Admin é fixo (só quem sabe a senha entra). Os demais usuários são
  // criados via "Criar conta" e ficam guardados no IndexedDB (store "users").
  const ADMIN_SEED = { username: "admin", password: "Admin2026", type: "Admin", label: "Acesso total", email: "admin@nextdoc.local" };
  const DEMO_SEED  = { username: "comum", password: "user123", type: "Comum", label: "Acesso restrito a funcionalidades básicas", email: "comum@nextdoc.local" };

  // páginas permitidas por tipo de usuário
  const PAGE_PERMISSIONS = {
    dashboard:       ["Admin", "Comum"],
    pastas:          ["Admin", "Comum"],
    compartilhados:  ["Admin", "Comum"],
    recentes:        ["Admin"],
    lixeira:         ["Admin", "Comum"],
    configuracoes:   ["Admin", "Comum"],
    atividades:      ["Admin", "Comum"],
    empresa:         ["Comum"],
    solicitacoes:    ["Admin"],
    escanear:        ["Admin", "Comum"]
  };
  function canAccess(page){
    if (!state.user) return false;
    return PAGE_PERMISSIONS[page].includes(state.user.type);
  }
  function isAdmin(){ return !!state.user && state.user.type === "Admin"; }

  // ================= PASTAS =================
  const FOLDER_META = {
    "RH":            { color: "#7c3aed", bg: "#f2ebfe", icon: "🧑‍💼", full: "Recursos Humanos" },
    "DP":            { color: "#f2a900", bg: "#fdf1da", icon: "🗂️", full: "Departamento Pessoal" },
    "Financeiro":    { color: "#a855f7", bg: "#f7ecfe", icon: "💰", full: "Financeiro" },
    "Contabilidade": { color: "#5b6178", bg: "#eceef5", icon: "📊", full: "Contabilidade" },
    "Atestados":     { color: "#f4714f", bg: "#fdece5", icon: "🩺", full: "Atestados" }
  };

  let state = {
    user: null,
    theme: "light",
    users: {},          // username -> {password, type, label, email}
    docs: [],
    trash: [],
    accessRequests: [],
    nextId: 200,
    nextReqId: 1,
    storageUsedGB: 0,
    storageTotalGB: 10,
    navHistory: [],
    activityLog: [],
    recentesSort: "recent",
    recentesFilter: ""
  };

  let currentPage = "dashboard";
  const main = document.getElementById("main-content");

  // ================= LOADING OVERLAY =================
  function showLoading(){ document.getElementById("loading-screen").classList.remove("hidden"); }
  function hideLoading(){ document.getElementById("loading-screen").classList.add("hidden"); }
  function waitLoading(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

  // ================= persistência: IndexedDB (sempre) + backend (se disponível) =================
  let dbReady = false;

  (async function hydrate(){
    showLoading();
    try {
      const [docs, trash, activity, requests, users] = await Promise.all([
        SecureDB.getAll("docs"), SecureDB.getAll("trash"), SecureDB.getAll("activity"),
        SecureDB.getAll("accessRequests").catch(()=>[]), SecureDB.getAll("users").catch(()=>[])
      ]);

      // normaliza documentos antigos (de versões anteriores) com os novos campos
      function normalizeDoc(d){
        return Object.assign({
          owner: "admin", lastEditedBy: d.owner || "admin",
          visibility: "privado", allowedEditors: [], fileData: null, fileType: null
        }, d);
      }
      state.docs = docs.map(normalizeDoc);
      state.trash = trash.map(normalizeDoc);
      state.activityLog = activity;
      state.accessRequests = requests || [];

      // garante que o Admin (e a conta demo) sempre existam
      const usersMap = {};
      users.forEach(u => { usersMap[u.username] = u; });
      let needsUserSave = false;
      if (!usersMap["admin"]) { usersMap["admin"] = ADMIN_SEED; needsUserSave = true; }
      if (!usersMap["comum"]) { usersMap["comum"] = DEMO_SEED; needsUserSave = true; }
      state.users = usersMap;
      if (needsUserSave) await persistUsers();

      const maxId = Math.max(0, ...state.docs.map(d=>d.id), ...state.trash.map(d=>d.id));
      if (maxId >= state.nextId) state.nextId = maxId + 1;
      const maxReqId = Math.max(0, ...state.accessRequests.map(r=>r.id));
      if (maxReqId >= state.nextReqId) state.nextReqId = maxReqId + 1;

      recalcStorage();
      dbReady = true;
    } catch (err){
      console.warn("IndexedDB indisponível, usando dados apenas em memória:", err.message);
      state.users = { admin: ADMIN_SEED, comum: DEMO_SEED };
    }
    await waitLoading(500);
    hideLoading();
  })();

  function recalcStorage(){
    const totalMb = state.docs.reduce((sum,d)=> sum + parseFloat(d.size||0), 0);
    state.storageUsedGB = +(totalMb/1024).toFixed(2);
  }

  function persistAll(){
    if (!dbReady) return;
    SecureDB.clear("docs").then(()=>SecureDB.bulkPut("docs", state.docs)).catch(()=>{});
    SecureDB.clear("trash").then(()=>SecureDB.bulkPut("trash", state.trash)).catch(()=>{});
    SecureDB.clear("activity").then(()=>SecureDB.bulkPut("activity", state.activityLog)).catch(()=>{});
    SecureDB.clear("accessRequests").then(()=>SecureDB.bulkPut("accessRequests", state.accessRequests)).catch(()=>{});
  }
  function persistUsers(){
    if (!dbReady && !arguments.length) { /* ainda assim tenta, pode já estar disponível */ }
    return SecureDB.clear("users").then(()=>SecureDB.bulkPut("users", Object.values(state.users))).catch(()=>{});
  }

  // dispara uma chamada best-effort ao backend, se ele estiver disponível
  function syncBackend(fn){
    if (!state.user) return;
    SecureAPI.isAvailable().then(ok=>{
      if (ok) fn(SecureAPI).catch(err=> console.warn("Sincronização com backend falhou:", err.message));
    });
  }

  function toast(msg){
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(()=> t.classList.add("hidden"), 2600);
  }

  function logActivity(action, detail, icon){
    const now = new Date();
    const time = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    const by = state.user ? state.user.username : "sistema";
    state.activityLog.push({ action, detail, time, icon: icon || "📝", by });
    if (state.activityLog.length > 300) state.activityLog.shift();
    persistAll();
  }

  // ================= permissões sobre documentos =================
  function canEditDoc(doc){
    if (!state.user) return false;
    if (state.user.type === "Admin") return true;
    if (doc.owner === state.user.username) return true;
    return (doc.allowedEditors||[]).includes(state.user.username);
  }
  function visibleDocsForUser(){
    if (!state.user) return [];
    if (state.user.type === "Admin") return state.docs;
    return state.docs.filter(d => canEditDoc(d));
  }

  // ================= LOGIN =================
  document.getElementById("login-form").addEventListener("submit", async function(e){
    e.preventDefault();
    const u = document.getElementById("username").value.trim().toLowerCase();
    const p = document.getElementById("password").value;
    const errorBox = document.getElementById("login-error");
    const match = state.users[u];
    if (match && match.password === p){
      errorBox.classList.add("hidden");
      showLoading();
      await waitLoading(700);
      await completeLogin(u, match);
    } else {
      errorBox.classList.remove("hidden");
    }
  });

  async function completeLogin(username, userRecord){
    state.user = { username, ...userRecord };
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");
    document.getElementById("sidebar-username").textContent = username.charAt(0).toUpperCase()+username.slice(1);
    document.getElementById("sidebar-usertype").textContent = userRecord.type + " · " + userRecord.label;
    applyPermissions();
    state.navHistory = [];
    logActivity("Login realizado", username + " (" + userRecord.type + ")", "🔑");
    navigate("dashboard");
    hideLoading();

    const backendOk = await SecureAPI.isAvailable();
    if (backendOk){
      try {
        const [docs, trash, activity, storage] = await Promise.all([
          SecureAPI.getDocs(username), SecureAPI.getTrash(username),
          SecureAPI.getActivity(username), SecureAPI.getStorage(username)
        ]);
        if (Array.isArray(docs) && docs.length){
          state.docs = docs.map(mapRemoteDoc);
          state.trash = trash.map(mapRemoteDoc);
          state.activityLog = activity.map(r=>({ action:r.ACTION_NAME, detail:r.DETAIL_TXT, icon:r.ICON, time:r.LOGGED_STR, by:r.BY||"" })).reverse();
          if (storage && typeof storage.usedGB === "number") state.storageUsedGB = storage.usedGB;
          persistAll();
          toast("✅ Backend conectado — dados sincronizados");
          render();
        }
      } catch (err){
        console.warn("Falha ao sincronizar com o backend, mantendo dados locais:", err.message);
      }
    }
  }

  function mapRemoteDoc(r){
    return {
      id: r.DOC_ID, name: r.DOC_NAME, folder: r.FOLDER_NAME,
      date: r.CREATED_STR || r.TRASHED_STR, size: r.DOC_SIZE_MB + " MB",
      owner: r.OWNER || "admin", lastEditedBy: r.LAST_EDITED_BY || r.OWNER || "admin",
      visibility: r.VISIBILITY || "privado", allowedEditors: r.ALLOWED_EDITORS || [],
      fileData: r.FILE_DATA || null, fileType: r.FILE_TYPE || null
    };
  }

  // ================= CRIAR CONTA =================
  document.getElementById("signup-form").addEventListener("submit", async function(e){
    e.preventDefault();
    const u = document.getElementById("signup-username").value.trim().toLowerCase();
    const p = document.getElementById("signup-password").value;
    const email = document.getElementById("signup-email").value.trim();
    const wantsFullAccess = document.getElementById("signup-fullaccess").checked;
    const errorBox = document.getElementById("signup-error");

    if (!u || !p){ errorBox.textContent = "Preencha usuário e senha."; errorBox.classList.remove("hidden"); return; }
    if (state.users[u]){ errorBox.textContent = "Esse nome de usuário já existe."; errorBox.classList.remove("hidden"); return; }

    errorBox.classList.add("hidden");
    showLoading();
    await waitLoading(700);

    const newUser = { password: p, type: "Comum", label: "Acesso restrito a funcionalidades básicas", email: email || (u+"@nextdoc.local") };
    state.users[u] = newUser;
    await persistUsers();
    syncBackend(api => api.signup(u, p, email));

    if (wantsFullAccess){
      const reqId = state.nextReqId++;
      state.accessRequests.push({ id: reqId, kind: "conta", requester: u, docId: null, docName: null, status: "pendente", requestedAt: new Date().toLocaleDateString("pt-BR") });
      persistAll();
      syncBackend(api => api.createAccountRequest(u));
    }

    await completeLogin(u, newUser);
    if (wantsFullAccess) toast("Conta criada! Sua solicitação de acesso total foi enviada ao Admin.");
  });

  window.__showSignup = function(){
    document.getElementById("login-form-wrap").classList.add("hidden");
    document.getElementById("signup-form-wrap").classList.remove("hidden");
  };
  window.__showLogin = function(){
    document.getElementById("signup-form-wrap").classList.add("hidden");
    document.getElementById("login-form-wrap").classList.remove("hidden");
  };

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
      toast("Você não tem acesso a essa página");
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
  window.__navigate = navigate;

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

  // ================= helpers de listagem =================
  function folderCounts(){
    const counts = {};
    Object.keys(FOLDER_META).forEach(f=> counts[f]=0);
    visibleDocsForUser().forEach(d=> { if (counts[d.folder]!==undefined) counts[d.folder]++; });
    return counts;
  }
  function totalDocs(){ return visibleDocsForUser().length; }
  function totalFolders(){ return Object.keys(FOLDER_META).length; }
  function pendingRequestsCount(){ return state.accessRequests.filter(r=>r.status==="pendente").length; }

  function ownerLine(d){
    const parts = [`enviado por <b>${d.owner}</b>`];
    if (d.lastEditedBy && d.lastEditedBy !== d.owner) parts.push(`editado por <b>${d.lastEditedBy}</b>`);
    return parts.join(" · ");
  }

  function docRowHTML(d, opts){
    opts = opts || {};
    const src = opts.trashed ? "trash" : "docs";
    return `
      <div class="list-row">
        <div class="file-icon" style="cursor:pointer;" onclick="__openPreview(${d.id}, '${src}')">${d.fileType && d.fileType.startsWith("image/") ? "🖼️" : "📄"}</div>
        <div class="file-info">
          <div class="file-name clickable" onclick="__openPreview(${d.id}, '${src}')">${d.name} <span title="Criptografado">🔒</span></div>
          <div class="file-meta"><span class="tag">${d.folder}</span> ${d.date} · ${d.size}</div>
          <div class="file-owner-line">${ownerLine(d)}</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" title="Baixar" onclick="__downloadDoc(${d.id}, '${src}')">⬇️</button>
          ${opts.trashed
            ? `<button class="icon-btn" title="Restaurar" onclick="__restoreDoc(${d.id})">↩️</button>
               <button class="icon-btn danger" title="Excluir definitivamente" onclick="__deleteForever(${d.id})">🗑️</button>`
            : `<button class="icon-btn" title="Renomear/mover" onclick="__openEdit(${d.id})">✏️</button>
               <button class="icon-btn danger" title="Mover para lixeira" onclick="__trashDoc(${d.id})">🗑️</button>`
          }
        </div>
      </div>`;
  }

  window.__downloadDoc = function(id, source){
    const d = findDoc(id, source || "docs");
    if (d && d.fileData){
      const a = document.createElement("a");
      a.href = d.fileData;
      a.download = d.name;
      document.body.appendChild(a); a.click(); a.remove();
    } else {
      toast("Este documento não tem um arquivo real anexado (demo).");
    }
  };
  window.__trashDoc = function(id){
    const idx = state.docs.findIndex(d=>d.id===id);
    if (idx>-1){
      const [doc] = state.docs.splice(idx,1);
      state.trash.push(doc);
      logActivity("Movido para lixeira", doc.name, "🗑️");
      recalcStorage();
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
      recalcStorage();
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
      `<option value="${f}" ${f===d.folder ? "selected" : ""}>${f} — ${FOLDER_META[f].full}</option>`
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
    d.lastEditedBy = state.user.username;
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
    const list = source === "trash" ? state.trash : state.docs;
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
    metaParts.push(ownerLine(d));
    document.getElementById("preview-meta").innerHTML = metaParts.join(" · ");

    const realBox = document.getElementById("preview-real");
    const placeholderBox = document.querySelector(".preview-page");
    const noteEl = document.getElementById("preview-note");
    if (d.fileData && d.fileType){
      placeholderBox.classList.add("hidden");
      realBox.classList.remove("hidden");
      noteEl.textContent = "✅ Este é o arquivo real que foi enviado";
      if (d.fileType.startsWith("image/")){
        realBox.innerHTML = `<img src="${d.fileData}" alt="${d.name}">`;
      } else if (d.fileType === "application/pdf"){
        realBox.innerHTML = `<embed src="${d.fileData}" type="application/pdf">`;
      } else {
        realBox.innerHTML = `<div class="preview-generic">📄<br>${d.name}</div>`;
      }
    } else {
      realBox.classList.add("hidden");
      realBox.innerHTML = "";
      placeholderBox.classList.remove("hidden");
      noteEl.textContent = "🔒 Documento de demonstração — sem arquivo real anexado";
    }
    document.getElementById("preview-modal").classList.remove("hidden");
  };
  window.__closePreview = function(){
    document.getElementById("preview-modal").classList.add("hidden");
    previewCurrentId = null;
  };
  document.getElementById("preview-download-btn").addEventListener("click", function(){
    if (previewCurrentId!==null) __downloadDoc(previewCurrentId, state.trash.find(d=>d.id===previewCurrentId) ? "trash" : "docs");
  });

  // ---------- busca global ----------
  window.__globalSearch = function(query){
    const box = document.getElementById("search-results");
    if (!box) return;
    const q = query.trim().toLowerCase();
    if (!q){ box.classList.add("hidden"); box.innerHTML = ""; return; }
    const matches = visibleDocsForUser().filter(d=> d.name.toLowerCase().includes(q)).slice(0,8);
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
          <input type="text" id="global-search" class="search-input" placeholder="Buscar documentos..." oninput="__globalSearch(this.value)" autocomplete="off">
          <div class="search-results hidden" id="search-results"></div>
        </div>
      </div>`;
  }

  // ================= páginas =================
  function pageDashboard(){
    const reqBadge = isAdmin() && pendingRequestsCount() ? `<span class="req-badge">${pendingRequestsCount()}</span>` : "";
    return `
      <p class="page-title">Menu Principal</p>
      <p class="page-sub">Olá, ${state.user.username}! O que você gostaria de fazer?</p>
      <div class="stats-row">
        <div class="stat-card"><div class="num">${totalDocs()}</div><div class="label">Docs</div></div>
        <div class="stat-card"><div class="num">${totalFolders()}</div><div class="label">Pastas</div></div>
        <div class="stat-card"><div class="num">${state.storageUsedGB} GB</div><div class="label">Uso</div></div>
      </div>
      <div class="grid">
        <div class="card" onclick="__navigate('pastas')"><div class="icon" style="background:#f2ebfe;">📂</div><h3>Minhas Pastas</h3><p>Visualize todas as suas pastas</p></div>
        <div class="card" onclick="__navigate('escanear')"><div class="icon" style="background:#e6f7ef;">📷</div><h3>Escanear/Enviar</h3><p>Adicione novos documentos</p></div>
        <div class="card" onclick="__navigate('compartilhados')"><div class="icon" style="background:#f0e9fc;">🔗</div><h3>Compartilhados</h3><p>Documentos compartilhados com você</p></div>
        ${canAccess('recentes') ? `<div class="card" onclick="__navigate('recentes')"><div class="icon" style="background:#fdeadc;">🕐</div><h3>Recentes</h3><p>Seus documentos recentes</p></div>` : ""}
        ${canAccess('empresa') ? `<div class="card" onclick="__navigate('empresa')"><div class="icon" style="background:#eaf2ff;">🏢</div><h3>Documentos da Empresa</h3><p>Solicite acesso a documentos do Admin</p></div>` : ""}
        ${canAccess('solicitacoes') ? `<div class="card" onclick="__navigate('solicitacoes')"><div class="icon" style="background:#fff3e0;">📨</div><h3>Solicitações ${reqBadge}</h3><p>Aprove pedidos de acesso</p></div>` : ""}
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
          <p>${meta.full}</p>
        </div>`;
    }).join("");
    return `
      <p class="page-title">Minhas Pastas</p>
      <p class="page-sub">Organize seus documentos por categoria</p>
      <div class="grid">${cards}</div>
      <div id="folder-detail" style="margin-top:26px;"></div>`;
  }

  window.__filterFolder = function(folder){
    const docs = visibleDocsForUser().filter(d=>d.folder===folder);
    const box = document.getElementById("folder-detail");
    if (!box) return;
    box.innerHTML = `<h3 style="margin-bottom:12px;">${FOLDER_META[folder].icon} ${folder} — ${FOLDER_META[folder].full}</h3>` +
      (docs.length ? docs.map(d=>docRowHTML(d)).join("") : `<div class="empty-state"><div class="e-icon">📭</div>Nenhum documento nesta pasta.</div>`);
  };

  function pageRecentes(){
    const sortBy = state.recentesSort || "recent";
    const filterFolder = state.recentesFilter || "";
    let list = [...visibleDocsForUser()];
    if (filterFolder) list = list.filter(d=>d.folder===filterFolder);
    list.sort((a,b)=>{
      if (sortBy==="name-asc") return a.name.localeCompare(b.name);
      if (sortBy==="name-desc") return b.name.localeCompare(a.name);
      if (sortBy==="size-desc") return parseFloat(b.size)-parseFloat(a.size);
      if (sortBy==="oldest") return a.id-b.id;
      return b.id-a.id;
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
    const shared = state.docs.filter(d => d.visibility === "compartilhado" && d.owner !== state.user.username);
    return `
      <p class="page-title">Compartilhados</p>
      <p class="page-sub">Documentos que outros usuários tornaram compartilhados</p>
      ${shared.length ? shared.map(d=>`
        <div class="list-row">
          <div class="file-icon" style="cursor:pointer;" onclick="__openPreview(${d.id}, 'docs')">🔗</div>
          <div class="file-info">
            <div class="file-name clickable" onclick="__openPreview(${d.id}, 'docs')">${d.name}</div>
            <div class="file-meta"><span class="tag">${d.folder}</span> ${d.date} · ${d.size}</div>
            <div class="file-owner-line">${ownerLine(d)}</div>
          </div>
          <div class="row-actions"><button class="icon-btn" title="Baixar" onclick="__downloadDoc(${d.id})">⬇️</button></div>
        </div>`).join("") : `<div class="empty-state"><div class="e-icon">🔗</div>Nenhum documento compartilhado ainda.</div>`}`;
  }

  function pageEmpresa(){
    const adminPrivateDocs = state.docs.filter(d => d.owner === "admin" && d.visibility === "privado");
    const locked = adminPrivateDocs.filter(d => !canEditDoc(d));
    const unlocked = adminPrivateDocs.filter(d => canEditDoc(d) && d.owner !== state.user.username);
    const myPending = state.accessRequests.filter(r => r.kind==="documento" && r.requester===state.user.username);

    function statusTag(docId){
      const req = myPending.find(r=>r.docId===docId);
      if (!req) return "";
      if (req.status==="pendente") return `<span class="tag" style="background:#fff3e0;color:#b45309;">⏳ solicitação pendente</span>`;
      if (req.status==="negado") return `<span class="tag" style="background:#fdeceb;color:var(--red);">❌ negado</span>`;
      return "";
    }

    return `
      <p class="page-title">Documentos da Empresa</p>
      <p class="page-sub">Documentos privados do Admin — solicite acesso para poder editar</p>

      ${unlocked.length ? `<h3 style="font-size:14px;margin:0 0 10px;">✅ Liberados para você</h3>` + unlocked.map(d=>docRowHTML(d)).join("") : ""}

      <h3 style="font-size:14px;margin:18px 0 10px;">🔒 Bloqueados (peça acesso)</h3>
      ${locked.length ? locked.map(d=>`
        <div class="list-row">
          <div class="file-icon">🔒</div>
          <div class="file-info">
            <div class="file-name">${d.name} ${statusTag(d.id)}</div>
            <div class="file-meta"><span class="tag">${d.folder}</span> ${d.date} · ${d.size}</div>
          </div>
          <div class="row-actions">
            ${myPending.find(r=>r.docId===d.id && r.status==="pendente")
              ? `<button class="icon-btn" disabled>⏳ Aguardando</button>`
              : `<button class="btn-secondary" onclick="__requestDocAccess(${d.id}, '${d.name.replace(/'/g,"\\'")}')">Solicitar acesso</button>`}
          </div>
        </div>`).join("") : `<div class="empty-state"><div class="e-icon">🔓</div>Não há documentos bloqueados no momento.</div>`}`;
  }

  window.__requestDocAccess = function(docId, docName){
    const already = state.accessRequests.find(r=>r.kind==="documento" && r.docId===docId && r.requester===state.user.username && r.status==="pendente");
    if (already){ toast("Você já tem uma solicitação pendente para este documento."); return; }
    const reqId = state.nextReqId++;
    state.accessRequests.push({ id: reqId, kind: "documento", requester: state.user.username, docId, docName, status: "pendente", requestedAt: new Date().toLocaleDateString("pt-BR") });
    logActivity("Solicitação de acesso enviada", docName, "📨");
    toast("Solicitação enviada ao Admin!");
    syncBackend(api => api.createDocRequest(state.user.username, docId, docName));
    render();
  };

  function pageSolicitacoes(){
    const pending = state.accessRequests.filter(r=>r.status==="pendente");
    const resolved = state.accessRequests.filter(r=>r.status!=="pendente").slice(-10).reverse();

    function rowFor(r, showActions){
      const label = r.kind === "conta"
        ? `<b>${r.requester}</b> solicitou <b>acesso total</b> aos documentos`
        : `<b>${r.requester}</b> quer editar <b>"${r.docName}"</b>`;
      return `
        <div class="list-row">
          <div class="file-icon">${r.kind==="conta" ? "👤" : "📄"}</div>
          <div class="file-info">
            <div class="file-name">${label}</div>
            <div class="file-meta">${r.requestedAt} ${r.status!=="pendente" ? `· <span class="tag">${r.status}</span>` : ""}</div>
          </div>
          ${showActions ? `
          <div class="row-actions">
            <button class="icon-btn" title="Negar" onclick="__denyRequest(${r.id})">✖️</button>
            <button class="btn-secondary" onclick="__approveRequest(${r.id})">Aprovar</button>
          </div>` : ""}
        </div>`;
    }

    return `
      <p class="page-title">Solicitações de Acesso</p>
      <p class="page-sub">Aprove ou negue pedidos de acesso total e a documentos específicos</p>
      <h3 style="font-size:14px;margin:0 0 10px;">Pendentes (${pending.length})</h3>
      ${pending.length ? pending.map(r=>rowFor(r,true)).join("") : `<div class="empty-state"><div class="e-icon">📭</div>Nenhuma solicitação pendente.</div>`}
      ${resolved.length ? `<h3 style="font-size:14px;margin:22px 0 10px;">Histórico recente</h3>` + resolved.map(r=>rowFor(r,false)).join("") : ""}`;
  }

  window.__approveRequest = function(reqId){
    const req = state.accessRequests.find(r=>r.id===reqId);
    if (!req) return;
    req.status = "aprovado";
    if (req.kind === "conta"){
      if (state.users[req.requester]){
        state.users[req.requester].type = "Admin";
        state.users[req.requester].label = "Acesso total";
        persistUsers();
      }
      logActivity("Acesso total aprovado", req.requester, "✅");
      toast(`${req.requester} agora tem acesso total.`);
    } else {
      const doc = state.docs.find(d=>d.id===req.docId);
      if (doc){
        doc.allowedEditors = doc.allowedEditors || [];
        if (!doc.allowedEditors.includes(req.requester)) doc.allowedEditors.push(req.requester);
      }
      logActivity("Acesso a documento aprovado", `${req.requester} → "${req.docName}"`, "✅");
      toast(`Acesso liberado para ${req.requester}.`);
    }
    persistAll();
    syncBackend(api => api.resolveRequest(reqId, "aprovado"));
    render();
  };
  window.__denyRequest = function(reqId){
    const req = state.accessRequests.find(r=>r.id===reqId);
    if (!req) return;
    req.status = "negado";
    logActivity("Solicitação negada", req.kind==="conta" ? req.requester : req.docName, "❌");
    toast("Solicitação negada.");
    persistAll();
    syncBackend(api => api.resolveRequest(reqId, "negado"));
    render();
  };

  function pageLixeira(){
    const trashVisible = isAdmin() ? state.trash : state.trash.filter(d=>canEditDoc(d));
    return `
      <p class="page-title">Lixeira</p>
      <p class="page-sub">Documentos removidos — restaure ou exclua definitivamente</p>
      ${trashVisible.length ? trashVisible.map(d=>docRowHTML(d,{trashed:true})).join("") : `<div class="empty-state"><div class="e-icon">🗑️</div>A lixeira está vazia.</div>`}`;
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
            <div class="file-meta">${l.detail} · ${l.time}${l.by ? " · por "+l.by : ""}</div>
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
          <div class="badge">${state.user.type === 'Admin' ? '🏢' : '👤'} ${state.user.type} — ${state.user.label}</div>
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

  // ================= ESCANEAR / ENVIAR (redesenhado, 2 passos, arquivo real) =================
  let uploadFile = null; // { dataUrl, mime, name, sizeMb }

  function pageEscanear(){
    return `
      <p class="page-title">Escanear e Enviar</p>
      <p class="page-sub">Envie um arquivo de verdade — PDF ou imagem — pro seu cofre digital</p>

      <div class="scan-wizard">
        <div class="scan-step" id="scan-step-1">
          <div class="dropzone" id="dropzone">
            <div class="dz-icon">📎</div>
            <div class="dz-title">Arraste seu arquivo aqui</div>
            <div class="dz-sub">ou clique para selecionar · PDF, JPG ou PNG · máx. 8MB</div>
            <input type="file" id="real-file" accept="application/pdf,image/png,image/jpeg,image/jpg" style="display:none">
          </div>
        </div>

        <div class="scan-step hidden" id="scan-step-2">
          <div class="scan-preview-box">
            <div class="scan-preview-content" id="scan-preview-content"></div>
            <button class="icon-btn" id="scan-remove-btn" title="Remover e escolher outro">🔄 Trocar arquivo</button>
          </div>

          <form class="panel" id="upload-form" onsubmit="return __submitUpload(event)">
            <h3>📄 Informações do Documento</h3>
            <div class="form-row">
              <label>Nome do Documento *</label>
              <input type="text" id="doc-name" placeholder="Ex: Recibo de Compra" required>
            </div>
            <div class="form-row">
              <label>Pasta *</label>
              <select id="doc-folder" required>
                <option value="">Selecione uma pasta</option>
                ${Object.keys(FOLDER_META).map(f=>`<option value="${f}">${f} — ${FOLDER_META[f].full}</option>`).join("")}
              </select>
            </div>
            <div class="form-row">
              <label>Visibilidade</label>
              <div class="radio-option"><input type="radio" name="visibilidade" value="privado" checked><div>Privado<small>Só você (e o Admin) podem acessar</small></div></div>
              <div class="radio-option"><input type="radio" name="visibilidade" value="compartilhado"><div>Compartilhado<small>Visível para download por todos os usuários</small></div></div>
            </div>
            <button class="btn-primary" type="submit">Salvar no vault</button>
          </form>
        </div>
      </div>`;
  }

  function initScanPage(){
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("real-file");
    if (!dropzone) return;

    dropzone.addEventListener("click", ()=> fileInput.click());
    dropzone.addEventListener("dragover", e=>{ e.preventDefault(); dropzone.classList.add("drag-over"); });
    dropzone.addEventListener("dragleave", ()=> dropzone.classList.remove("drag-over"));
    dropzone.addEventListener("drop", e=>{
      e.preventDefault(); dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", ()=>{
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    const removeBtn = document.getElementById("scan-remove-btn");
    if (removeBtn) removeBtn.addEventListener("click", ()=>{
      uploadFile = null;
      document.getElementById("scan-step-2").classList.add("hidden");
      document.getElementById("scan-step-1").classList.remove("hidden");
    });
  }

  function handleFile(file){
    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024){
      toast(`Arquivo muito grande (máx. ${MAX_MB}MB para esta demo)`);
      return;
    }
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowed.includes(file.type)){
      toast("Formato não suportado — envie PDF, JPG ou PNG");
      return;
    }
    const reader = new FileReader();
    reader.onload = function(){
      const sizeMb = +(file.size / (1024*1024)).toFixed(2);
      uploadFile = { dataUrl: reader.result, mime: file.type, name: file.name, sizeMb };

      const content = document.getElementById("scan-preview-content");
      if (file.type.startsWith("image/")){
        content.innerHTML = `<img src="${reader.result}" alt="preview">`;
      } else {
        content.innerHTML = `<embed src="${reader.result}" type="application/pdf">`;
      }

      document.getElementById("scan-step-1").classList.add("hidden");
      document.getElementById("scan-step-2").classList.remove("hidden");

      const nameField = document.getElementById("doc-name");
      if (nameField && !nameField.value) nameField.value = file.name.replace(/\.[^/.]+$/, "");
    };
    reader.onerror = function(){ toast("Não foi possível ler o arquivo."); };
    reader.readAsDataURL(file);
  }

  window.__submitUpload = function(e){
    e.preventDefault();
    if (!uploadFile){ toast("Selecione um arquivo primeiro"); return false; }
    const name = document.getElementById("doc-name").value.trim();
    const folder = document.getElementById("doc-folder").value;
    const visibility = document.querySelector('input[name="visibilidade"]:checked').value;
    if (!name || !folder){ toast("Preencha nome e pasta do documento"); return false; }

    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
    const finalName = name.match(/\.\w+$/) ? name : name + (uploadFile.mime==="application/pdf" ? ".pdf" : "."+uploadFile.mime.split("/")[1]);

    const newDoc = {
      id: state.nextId++,
      name: finalName,
      folder: folder,
      date: dateStr,
      size: uploadFile.sizeMb + " MB",
      owner: state.user.username,
      lastEditedBy: state.user.username,
      visibility: visibility,
      allowedEditors: [],
      fileData: uploadFile.dataUrl,
      fileType: uploadFile.mime
    };
    state.docs.unshift(newDoc);
    recalcStorage();
    logActivity("Documento enviado", finalName, "📤");
    toast("Documento salvo com sucesso!");

    syncBackend(api => api.createDoc(state.user.username, finalName, folder, uploadFile.sizeMb, visibility, uploadFile.dataUrl, uploadFile.mime));

    uploadFile = null;
    navigate("recentes");
    return false;
  };

  window.__setTheme = function(t){
    state.theme = t;
    document.body.setAttribute("data-theme", t);
    render();
  };

  // ================= render principal =================
  function render(){
    let html = "";
    switch(currentPage){
      case "dashboard": html = pageDashboard(); break;
      case "pastas": html = pagePastas(); break;
      case "recentes": html = pageRecentes(); break;
      case "compartilhados": html = pageCompartilhados(); break;
      case "empresa": html = pageEmpresa(); break;
      case "solicitacoes": html = pageSolicitacoes(); break;
      case "lixeira": html = pageLixeira(); break;
      case "atividades": html = pageAtividades(); break;
      case "configuracoes": html = pageConfiguracoes(); break;
      case "escanear": html = pageEscanear(); break;
      default: html = pageDashboard();
    }
    main.innerHTML = renderTopBar() + html;

    if (currentPage === "escanear") initScanPage();

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
