-- Baseline dello schema applicativo esistente, creato a mano in DBeaver prima
-- che esistesse questa pipeline di migration. Sul database che ha generato
-- questa fotografia le tabelle ci sono già: questo file non va rieseguito lì,
-- viene marcato "applicato" con un INSERT diretto in schema_migrations (vedi
-- referto della sessione che l'ha prodotto) invece che tramite
-- "npm run migrate:up". Serve da fonte di verità per ricreare lo schema
-- identico su un database pulito (CI, un altro sviluppatore, una futura
-- produzione).
--
-- Riprodotta fedelmente com'è oggi, compresi i punti che sembrano lavoro a
-- metà (non corretti qui, di proposito):
--   - tasks.project_id non ha una FK verso projects(id);
--   - project_assignments non ha PRIMARY KEY/UNIQUE né indici sulle colonne
--     usate nelle FK;
--   - task_status.id e tasks.status sono bit(1) invece di un tipo
--     enumerativo o intero.
-- Le prossime migration che toccano questi punti partano da qui invece di
-- ignorarli.

CREATE TABLE task_status (
  id   bit(1)      NOT NULL,
  name varchar(25) NOT NULL,
  CONSTRAINT task_status_pk PRIMARY KEY (id)
);

CREATE TABLE users (
  id       uuid    NOT NULL,
  username varchar NOT NULL,
  email    varchar NOT NULL,
  password varchar NOT NULL,
  CONSTRAINT users_pk PRIMARY KEY (id),
  CONSTRAINT users_unique UNIQUE (username),
  CONSTRAINT users_unique_1 UNIQUE (email)
);

CREATE TABLE projects (
  id        uuid    NOT NULL,
  name      varchar NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT projects_pk PRIMARY KEY (id)
);

CREATE TABLE tasks (
  id            uuid    NOT NULL,
  project_id    uuid    NOT NULL,
  title         varchar NOT NULL,
  description   varchar,
  creation_date date,
  status        bit(1),
  CONSTRAINT tasks_pk PRIMARY KEY (id),
  CONSTRAINT tasks_task_status_fk FOREIGN KEY (status) REFERENCES task_status (id)
);

CREATE TABLE project_assignments (
  project_id uuid NOT NULL,
  user_id    uuid NOT NULL,
  CONSTRAINT project_assignments_projects_fk FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT project_assignments_users_fk FOREIGN KEY (user_id) REFERENCES users (id)
);
