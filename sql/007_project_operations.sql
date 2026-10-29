CREATE TABLE IF NOT EXISTS project_expense_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  needed_by DATE NOT NULL,
  explanation VARCHAR(600) NOT NULL,
  status ENUM('submitted','approved','rejected','fulfilled') NOT NULL DEFAULT 'submitted',
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(350) NULL,
  finance_transaction_id BIGINT UNSIGNED NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(requested_by) REFERENCES users(id),
  FOREIGN KEY(reviewed_by) REFERENCES users(id),
  FOREIGN KEY(finance_transaction_id) REFERENCES finance_transactions(id),
  INDEX idx_expense_project(event_id,status,needed_by),
  CHECK(amount>0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_vendor_payment_proofs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_payment_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(160) NOT NULL,
  mime_type ENUM('image/jpeg','image/png','image/webp','application/pdf') NOT NULL,
  data_base64 MEDIUMTEXT NOT NULL,
  file_sha256 CHAR(64) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(bill_payment_id) REFERENCES bill_payments(id),
  FOREIGN KEY(uploaded_by) REFERENCES users(id),
  INDEX idx_project_proof(bill_payment_id,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_closings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL UNIQUE,
  status ENUM('requested','rejected','completed') NOT NULL DEFAULT 'requested',
  request_note VARCHAR(600) NOT NULL,
  decision_note VARCHAR(600) NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  summary_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(requested_by) REFERENCES users(id),
  FOREIGN KEY(reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB;
