--------------------------------------------------------------------------
-- NextDoc · Schema Oracle
-- Execute este script conectado ao seu usuário/schema do Oracle
-- (Oracle Database Free / XE / Autonomous Database — qualquer edição serve)
--------------------------------------------------------------------------

-- ================= TABELA: USUÁRIOS =================
CREATE TABLE sd_users (
  username     VARCHAR2(40)  PRIMARY KEY,
  password     VARCHAR2(100) NOT NULL,          -- em produção: usar hash (ex: SHA-256), nunca texto puro
  user_type    VARCHAR2(20)  NOT NULL CHECK (user_type IN ('Corporativo','Comum')),
  label        VARCHAR2(200),
  email        VARCHAR2(120)
);

-- ================= TABELA: PASTAS =================
CREATE TABLE sd_folders (
  folder_name  VARCHAR2(40) PRIMARY KEY,
  color        VARCHAR2(10),
  bg_color     VARCHAR2(10),
  icon         VARCHAR2(10)
);

-- ================= SEQUENCE + TABELA: DOCUMENTOS =================
CREATE SEQUENCE sd_doc_seq START WITH 200 INCREMENT BY 1;

CREATE TABLE sd_documents (
  doc_id       NUMBER        PRIMARY KEY,
  doc_name     VARCHAR2(200) NOT NULL,
  folder_name  VARCHAR2(40)  NOT NULL REFERENCES sd_folders(folder_name),
  owner_user   VARCHAR2(40)  NOT NULL REFERENCES sd_users(username),
  doc_size_mb  NUMBER(6,1)   NOT NULL,
  doc_status   VARCHAR2(10)  DEFAULT 'ATIVO' NOT NULL
               CHECK (doc_status IN ('ATIVO','LIXEIRA')),
  created_at   TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at   TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL,
  trashed_at   TIMESTAMP
);

-- ================= TABELA: COMPARTILHAMENTOS =================
CREATE TABLE sd_shared_documents (
  shared_id    NUMBER        PRIMARY KEY,
  doc_name     VARCHAR2(200) NOT NULL,
  shared_from  VARCHAR2(120) NOT NULL,
  shared_with  VARCHAR2(40)  NOT NULL REFERENCES sd_users(username),
  shared_at    TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

-- ================= SEQUENCE + TABELA: LOG DE ATIVIDADES =================
CREATE SEQUENCE sd_activity_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE sd_activity_log (
  log_id       NUMBER        PRIMARY KEY,
  username     VARCHAR2(40)  REFERENCES sd_users(username),
  action_name  VARCHAR2(60)  NOT NULL,
  detail_txt   VARCHAR2(300),
  icon         VARCHAR2(10),
  logged_at    TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

-- índice para consultas de storage/listagem por usuário
CREATE INDEX idx_sd_documents_owner ON sd_documents(owner_user, doc_status);
CREATE INDEX idx_sd_activity_user   ON sd_activity_log(username, logged_at);

COMMIT;
