CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(255) NULL,
  role ENUM('user', 'admin', 'assistant') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_active_role (is_active, role),
  INDEX idx_users_name (name)
);

CREATE TABLE IF NOT EXISTS case_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  color VARCHAR(32) NOT NULL DEFAULT '#64748b',
  sort_order INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_case_statuses_sort (sort_order)
);

CREATE TABLE IF NOT EXISTS cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  description TEXT NULL,
  client_description LONGTEXT NULL,
  status_id BIGINT UNSIGNED NOT NULL,
  target_id BIGINT UNSIGNED NULL,
  secondary_client_id BIGINT UNSIGNED NULL,
  project_leader_id BIGINT UNSIGNED NULL,
  start_date DATE NULL,
  estimated_completion_date DATE NULL,
  target_time VARCHAR(40) NULL,
  contact_phone VARCHAR(40) NULL,
  contact_email VARCHAR(190) NULL,
  custom_uid VARCHAR(80) NULL,
  progress_tracking TINYINT(1) NOT NULL DEFAULT 1,
  price DECIMAL(12,2) NULL,
  color VARCHAR(32) NULL,
  template_id BIGINT UNSIGNED NULL,
  progress_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cases_status FOREIGN KEY (status_id) REFERENCES case_statuses(id),
  CONSTRAINT fk_cases_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_secondary FOREIGN KEY (secondary_client_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_leader FOREIGN KEY (project_leader_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_cases_status (status_id),
  INDEX idx_cases_target (target_id),
  INDEX idx_cases_secondary_client (secondary_client_id),
  INDEX idx_cases_project_leader (project_leader_id),
  INDEX idx_cases_due_date (estimated_completion_date),
  INDEX idx_cases_archived_created (is_archived, created_at),
  INDEX idx_cases_custom_uid (custom_uid),
  INDEX idx_cases_template (template_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_memberships (
  team_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT fk_team_memberships_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_team_memberships_user (user_id)
);

CREATE TABLE IF NOT EXISTS case_team_members (
  case_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, user_id),
  CONSTRAINT fk_case_team_members_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_team_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_case_team_members_user (user_id)
);

CREATE TABLE IF NOT EXISTS case_phases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_phases_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  INDEX idx_case_phases_case_sort (case_id, sort_order)
);

CREATE TABLE IF NOT EXISTS case_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  description TEXT NULL,
  priority ENUM('low', 'normal', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open', 'assigned', 'to-do', 'in-progress', 'completed') NOT NULL DEFAULT 'open',
  private_task TINYINT(1) NOT NULL DEFAULT 0,
  prevent_editing TINYINT(1) NOT NULL DEFAULT 0,
  estimated_minutes INT UNSIGNED NULL,
  time_spent_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  task_type ENUM('to-do', 'milestone') NOT NULL DEFAULT 'to-do',
  start_date DATE NULL,
  tags_json JSON NULL,
  recurring_json JSON NULL,
  completed_at DATETIME NULL,
  assignee_id BIGINT UNSIGNED NULL,
  due_date DATE NULL,
  phase_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_tasks_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_case_tasks_phase FOREIGN KEY (phase_id) REFERENCES case_phases(id) ON DELETE SET NULL,
  INDEX idx_case_tasks_case_status (case_id, status),
  INDEX idx_case_tasks_case_priority (case_id, priority),
  INDEX idx_case_tasks_assignee (assignee_id),
  INDEX idx_case_tasks_due_date (due_date),
  INDEX idx_case_tasks_phase (phase_id)
);

CREATE TABLE IF NOT EXISTS case_task_watchers (
  task_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, user_id),
  CONSTRAINT fk_task_watchers_task FOREIGN KEY (task_id) REFERENCES case_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_watchers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_case_task_watchers_user (user_id)
);

CREATE TABLE IF NOT EXISTS case_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(190) NOT NULL,
  content TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_notes_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_notes_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_notes_case_created (case_id, created_at)
);

CREATE TABLE IF NOT EXISTS case_general_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  content LONGTEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_general_notes_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_general_notes_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_general_notes_case_created (case_id, created_at)
);

CREATE TABLE IF NOT EXISTS visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(80) NULL,
  page_url VARCHAR(512) NOT NULL,
  visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  type ENUM('dashboard', 'website') NOT NULL DEFAULT 'website',
  INDEX idx_visits_type_date (type, visited_at),
  INDEX idx_visits_page (page_url(190))
);

CREATE TABLE IF NOT EXISTS case_timers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  task_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  status ENUM('running', 'stopped') NOT NULL DEFAULT 'stopped',
  timer_type ENUM('counting', 'manual') NOT NULL DEFAULT 'counting',
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  work_date DATE NULL,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(12,2) NULL,
  total_amount DECIMAL(12,2) NULL,
  client_id BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  is_invoiced TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_timers_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_timers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_case_timers_task FOREIGN KEY (task_id) REFERENCES case_tasks(id) ON DELETE SET NULL,
  CONSTRAINT fk_case_timers_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_timers_case_started (case_id, started_at),
  INDEX idx_case_timers_user_started (user_id, started_at),
  INDEX idx_case_timers_status_date (status, work_date),
  INDEX idx_case_timers_client_date (client_id, work_date)
);

CREATE TABLE IF NOT EXISTS case_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  folder_type ENUM('private', 'public', 'tasks') NOT NULL DEFAULT 'private',
  file_name VARCHAR(190) NOT NULL,
  file_url VARCHAR(700) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_provider VARCHAR(60) NOT NULL DEFAULT 'external',
  cloudinary_public_id VARCHAR(255) NULL,
  cloudinary_resource_type VARCHAR(30) NULL,
  cloudinary_secure_url VARCHAR(700) NULL,
  cloudinary_version BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_files_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_files_case_folder (case_id, folder_type),
  INDEX idx_case_files_case_created (case_id, created_at)
);

CREATE TABLE IF NOT EXISTS case_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  patient_name VARCHAR(190) NULL,
  target_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  status ENUM('open', 'converted', 'closed', 'new', 'quoted', 'approved', 'in-progress', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  amount DECIMAL(12,2) NULL,
  price DECIMAL(12,2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EGP',
  custom_uid VARCHAR(80) NULL,
  integration_uid VARCHAR(120) NULL,
  order_notes LONGTEXT NULL,
  surgery_date DATE NULL,
  dob DATE NULL,
  jaw_selection ENUM('maxilla', 'mandible', 'both') NULL,
  guide_support_type ENUM('tooth', 'tissue', 'bone') NULL,
  impression_type VARCHAR(120) NULL,
  implant_type VARCHAR(120) NULL,
  number_of_implants INT UNSIGNED NULL,
  due_date DATE NULL,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  converted_case_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_orders_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL,
  CONSTRAINT fk_case_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_case_orders_target FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_case_orders_converted_case FOREIGN KEY (converted_case_id) REFERENCES cases(id) ON DELETE SET NULL,
  INDEX idx_case_orders_status_due (status, due_date),
  INDEX idx_case_orders_case (case_id),
  INDEX idx_case_orders_target_created (target_id, created_at),
  INDEX idx_case_orders_custom_uid (custom_uid),
  INDEX idx_case_orders_archived_created (is_archived, created_at)
);

CREATE TABLE IF NOT EXISTS case_order_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  file_name VARCHAR(190) NOT NULL,
  file_url VARCHAR(700) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_provider VARCHAR(60) NOT NULL DEFAULT 'external',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_order_files_order FOREIGN KEY (order_id) REFERENCES case_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_order_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_order_files_order_created (order_id, created_at)
);

CREATE TABLE IF NOT EXISTS case_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_templates_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_templates_active_name (is_active, name)
);

CREATE TABLE IF NOT EXISTS case_template_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  description TEXT NULL,
  priority ENUM('low', 'normal', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open', 'assigned', 'to-do', 'in-progress', 'completed') NOT NULL DEFAULT 'open',
  phase_name VARCHAR(160) NULL,
  private_task TINYINT(1) NOT NULL DEFAULT 0,
  estimated_minutes INT UNSIGNED NULL,
  task_type ENUM('to-do', 'milestone') NOT NULL DEFAULT 'to-do',
  start_offset_days INT NULL,
  due_offset_days INT NULL,
  tags_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_template_tasks_template FOREIGN KEY (template_id) REFERENCES case_templates(id) ON DELETE CASCADE,
  INDEX idx_template_tasks_template_sort (template_id, sort_order)
);

CREATE TABLE IF NOT EXISTS case_template_phases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_template_phases_template FOREIGN KEY (template_id) REFERENCES case_templates(id) ON DELETE CASCADE,
  INDEX idx_template_phases_template_sort (template_id, sort_order)
);

CREATE TABLE IF NOT EXISTS case_custom_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(160) NOT NULL,
  field_key VARCHAR(120) NOT NULL UNIQUE,
  field_type ENUM('text', 'number', 'date', 'select', 'textarea', 'checkbox') NOT NULL DEFAULT 'text',
  options_json JSON NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_custom_fields_sort (sort_order)
);

CREATE TABLE IF NOT EXISTS case_custom_field_values (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  field_id BIGINT UNSIGNED NOT NULL,
  value_text TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_custom_values_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_custom_values_field FOREIGN KEY (field_id) REFERENCES case_custom_fields(id) ON DELETE CASCADE,
  UNIQUE KEY uq_custom_value_case_field (case_id, field_id)
);

CREATE TABLE IF NOT EXISTS case_client_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_client_messages_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_client_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_client_messages_case_created (case_id, created_at),
  INDEX idx_client_messages_unread (case_id, read_at)
);

CREATE TABLE IF NOT EXISTS case_task_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  file_name VARCHAR(190) NOT NULL,
  file_url VARCHAR(700) NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  storage_provider VARCHAR(60) NOT NULL DEFAULT 'external',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_task_files_task FOREIGN KEY (task_id) REFERENCES case_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_task_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_task_files_task_created (task_id, created_at)
);

CREATE TABLE IF NOT EXISTS case_automations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  trigger_type VARCHAR(80) NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  config_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_automations_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_automations_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_automations_case_active (case_id, is_active)
);

CREATE TABLE IF NOT EXISTS case_notes_exports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  exported_at DATETIME NULL,
  status ENUM('pending', 'exported', 'failed') NOT NULL DEFAULT 'pending',
  file_rows INT UNSIGNED NOT NULL DEFAULT 0,
  file_url VARCHAR(700) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_notes_exports_case FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_notes_exports_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_case_notes_exports_case_created (case_id, created_at)
);

CREATE TABLE IF NOT EXISTS case_generators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  description TEXT NULL,
  template_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_case_generators_template FOREIGN KEY (template_id) REFERENCES case_templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS case_system_settings (
  setting_key VARCHAR(160) NOT NULL PRIMARY KEY,
  setting_value JSON NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  price DECIMAL(12,2) NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_sectors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  type ENUM('direct', 'group') NOT NULL DEFAULT 'group',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_groups_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_chat_groups_type_updated (type, updated_at)
);

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  last_read_message_id BIGINT UNSIGNED NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_chat_members_group FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chat_members_user (user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_group FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_messages_group_created (group_id, created_at),
  INDEX idx_messages_sender_created (sender_id, created_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(190) NOT NULL,
  body VARCHAR(700) NULL,
  data_json JSON NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user_unread (user_id, read_at, created_at),
  INDEX idx_notifications_type_created (type, created_at)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

CREATE TABLE IF NOT EXISTS chat_payment_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  transfer_phone VARCHAR(60) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'EGP',
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  proof_file_name VARCHAR(190) NOT NULL,
  proof_file_url VARCHAR(700) NOT NULL,
  proof_mime_type VARCHAR(120) NULL,
  proof_file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  proof_storage_provider VARCHAR(60) NOT NULL DEFAULT 'supabase',
  proof_storage_path VARCHAR(255) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  review_note VARCHAR(700) NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_payment_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_chat_payment_user_status (user_id, status, created_at),
  INDEX idx_chat_payment_status_created (status, created_at)
);

ALTER TABLE case_orders MODIFY COLUMN currency CHAR(3) NOT NULL DEFAULT 'EGP';

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_name VARCHAR(160) NOT NULL,
  contact_number VARCHAR(60) NOT NULL,
  contact_email VARCHAR(190) NOT NULL,
  scope_of_work TEXT NOT NULL,
  file_link TEXT NULL,
  status ENUM('new', 'in_review', 'contacted', 'completed') NOT NULL DEFAULT 'new',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
);

CREATE TABLE IF NOT EXISTS site_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  site_name VARCHAR(160) NOT NULL DEFAULT 'BoneHard',
  logo_url VARCHAR(700) NULL,
  logo_public_id VARCHAR(255) NULL,
  logo_resource_type VARCHAR(30) NULL,
  logo_original_name VARCHAR(190) NULL,
  favicon_url VARCHAR(700) NULL,
  favicon_public_id VARCHAR(255) NULL,
  favicon_resource_type VARCHAR(30) NULL,
  favicon_original_name VARCHAR(190) NULL,
  address_city VARCHAR(190) NULL,
  map_title VARCHAR(190) NULL,
  map_embed_url VARCHAR(700) NULL,
  copyright_text VARCHAR(190) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_site_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS site_social_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  type ENUM('url', 'whatsapp') NOT NULL DEFAULT 'url',
  target VARCHAR(700) NOT NULL,
  icon_url VARCHAR(700) NULL,
  icon_public_id VARCHAR(255) NULL,
  icon_resource_type VARCHAR(30) NULL,
  icon_original_name VARCHAR(190) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_site_social_active_sort (is_active, sort_order)
);

CREATE TABLE IF NOT EXISTS contact_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(120) NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contact_recipients_active (is_active)
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_name VARCHAR(160) NOT NULL,
  contact_number VARCHAR(60) NOT NULL,
  contact_email VARCHAR(190) NOT NULL,
  scope_of_work VARCHAR(190) NOT NULL,
  message TEXT NULL,
  file_link TEXT NULL,
  status ENUM('new', 'reviewed', 'replied', 'closed', 'email_failed') NOT NULL DEFAULT 'new',
  notes TEXT NULL,
  email_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contact_submissions_status_created (status, created_at),
  INDEX idx_contact_submissions_email_created (contact_email, created_at)
);

INSERT IGNORE INTO site_settings (id, site_name, logo_url, favicon_url, address_city, map_title, map_embed_url, copyright_text)
VALUES (
  1,
  'BoneHard',
  '/assets/logo/new_logo.webp',
  '/assets/logo/new_logo.webp',
  'Dubai - UAE',
  'BoneHard Dubai Location',
  'https://www.google.com/maps?q=Dubai,UAE&z=11&output=embed',
  '© BoneHard. UAE - Dubai'
);

-- Keeps existing app databases aligned when db:schema is re-run after older installs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;
UPDATE users SET is_active = 1 WHERE is_active IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_active_role ON users (is_active, role);
ALTER TABLE orders MODIFY scope_of_work TEXT NOT NULL;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS logo_original_name VARCHAR(190) NULL;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS favicon_original_name VARCHAR(190) NULL;
ALTER TABLE site_social_links ADD COLUMN IF NOT EXISTS icon_original_name VARCHAR(190) NULL;
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS status ENUM('running', 'stopped') NOT NULL DEFAULT 'stopped';
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS timer_type ENUM('counting', 'manual') NOT NULL DEFAULT 'counting';
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS work_date DATE NULL;
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(12,2) NULL;
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) NULL;
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS client_id BIGINT UNSIGNED NULL;
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL;
ALTER TABLE case_timers ADD COLUMN IF NOT EXISTS is_invoiced TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS folder_type ENUM('private', 'public', 'tasks') NOT NULL DEFAULT 'private';
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS cloudinary_public_id VARCHAR(255) NULL;
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS cloudinary_resource_type VARCHAR(30) NULL;
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS cloudinary_secure_url VARCHAR(700) NULL;
ALTER TABLE case_files ADD COLUMN IF NOT EXISTS cloudinary_version BIGINT UNSIGNED NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS progress_tracking TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS price DECIMAL(12,2) NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS color VARCHAR(32) NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS template_id BIGINT UNSIGNED NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40) NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS contact_email VARCHAR(190) NULL;
ALTER TABLE case_tasks MODIFY COLUMN priority ENUM('low', 'normal', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'normal';
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS private_task TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS estimated_minutes INT UNSIGNED NULL;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS time_spent_minutes INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS task_type ENUM('to-do', 'milestone') NOT NULL DEFAULT 'to-do';
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS start_date DATE NULL;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS tags_json JSON NULL;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS recurring_json JSON NULL;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL;
ALTER TABLE case_orders MODIFY COLUMN status ENUM('open', 'converted', 'closed', 'new', 'quoted', 'approved', 'in-progress', 'completed', 'cancelled') NOT NULL DEFAULT 'open';
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS patient_name VARCHAR(190) NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS target_id BIGINT UNSIGNED NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS price DECIMAL(12,2) NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS custom_uid VARCHAR(80) NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS integration_uid VARCHAR(120) NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS order_notes LONGTEXT NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS surgery_date DATE NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS dob DATE NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS jaw_selection ENUM('maxilla', 'mandible', 'both') NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS guide_support_type ENUM('tooth', 'tissue', 'bone') NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS impression_type VARCHAR(120) NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS implant_type VARCHAR(120) NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS number_of_implants INT UNSIGNED NULL;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS is_archived TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE case_orders ADD COLUMN IF NOT EXISTS converted_case_id BIGINT UNSIGNED NULL;
ALTER TABLE case_template_tasks MODIFY COLUMN priority ENUM('low', 'normal', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'normal';
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS status ENUM('open', 'assigned', 'to-do', 'in-progress', 'completed') NOT NULL DEFAULT 'open';
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS phase_name VARCHAR(160) NULL;
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS private_task TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS estimated_minutes INT UNSIGNED NULL;
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS task_type ENUM('to-do', 'milestone') NOT NULL DEFAULT 'to-do';
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS start_offset_days INT NULL;
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS due_offset_days INT NULL;
ALTER TABLE case_template_tasks ADD COLUMN IF NOT EXISTS tags_json JSON NULL;
ALTER TABLE case_tasks ADD COLUMN IF NOT EXISTS prevent_editing TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_description LONGTEXT NULL;
