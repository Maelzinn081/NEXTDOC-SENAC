--------------------------------------------------------------------------
-- NextDoc · Pacote PL/SQL (lógica de negócio)
-- Execute depois de 01_schema.sql e 02_seed.sql
--------------------------------------------------------------------------

CREATE OR REPLACE PACKAGE pkg_nextdoc AS

  -- autenticação: retorna 1 e os dados do usuário se as credenciais forem válidas, 0 caso contrário
  PROCEDURE prc_login(
    p_username   IN  VARCHAR2,
    p_password   IN  VARCHAR2,
    p_ok         OUT NUMBER,
    p_user_type  OUT VARCHAR2,
    p_label      OUT VARCHAR2,
    p_email      OUT VARCHAR2
  );

  -- lista documentos ativos de um usuário (cursor de referência para a API consumir)
  FUNCTION fn_list_documents(p_username IN VARCHAR2) RETURN SYS_REFCURSOR;

  -- lista documentos na lixeira de um usuário
  FUNCTION fn_list_trash(p_username IN VARCHAR2) RETURN SYS_REFCURSOR;

  -- lista documentos compartilhados com um usuário
  FUNCTION fn_list_shared(p_username IN VARCHAR2) RETURN SYS_REFCURSOR;

  -- lista o log de atividades de um usuário (mais recentes primeiro)
  FUNCTION fn_list_activity(p_username IN VARCHAR2) RETURN SYS_REFCURSOR;

  -- soma o armazenamento usado (em GB) por um usuário
  FUNCTION fn_storage_used_gb(p_username IN VARCHAR2) RETURN NUMBER;

  -- registra um novo documento
  PROCEDURE prc_add_document(
    p_username   IN VARCHAR2,
    p_doc_name   IN VARCHAR2,
    p_folder     IN VARCHAR2,
    p_size_mb    IN NUMBER,
    p_new_id     OUT NUMBER
  );

  -- move um documento para a lixeira
  PROCEDURE prc_trash_document(p_username IN VARCHAR2, p_doc_id IN NUMBER);

  -- restaura um documento da lixeira
  PROCEDURE prc_restore_document(p_username IN VARCHAR2, p_doc_id IN NUMBER);

  -- exclui definitivamente um documento da lixeira
  PROCEDURE prc_delete_forever(p_username IN VARCHAR2, p_doc_id IN NUMBER);

  -- renomeia e/ou move um documento para outra pasta
  PROCEDURE prc_rename_move(
    p_username   IN VARCHAR2,
    p_doc_id     IN NUMBER,
    p_new_name   IN VARCHAR2,
    p_new_folder IN VARCHAR2
  );

  -- registra uma entrada no log de atividades
  PROCEDURE prc_log_activity(
    p_username   IN VARCHAR2,
    p_action     IN VARCHAR2,
    p_detail     IN VARCHAR2,
    p_icon       IN VARCHAR2 DEFAULT '📝'
  );

END pkg_nextdoc;
/

CREATE OR REPLACE PACKAGE BODY pkg_nextdoc AS

  PROCEDURE prc_login(
    p_username   IN  VARCHAR2,
    p_password   IN  VARCHAR2,
    p_ok         OUT NUMBER,
    p_user_type  OUT VARCHAR2,
    p_label      OUT VARCHAR2,
    p_email      OUT VARCHAR2
  ) IS
  BEGIN
    SELECT user_type, label, email
      INTO p_user_type, p_label, p_email
      FROM sd_users
     WHERE username = LOWER(p_username)
       AND password = p_password;

    p_ok := 1;
    prc_log_activity(LOWER(p_username), 'Login realizado', LOWER(p_username) || ' (' || p_user_type || ')', '🔑');
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      p_ok := 0;
      p_user_type := NULL;
      p_label := NULL;
      p_email := NULL;
  END prc_login;

  FUNCTION fn_list_documents(p_username IN VARCHAR2) RETURN SYS_REFCURSOR IS
    v_cursor SYS_REFCURSOR;
  BEGIN
    OPEN v_cursor FOR
      SELECT doc_id, doc_name, folder_name, doc_size_mb,
             TO_CHAR(created_at, 'DD/MM/YYYY HH24:MI') AS created_str
        FROM sd_documents
       WHERE owner_user = LOWER(p_username)
         AND doc_status = 'ATIVO'
       ORDER BY doc_id DESC;
    RETURN v_cursor;
  END fn_list_documents;

  FUNCTION fn_list_trash(p_username IN VARCHAR2) RETURN SYS_REFCURSOR IS
    v_cursor SYS_REFCURSOR;
  BEGIN
    OPEN v_cursor FOR
      SELECT doc_id, doc_name, folder_name, doc_size_mb,
             TO_CHAR(trashed_at, 'DD/MM/YYYY HH24:MI') AS trashed_str
        FROM sd_documents
       WHERE owner_user = LOWER(p_username)
         AND doc_status = 'LIXEIRA'
       ORDER BY trashed_at DESC;
    RETURN v_cursor;
  END fn_list_trash;

  FUNCTION fn_list_shared(p_username IN VARCHAR2) RETURN SYS_REFCURSOR IS
    v_cursor SYS_REFCURSOR;
  BEGIN
    OPEN v_cursor FOR
      SELECT shared_id, doc_name, shared_from,
             TO_CHAR(shared_at, 'DD/MM/YYYY') AS shared_str
        FROM sd_shared_documents
       WHERE shared_with = LOWER(p_username)
       ORDER BY shared_at DESC;
    RETURN v_cursor;
  END fn_list_shared;

  FUNCTION fn_list_activity(p_username IN VARCHAR2) RETURN SYS_REFCURSOR IS
    v_cursor SYS_REFCURSOR;
  BEGIN
    OPEN v_cursor FOR
      SELECT action_name, detail_txt, icon,
             TO_CHAR(logged_at, 'DD/MM/YYYY HH24:MI') AS logged_str
        FROM sd_activity_log
       WHERE username = LOWER(p_username)
       ORDER BY logged_at DESC;
    RETURN v_cursor;
  END fn_list_activity;

  FUNCTION fn_storage_used_gb(p_username IN VARCHAR2) RETURN NUMBER IS
    v_total NUMBER;
  BEGIN
    SELECT NVL(SUM(doc_size_mb), 0) / 1024
      INTO v_total
      FROM sd_documents
     WHERE owner_user = LOWER(p_username)
       AND doc_status = 'ATIVO';
    RETURN ROUND(v_total, 2);
  END fn_storage_used_gb;

  PROCEDURE prc_add_document(
    p_username   IN VARCHAR2,
    p_doc_name   IN VARCHAR2,
    p_folder     IN VARCHAR2,
    p_size_mb    IN NUMBER,
    p_new_id     OUT NUMBER
  ) IS
  BEGIN
    p_new_id := sd_doc_seq.NEXTVAL;

    INSERT INTO sd_documents (doc_id, doc_name, folder_name, owner_user, doc_size_mb, doc_status)
    VALUES (p_new_id, p_doc_name, p_folder, LOWER(p_username), p_size_mb, 'ATIVO');

    prc_log_activity(LOWER(p_username), 'Documento enviado', p_doc_name, '📤');
  END prc_add_document;

  PROCEDURE prc_trash_document(p_username IN VARCHAR2, p_doc_id IN NUMBER) IS
    v_name sd_documents.doc_name%TYPE;
  BEGIN
    UPDATE sd_documents
       SET doc_status = 'LIXEIRA', trashed_at = SYSTIMESTAMP
     WHERE doc_id = p_doc_id
       AND owner_user = LOWER(p_username)
    RETURNING doc_name INTO v_name;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Documento não encontrado ou não pertence ao usuário.');
    END IF;

    prc_log_activity(LOWER(p_username), 'Movido para lixeira', v_name, '🗑️');
  END prc_trash_document;

  PROCEDURE prc_restore_document(p_username IN VARCHAR2, p_doc_id IN NUMBER) IS
    v_name sd_documents.doc_name%TYPE;
  BEGIN
    UPDATE sd_documents
       SET doc_status = 'ATIVO', trashed_at = NULL
     WHERE doc_id = p_doc_id
       AND owner_user = LOWER(p_username)
    RETURNING doc_name INTO v_name;

    IF SQL%ROWCOUNT = 0 THEN
      RAISE_APPLICATION_ERROR(-20001, 'Documento não encontrado ou não pertence ao usuário.');
    END IF;

    prc_log_activity(LOWER(p_username), 'Restaurado da lixeira', v_name, '↩️');
  END prc_restore_document;

  PROCEDURE prc_delete_forever(p_username IN VARCHAR2, p_doc_id IN NUMBER) IS
    v_name sd_documents.doc_name%TYPE;
  BEGIN
    SELECT doc_name INTO v_name
      FROM sd_documents
     WHERE doc_id = p_doc_id
       AND owner_user = LOWER(p_username)
       AND doc_status = 'LIXEIRA';

    DELETE FROM sd_documents
     WHERE doc_id = p_doc_id
       AND owner_user = LOWER(p_username);

    prc_log_activity(LOWER(p_username), 'Excluído permanentemente', v_name, '❌');
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20002, 'Documento não está na lixeira ou não existe.');
  END prc_delete_forever;

  PROCEDURE prc_rename_move(
    p_username   IN VARCHAR2,
    p_doc_id     IN NUMBER,
    p_new_name   IN VARCHAR2,
    p_new_folder IN VARCHAR2
  ) IS
    v_old_name   sd_documents.doc_name%TYPE;
    v_old_folder sd_documents.folder_name%TYPE;
  BEGIN
    SELECT doc_name, folder_name INTO v_old_name, v_old_folder
      FROM sd_documents
     WHERE doc_id = p_doc_id
       AND owner_user = LOWER(p_username);

    UPDATE sd_documents
       SET doc_name = p_new_name,
           folder_name = p_new_folder,
           updated_at = SYSTIMESTAMP
     WHERE doc_id = p_doc_id
       AND owner_user = LOWER(p_username);

    IF v_old_folder != p_new_folder THEN
      prc_log_activity(LOWER(p_username), 'Documento movido',
        p_new_name || ': ' || v_old_folder || ' -> ' || p_new_folder, '📂');
    END IF;
    IF v_old_name != p_new_name THEN
      prc_log_activity(LOWER(p_username), 'Documento renomeado',
        v_old_name || ' -> ' || p_new_name, '✏️');
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20001, 'Documento não encontrado ou não pertence ao usuário.');
  END prc_rename_move;

  PROCEDURE prc_log_activity(
    p_username   IN VARCHAR2,
    p_action     IN VARCHAR2,
    p_detail     IN VARCHAR2,
    p_icon       IN VARCHAR2 DEFAULT '📝'
  ) IS
  BEGIN
    INSERT INTO sd_activity_log (log_id, username, action_name, detail_txt, icon)
    VALUES (sd_activity_seq.NEXTVAL, LOWER(p_username), p_action, p_detail, p_icon);
  END prc_log_activity;

END pkg_nextdoc;
/
