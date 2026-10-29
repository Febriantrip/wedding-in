CREATE TABLE IF NOT EXISTS project_task_schedules (
  task_id BIGINT UNSIGNED PRIMARY KEY,
  start_at DATETIME NULL,
  depends_on_task_id BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY(updated_by) REFERENCES users(id),
  CHECK(depends_on_task_id IS NULL OR depends_on_task_id<>task_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_rundown_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  segment ENUM('preparation','ceremony','reception','closing','other') NOT NULL DEFAULT 'other',
  planned_start DATETIME NOT NULL,
  planned_end DATETIME NOT NULL,
  actual_start DATETIME NULL,
  actual_end DATETIME NULL,
  status ENUM('scheduled','ongoing','done','cancelled') NOT NULL DEFAULT 'scheduled',
  staff_assignment_id BIGINT UNSIGNED NULL,
  vendor_assignment_id BIGINT UNSIGNED NULL,
  notes VARCHAR(600) NULL,
  cancel_reason VARCHAR(350) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(staff_assignment_id) REFERENCES event_staff(id) ON DELETE SET NULL,
  FOREIGN KEY(vendor_assignment_id) REFERENCES event_vendors(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(updated_by) REFERENCES users(id),
  INDEX idx_rundown_schedule(event_id,planned_start,status),
  CHECK(planned_end>planned_start)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_team_presence (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  team_kind ENUM('crew','vendor') NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  state ENUM('expected','arrived','ready','departed') NOT NULL DEFAULT 'expected',
  arrived_at DATETIME NULL,
  ready_at DATETIME NULL,
  departed_at DATETIME NULL,
  note VARCHAR(350) NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(updated_by) REFERENCES users(id),
  UNIQUE KEY uniq_team_presence(event_id,team_kind,assignment_id),
  INDEX idx_team_presence(event_id,state)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_incidents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  rundown_item_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  description VARCHAR(800) NOT NULL,
  severity ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  resolution VARCHAR(800) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  resolved_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(rundown_item_id) REFERENCES event_rundown_items(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(resolved_by) REFERENCES users(id),
  INDEX idx_incident_event(event_id,status,severity)
) ENGINE=InnoDB;
