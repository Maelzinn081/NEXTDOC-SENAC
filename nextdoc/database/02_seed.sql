--------------------------------------------------------------------------
-- NextDoc · Dados iniciais (seed)
-- Execute depois de 01_schema.sql
--------------------------------------------------------------------------

-- ================= USUÁRIOS DE TESTE =================
INSERT INTO sd_users (username, password, user_type, label, email) VALUES
  ('corporativo', 'corp123', 'Corporativo', 'Acesso total', 'corporativo@nextdoc.local');
INSERT INTO sd_users (username, password, user_type, label, email) VALUES
  ('comum', 'user123', 'Comum', 'Acesso restrito a funcionalidades básicas', 'comum@nextdoc.local');

-- ================= PASTAS =================
INSERT INTO sd_folders (folder_name, color, bg_color, icon) VALUES ('Pessoal',   '#2ea9e0', '#e6f6fc', '👤');
INSERT INTO sd_folders (folder_name, color, bg_color, icon) VALUES ('Financeiro','#f2a900', '#fdf1da', '💰');
INSERT INTO sd_folders (folder_name, color, bg_color, icon) VALUES ('Médico',    '#7a4fd6', '#f0e9fc', '⚕️');
INSERT INTO sd_folders (folder_name, color, bg_color, icon) VALUES ('Jurídico',  '#5b6178', '#eceef5', '⚖️');
INSERT INTO sd_folders (folder_name, color, bg_color, icon) VALUES ('Trabalho',  '#d9722c', '#fdeadc', '💼');

-- ================= DOCUMENTOS DE EXEMPLO =================
INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status) VALUES
  (1, 'Relatório Mensal.pdf', 'Trabalho', 'corporativo', 5.2, 'ATIVO');
INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status) VALUES
  (2, 'Nota Fiscal 001.pdf', 'Financeiro', 'corporativo', 3.1, 'ATIVO');
INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status) VALUES
  (3, 'Apresentação.pdf', 'Trabalho', 'corporativo', 8.3, 'ATIVO');
INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status) VALUES
  (4, 'Contrato 2026.pdf', 'Jurídico', 'corporativo', 4.5, 'ATIVO');
INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status) VALUES
  (5, 'Documento Pessoal 1.pdf', 'Pessoal', 'comum', 1.2, 'ATIVO');
INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status) VALUES
  (6, 'Recibo Consulta.pdf', 'Médico', 'comum', 0.8, 'ATIVO');

-- ================= COMPARTILHAMENTOS DE EXEMPLO =================
INSERT INTO sd_shared_documents (shared_id, doc_name, shared_from, shared_with) VALUES
  (101, 'Proposta Comercial.pdf', 'ana.souza@empresa.com', 'corporativo');
INSERT INTO sd_shared_documents (shared_id, doc_name, shared_from, shared_with) VALUES
  (102, 'Manual do Colaborador.pdf', 'rh@empresa.com', 'comum');

COMMIT;
