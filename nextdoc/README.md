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

## 🔑 Login

- **Admin** (acesso total, um só usuário — só quem sabe a senha entra):
  `admin` / `Admin2026`
- **Conta demo comum**: `comum` / `user123`
- Qualquer pessoa também pode **criar uma conta própria** na tela de login
  (fica com acesso "Comum" por padrão; pode solicitar acesso total ao Admin)

## 🟢 Nível 1 — só abrir e usar (IndexedDB)

Não precisa instalar nada. Os dados (documentos, lixeira, log de atividades,
usuários cadastrados, solicitações de acesso) ficam salvos no próprio
navegador via **IndexedDB**, e sobrevivem a fechar a aba ou reiniciar o
computador.

```
1. Abra nextdoc/index.html direto no navegador
   (ou com a extensão Live Server no VS Code)
2. Login: admin / Admin2026  ou  comum / user123  (ou crie uma conta)
3. Pronto — tudo já persiste sozinho
```

> ⚠️ Se você estiver testando dentro do preview do claude.ai, o IndexedDB roda
> num iframe isolado e pode não persistir entre sessões — abrindo o arquivo no
> seu navegador de verdade (fora do claude.ai) ele funciona normalmente.

## 🟡 Nível 2 — API própria, fácil de hospedar (recomendado)

Uma API em `api/server.js` escrita **sem nenhuma dependência externa**. Sem
`npm install` travando, sem build nativo, hospedagem trivial em qualquer
serviço Node (Render, Railway, Fly.io, uma VPS de $5).

```bash
cd api
node server.js
```

O frontend detecta essa API sozinho quando ela está rodando em
`localhost:3000` e passa a sincronizar os dados com ela automaticamente.
Instruções completas de deploy estão em **`api/README.md`**.

## 🔵 Nível 3 — Oracle + PL/SQL (avançado / legado)

> ⚠️ **Importante**: as funcionalidades mais novas (donos de documento,
> permissões por documento, solicitações de acesso, cadastro de conta, upload
> de arquivo real) **ainda não foram estendidas para o caminho Oracle**. O
> pacote `pkg_nextdoc` e `server/server.js` continuam funcionando para o
> conjunto de recursos anterior (login fixo, CRUD básico de documentos), mas
> não reconhecem os campos novos. Se for evoluir esse caminho, os arquivos em
> `database/` e `server/` são o ponto de partida.

## 🆕 O que tem de novo nesta versão

- **Dono e último editor de cada documento** — toda linha de documento mostra
  quem enviou e quem editou por último
- **Permissão por documento** — só o dono, o Admin, ou quem foi explicitamente
  autorizado pode editar um documento
- **Solicitações de acesso** — usuários "Comum" veem os documentos privados do
  Admin em **Docs da Empresa**, e podem pedir acesso para editar; o Admin
  aprova ou nega em **Solicitações**
- **Cadastro de conta** — tela de login agora tem "Criar conta"; ao se
  cadastrar, dá pra pedir acesso total (sujeito à aprovação do Admin)
- **Upload de arquivo real** — a aba Escanear/Enviar agora aceita PDF/imagem de
  verdade (arraste ou selecione), mostra pré-visualização antes de salvar, e
  guarda o arquivo de verdade (não mais documentos fictícios)
- **Pastas renomeadas**: RH, DP, Financeiro, Contabilidade, Atestados
- **Tela de carregamento** antes de entrar/criar conta
- **Login do Admin trocado**: agora é `admin` / `Admin2026` (antes era
  `corporativo` / `corp123`)

## 📂 Onde cada coisa mora

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Interface | `index.html`, `css/style.css` | Estrutura e visual |
| Lógica do app | `js/app.js` | Telas, permissões, upload real, solicitações |
| Persistência local | `js/db.js` | Wrapper de IndexedDB (docs, users, requests, etc.) |
| Ponte com o backend | `js/api.js` | Chamadas fetch → API |
| **API própria (recomendada)** | `api/server.js` | HTTP puro, zero dependências, dados em `data.json` |
| API Oracle (legado) | `server/server.js` | Traduz HTTP em chamadas PL/SQL via `node-oracledb` |
| Regras de negócio (Oracle) | `database/03_package.sql` | `pkg_nextdoc` (versão anterior de recursos) |

## ⚠️ Observações honestas

- A API própria (`api/`) **foi executada e testada de verdade** neste
  ambiente — login, cadastro, upload de arquivo real (base64), solicitações de
  acesso (criar + aprovar + negar), e a migração de dados de uma versão
  anterior foram todos verificados via `curl` contra o servidor rodando.
- **Arquivos reais** ficam guardados como base64 dentro do próprio registro do
  documento (tanto no IndexedDB quanto no `data.json` da API). Isso é simples
  e funciona bem para arquivos pequenos (limite de 8MB no upload), mas não é
  o ideal para arquivos grandes ou em grande volume — para isso, o caminho
  certo seria armazenamento de objetos (S3, R2, etc.) ou um banco de verdade.
- **Permissões são aplicadas no frontend**, não no servidor. Isso significa
  que alguém com conhecimento técnico poderia inspecionar as respostas de rede
  e ver documentos que não deveria. Para um sistema de produção de verdade, o
  ideal é o servidor filtrar os dados por usuário antes de responder — aqui,
  por simplicidade (e pra manter a API sem dependências), essa responsabilidade
  ficou com o app.
- Se você já tinha a API antiga rodando (com o login `corporativo`), o
  `data.json` existente é migrado automaticamente — a conta `admin` é
  adicionada sem apagar nada que já existia.
- Senhas estão em texto puro só para fins de demonstração — numa aplicação
  real, use hash (bcrypt/Argon2).
