// NextDoc · API REST (Node.js + Express + node-oracledb)
// Ponte entre o frontend (navegador) e o banco Oracle, chamando pkg_nextdoc.
//
// Como rodar:
//   1) cp .env.example .env   (e preencha com seus dados Oracle)
//   2) npm install
//   3) npm start
//
// O navegador NÃO fala diretamente com o Oracle (não existe driver Oracle
// para browser) — por isso esta API HTTP existe: ela recebe os requests do
// app NextDoc e traduz cada um em uma chamada ao pacote PL/SQL.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const oracledb = require("oracledb");

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

let pool;

async function getConnection() {
  if (!pool) {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECT_STRING
    });
  }
  return pool.getConnection();
}

// helper: converte um SYS_REFCURSOR em array de objetos simples
async function cursorToArray(resultSet) {
  const rows = [];
  let row;
  while ((row = await resultSet.getRow())) rows.push(row);
  await resultSet.close();
  return rows;
}

// ---------- healthcheck (o frontend usa isso para saber se o backend está de pé) ----------
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---------- login ----------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN
         pkg_nextdoc.prc_login(:username, :password, :ok, :userType, :label, :email);
       END;`,
      {
        username,
        password,
        ok: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        userType: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
        label: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 200 },
        email: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 120 }
      }
    );
    const ok = result.outBinds.ok === 1;
    if (!ok) return res.status(401).json({ ok: false });
    res.json({
      ok: true,
      username: username.toLowerCase(),
      type: result.outBinds.userType,
      label: result.outBinds.label,
      email: result.outBinds.email
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- listar documentos ativos ----------
app.get("/api/docs", async (req, res) => {
  const { username } = req.query;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN :cur := pkg_nextdoc.fn_list_documents(:username); END;`,
      { username, cur: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
    );
    const rows = await cursorToArray(result.outBinds.cur);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- listar lixeira ----------
app.get("/api/trash", async (req, res) => {
  const { username } = req.query;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN :cur := pkg_nextdoc.fn_list_trash(:username); END;`,
      { username, cur: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
    );
    res.json(await cursorToArray(result.outBinds.cur));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- listar compartilhados ----------
app.get("/api/shared", async (req, res) => {
  const { username } = req.query;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN :cur := pkg_nextdoc.fn_list_shared(:username); END;`,
      { username, cur: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
    );
    res.json(await cursorToArray(result.outBinds.cur));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- log de atividades ----------
app.get("/api/activity", async (req, res) => {
  const { username } = req.query;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN :cur := pkg_nextdoc.fn_list_activity(:username); END;`,
      { username, cur: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR } }
    );
    res.json(await cursorToArray(result.outBinds.cur));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- armazenamento usado ----------
app.get("/api/storage", async (req, res) => {
  const { username } = req.query;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN :gb := pkg_nextdoc.fn_storage_used_gb(:username); END;`,
      { username, gb: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    res.json({ usedGB: result.outBinds.gb });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- criar documento (escanear/enviar) ----------
app.post("/api/docs", async (req, res) => {
  const { username, name, folder, sizeMb } = req.body;
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `BEGIN pkg_nextdoc.prc_add_document(:username, :name, :folder, :sizeMb, :newId); END;`,
      {
        username, name, folder, sizeMb,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      }
    );
    res.json({ id: result.outBinds.newId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- renomear / mover documento ----------
app.put("/api/docs/:id", async (req, res) => {
  const { id } = req.params;
  const { username, name, folder } = req.body;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `BEGIN pkg_nextdoc.prc_rename_move(:username, :docId, :name, :folder); END;`,
      { username, docId: Number(id), name, folder }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- mover para lixeira ----------
app.post("/api/docs/:id/trash", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `BEGIN pkg_nextdoc.prc_trash_document(:username, :docId); END;`,
      { username, docId: Number(id) }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- restaurar da lixeira ----------
app.post("/api/docs/:id/restore", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `BEGIN pkg_nextdoc.prc_restore_document(:username, :docId); END;`,
      { username, docId: Number(id) }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ---------- excluir definitivamente ----------
app.delete("/api/docs/:id", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `BEGIN pkg_nextdoc.prc_delete_forever(:username, :docId); END;`,
      { username, docId: Number(id) }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NextDoc API rodando em http://localhost:${PORT}`));
