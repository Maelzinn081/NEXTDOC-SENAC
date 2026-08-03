# NextDoc

Mais que documentos. Soluções para o amanhã.

Vault de documentos com três camadas independentes — use só a primeira, ou vá
empilhando conforme a necessidade:

```
┌──────────────────────┐        ┌────────────────────────┐        ┌──────────────────┐
│ Navegador (index.html)│  fetch │  API própria (Node.js) │  SQL   │  Oracle Database   │
│ + IndexedDB (sempre)  │ ─────► │  api/server.js          │ ─────► │  + pacote PL/SQL   │
└──────────────────────┘        │  (zero dependências,    │        │  (server/server.js)│
                                 │  fácil de hospedar)     │        └──────────────────┘
                                 └────────────────────────┘
```

## 🟢 Nível 1 — só abrir e usar (IndexedDB)

Não precisa instalar nada. Os dados (documentos, lixeira, compartilhados, log de
atividades) ficam salvos no próprio navegador via **IndexedDB**, e sobrevivem a
fechar a aba ou reiniciar o computador.

```
1. Abra nextdoc/index.html direto no navegador
   (ou com a extensão Live Server no VS Code)
2. Login: corporativo / corp123  ou  comum / user123
3. Pronto — tudo já persiste sozinho
```

> ⚠️ Se você estiver testando dentro do preview do claude.ai, o IndexedDB roda
> num iframe isolado e pode não persistir entre sessões — abrindo o arquivo no
> seu navegador de verdade (fora do claude.ai) ele funciona normalmente.

## 🟡 Nível 2 — API própria, fácil de hospedar (recomendado)

Uma API em `api/server.js` escrita **sem nenhuma dependência externa** (só
módulos nativos do Node.js). Isso significa: sem `npm install` travando, sem
build nativo pra dar problema, e hospedagem trivial em qualquer serviço que
rode Node — Render, Railway, Fly.io, uma VPS de $5, o que for.

```bash
cd api
node server.js
```

O frontend detecta essa API sozinho quando ela está rodando em
`localhost:3000` e passa a sincronizar os dados com ela automaticamente,
mantendo o IndexedDB como cache local. Instruções completas de deploy (com
passo a passo pro Render.com) estão em **`api/README.md`**.

## 🔵 Nível 3 — Oracle + PL/SQL (avançado / enterprise)

Para quem quer um banco de verdade por trás, com toda a lógica de negócio em
PL/SQL. Aqui o navegador continua conversando só com o `index.html` — quem
muda é a API, que passa a ser `server/server.js` (usando `node-oracledb`) em
vez de `api/server.js`.

### Passo 1 — Banco de dados

Use qualquer edição do Oracle (recomendado: [Oracle Database Free](https://www.oracle.com/database/free/)
rodando local, ou um Autonomous Database na nuvem). Conecte com seu usuário
(SQL*Plus, SQLcl, SQL Developer, o que preferir) e rode os scripts **nesta ordem**:

```
database/01_schema.sql    → cria as tabelas
database/02_seed.sql      → insere os usuários e documentos de teste
database/03_package.sql   → cria o pacote PL/SQL (pkg_nextdoc) com toda a lógica
```

### Passo 2 — API Node.js (versão Oracle)

```bash
cd server
cp .env.example .env      # edite com os dados da sua conexão Oracle
npm install                # aqui sim precisa, por causa do node-oracledb
npm start
```

### Passo 3 — Abrir o app normalmente

Abra `index.html` de novo (ou dê F5) e faça login. Se a API estiver no ar
(seja a `api/` leve ou a `server/` com Oracle), você verá o toast
**"✅ Backend conectado — dados sincronizados"** e, na página
**Configurações**, o status vai mostrar **"Backend remoto: 🟢 conectado"**.

> As duas APIs (`api/` e `server/`) seguem exatamente o mesmo contrato de
> endpoints — o frontend não sabe (nem precisa saber) qual das duas está no ar.

## 📂 Onde cada coisa mora

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Interface | `index.html`, `css/style.css` | Estrutura e visual |
| Lógica do app | `js/app.js` | Telas, permissões, estado |
| Persistência local | `js/db.js` | Wrapper de IndexedDB |
| Ponte com o backend | `js/api.js` | Chamadas fetch → API (qualquer uma das duas) |
| **API própria (recomendada)** | `api/server.js` | HTTP puro, zero dependências, dados em `data.json` |
| API Oracle (avançada) | `server/server.js` | Traduz HTTP em chamadas PL/SQL via `node-oracledb` |
| Regras de negócio (Oracle) | `database/03_package.sql` | `pkg_nextdoc` (login, mover, restaurar, excluir, log de atividades) |
| Estrutura de dados (Oracle) | `database/01_schema.sql` | Tabelas Oracle |
| Dados de teste (Oracle) | `database/02_seed.sql` | Usuários e documentos iniciais |

## ⚠️ Observações honestas

- A API Oracle (`server/`) **não foi testada contra uma instância Oracle real**
  (não há Oracle disponível no ambiente onde ela foi gerada) — a sintaxe PL/SQL
  e as chamadas `node-oracledb` seguem os padrões oficiais, mas vale rodar e
  ajustar detalhes finos se algo não bater exatamente com a sua versão do Oracle.
- A API própria (`api/`), por outro lado, **foi executada e testada de verdade**
  neste ambiente — login, criação de documento, mover/restaurar da lixeira,
  renomear/mover, log de atividades e cálculo de armazenamento foram todos
  verificados via `curl` contra o servidor rodando.
- A API própria guarda os dados em `data.json` (arquivo em disco). Isso funciona
  bem em serviços com processo persistente (Render, Railway, VPS), mas **não
  funciona em hospedagem serverless** (Vercel Functions, AWS Lambda), já que o
  sistema de arquivos é apagado a cada execução ali. Detalhes em `api/README.md`.
- Por simplicidade, tanto o IndexedDB quanto a API própria guardam um único
  "pool" de documentos compartilhado entre os dois usuários de teste — já o
  schema Oracle já modela `owner_user` corretamente, caso você queira evoluir
  o app depois para isolar dados por usuário de verdade.
- Senhas estão em texto puro só para fins de demonstração — numa aplicação
  real, use hash (bcrypt/Argon2) e nunca senhas literais em tabelas ou arquivos.
