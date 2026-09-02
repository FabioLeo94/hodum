-- add task_assigned a notifications type check
-- Introduce la notifica "assegnazione task a un dipendente" (vedi
-- setTaskAssignees in taskService.ts, che chiama notifyUsers con
-- type: 'task_assigned'). Sostituisce il CHECK di
-- 0023_create_notifications_table.sql per ammettere 'task_assigned' accanto
-- ai quattro type già esistenti, stesso pattern di
-- 0017_add_manager_role_a_users.sql per users_role_check.

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('task_comment', 'task_created', 'task_due', 'project_assigned', 'task_assigned'));
