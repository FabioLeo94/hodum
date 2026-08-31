-- add manager role a users
-- Introduce il ruolo "project manager": crea progetti/task e assegna
-- progetti ai dipendenti (stesso meccanismo di project_assignments già usato
-- dall'owner), ma non gestisce le credenziali dei dipendenti (resta
-- owner-only, vedi userController.ts/companyController.ts). Sostituisce il
-- CHECK di 0014_add_company_id_e_role_a_users.sql per ammettere 'manager'
-- accanto a 'owner'/'employee'.

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'manager', 'employee'));
