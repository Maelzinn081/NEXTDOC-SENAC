// NextDoc API — servidor próprio, zero dependências externas.
//
// Por que zero dependências? Porque isso torna a hospedagem trivial:
// não precisa de "npm install" travando por causa de versão de pacote,
// não precisa de build nativo (como acontecia com o driver do Oracle),
// não precisa de Dockerfile complicado — é só "node server.js" e pronto,
// em QUALQUER lugar que rode Node.js (Render, Railway, Fly.io, um VPS,
// um Raspberry Pi, o que for).
//
// Os dados ficam guardados em data.json, no mesmo formato de "banco de
// dados de arquivo" — sem servidor de banco separado para configurar.
//
// Como rodar:
//   node server.js
//   (ou: PORT=8080 node server.js, para escolher outra porta)

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// ---------- dados iniciais (usados só na primeira execução) ----------
const SEED = {
  users: {
    corporativo: { password: "corp123", type: "Corporativo", label: "Acesso total", email: "corporativo@nextdoc.local" },
    comum:       { password: "user123", type: "Comum", label: "Acesso restrito a funcionalidades básicas", email: "comum@nextdoc.local" }
  },
  nextId: 200,
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
  activityLog: []
};

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
  const fresh = JSON.parse(JSON.stringify(SEED));
  saveData(fresh);
  return fresh;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let db = loadData();

function logActivity(action, detail, icon) {
  const now = new Date();
  const time = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  db.activityLog.push({ action, detail, time, icon: icon || "📝" });
  if (db.activityLog.length > 200) db.activityLog.shift();
}

// ---------- helpers HTTP (substituem express/cors, na mão) ----------
function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

// ---------- as "rotas" ----------
// Mantemos aqui o MESMO formato de campos (chaves em maiúsculo nas listas)
// usado pela integração com Oracle, para que o frontend (js/app.js) funcione
// sem qualquer alteração, seja qual for o backend escolhido.

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method;

  if (method === "OPTIONS") { // preflight de CORS
    return sendJSON(res, 204, {});
  }

  try {
    // ---- healthcheck ----
    if (pathname === "/api/health" && method === "GET") {
      return sendJSON(res, 200, { status: "ok" });
    }

    // ---- login ----
    if (pathname === "/api/login" && method === "POST") {
      const { username, password } = await readBody(req);
      const u = (username || "").toLowerCase();
      const user = db.users[u];
      if (!user || user.password !== password) {
        return sendJSON(res, 401, { ok: false });
      }
      logActivity("Login realizado", u + " (" + user.type + ")", "🔑");
      saveData(db);
      return sendJSON(res, 200, { ok: true, username: u, type: user.type, label: user.label, email: user.email });
    }

    // ---- listar documentos ativos ----
    if (pathname === "/api/docs" && method === "GET") {
      const rows = db.docs.map(d => ({
        DOC_ID: d.id, DOC_NAME: d.name, FOLDER_NAME: d.folder,
        DOC_SIZE_MB: parseFloat(d.size), CREATED_STR: d.date
      }));
      return sendJSON(res, 200, rows);
    }

    // ---- listar lixeira ----
    if (pathname === "/api/trash" && method === "GET") {
      const rows = db.trash.map(d => ({
        DOC_ID: d.id, DOC_NAME: d.name, FOLDER_NAME: d.folder,
        DOC_SIZE_MB: parseFloat(d.size), TRASHED_STR: d.date
      }));
      return sendJSON(res, 200, rows);
    }

    // ---- listar compartilhados ----
    if (pathname === "/api/shared" && method === "GET") {
      const rows = db.shared.map(d => ({
        SHARED_ID: d.id, DOC_NAME: d.name, SHARED_FROM: d.from, SHARED_STR: d.date
      }));
      return sendJSON(res, 200, rows);
    }

    // ---- log de atividades ----
    if (pathname === "/api/activity" && method === "GET") {
      const rows = [...db.activityLog].reverse().map(l => ({
        ACTION_NAME: l.action, DETAIL_TXT: l.detail, ICON: l.icon, LOGGED_STR: l.time
      }));
      return sendJSON(res, 200, rows);
    }

    // ---- armazenamento usado ----
    if (pathname === "/api/storage" && method === "GET") {
      const totalMb = db.docs.reduce((sum, d) => sum + parseFloat(d.size), 0);
      return sendJSON(res, 200, { usedGB: +(totalMb / 1024).toFixed(2) });
    }

    // ---- criar documento (escanear/enviar) ----
    if (pathname === "/api/docs" && method === "POST") {
      const { name, folder, sizeMb } = await readBody(req);
      const now = new Date();
      const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const id = db.nextId++;
      db.docs.unshift({ id, name, folder, date: dateStr, size: sizeMb + " MB" });
      logActivity("Documento enviado", name, "📤");
      saveData(db);
      return sendJSON(res, 200, { id });
    }

    // ---- renomear / mover (PUT /api/docs/:id) ----
    let m = pathname.match(/^\/api\/docs\/(\d+)$/);
    if (m && method === "PUT") {
      const id = Number(m[1]);
      const { name, folder } = await readBody(req);
      const doc = db.docs.find(d => d.id === id);
      if (!doc) return sendJSON(res, 404, { error: "Documento não encontrado" });
      const oldName = doc.name, oldFolder = doc.folder;
      doc.name = name; doc.folder = folder;
      if (oldFolder !== folder) logActivity("Documento movido", `${name}: ${oldFolder} -> ${folder}`, "📂");
      if (oldName !== name) logActivity("Documento renomeado", `${oldName} -> ${name}`, "✏️");
      saveData(db);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- mover para lixeira ----
    m = pathname.match(/^\/api\/docs\/(\d+)\/trash$/);
    if (m && method === "POST") {
      const id = Number(m[1]);
      const idx = db.docs.findIndex(d => d.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Documento não encontrado" });
      const [doc] = db.docs.splice(idx, 1);
      db.trash.push(doc);
      logActivity("Movido para lixeira", doc.name, "🗑️");
      saveData(db);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- restaurar da lixeira ----
    m = pathname.match(/^\/api\/docs\/(\d+)\/restore$/);
    if (m && method === "POST") {
      const id = Number(m[1]);
      const idx = db.trash.findIndex(d => d.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Documento não encontrado" });
      const [doc] = db.trash.splice(idx, 1);
      db.docs.push(doc);
      logActivity("Restaurado da lixeira", doc.name, "↩️");
      saveData(db);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- excluir definitivamente ----
    m = pathname.match(/^\/api\/docs\/(\d+)$/);
    if (m && method === "DELETE") {
      const id = Number(m[1]);
      const idx = db.trash.findIndex(d => d.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: "Documento não está na lixeira" });
      const [doc] = db.trash.splice(idx, 1);
      logActivity("Excluído permanentemente", doc.name, "❌");
      saveData(db);
      return sendJSON(res, 200, { ok: true });
    }

    // ---- rota não encontrada ----
    return sendJSON(res, 404, { error: "Rota não encontrada: " + method + " " + pathname });

  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: err.message });
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`NextDoc API rodando em http://localhost:${PORT}`);
  console.log(`Dados persistidos em: ${DATA_FILE}`);
});
