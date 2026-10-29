CREATE TABLE IF NOT EXISTS event_vendor_bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  payment_responsibility ENUM('managed_vendor','client_direct') NOT NULL DEFAULT 'managed_vendor',
  booking_status ENUM('requested','confirmed','cancelled') NOT NULL DEFAULT 'requested',
  contract_reference VARCHAR(150) NULL,
  deposit_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  deposit_due DATE NULL,
  final_due DATE NULL,
  terms TEXT NULL,
  cancel_reason VARCHAR(350) NULL,
  confirmed_by BIGINT UNSIGNED NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES event_vendors(id),
  FOREIGN KEY (confirmed_by) REFERENCES users(id),
  CHECK (deposit_amount>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_payment_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(140) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  due_date DATE NOT NULL,
  invoice_id BIGINT UNSIGNED NULL UNIQUE,
  status ENUM('planned','cancelled') NOT NULL DEFAULT 'planned',
  cancel_reason VARCHAR(350) NULL,
  idempotency_key VARCHAR(100) NULL UNIQUE,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_project_term(event_id,status,due_date),
  CHECK (amount>0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_change_orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  number VARCHAR(50) NOT NULL UNIQUE,
  explanation VARCHAR(350) NOT NULL,
  status ENUM('submitted','approved','rejected') NOT NULL DEFAULT 'submitted',
  delta_contract DECIMAL(18,2) NOT NULL,
  delta_direct DECIMAL(18,2) NOT NULL,
  delta_cost DECIMAL(18,2) NOT NULL,
  client_approval_reference VARCHAR(200) NULL,
  decision_reason VARCHAR(350) NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  decided_by BIGINT UNSIGNED NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(requested_by) REFERENCES users(id),
  FOREIGN KEY(decided_by) REFERENCES users(id),
  INDEX idx_project_change(event_id,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_change_order_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  change_order_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  action ENUM('add','remove') NOT NULL,
  fulfillment ENUM('internal','managed_vendor','client_direct') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_sell DECIMAL(18,2) NOT NULL,
  unit_cost DECIMAL(18,2) NOT NULL,
  delta_sell DECIMAL(18,2) NOT NULL,
  delta_cost DECIMAL(18,2) NOT NULL,
  FOREIGN KEY(change_order_id) REFERENCES event_change_orders(id),
  CHECK(quantity>0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_contract_revisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  revision_no INT UNSIGNED NOT NULL,
  change_order_id BIGINT UNSIGNED NULL UNIQUE,
  contract_amount DECIMAL(18,2) NOT NULL,
  estimated_cost DECIMAL(18,2) NOT NULL,
  direct_budget DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_project_contract_rev(event_id,revision_no),
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(change_order_id) REFERENCES event_change_orders(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_project_audits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(60) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  note VARCHAR(350) NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(actor_id) REFERENCES users(id),
  INDEX idx_project_audit(event_id,created_at)
) ENGINE=InnoDB;
