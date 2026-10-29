-- Unified operations register. Legacy invoice/bill posting remains authoritative.
CREATE TABLE IF NOT EXISTS finance_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL,
  flow_type ENUM('income','expense','transfer') NOT NULL,
  default_debit_account_id BIGINT UNSIGNED NULL,
  default_credit_account_id BIGINT UNSIGNED NULL,
  requires_event BOOLEAN NOT NULL DEFAULT FALSE,
  requires_attachment BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(default_debit_account_id) REFERENCES accounts(id),
  FOREIGN KEY(default_credit_account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cash_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT UNSIGNED NOT NULL UNIQUE,
  kind ENUM('cash','bank') NOT NULL, bank_name VARCHAR(120) NULL,
  holder VARCHAR(120) NULL, account_number_masked VARCHAR(50) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_terms (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
  days_due INT UNSIGNED NOT NULL DEFAULT 0,
  installment_rules_json JSON NULL, active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS finance_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(50) NOT NULL UNIQUE,
  kind ENUM('DIRECT_EXPENSE','OTHER_RECEIPT','INTERNAL_TRANSFER') NOT NULL,
  direction ENUM('in','out','transfer') NOT NULL,
  event_id BIGINT UNSIGNED NULL, category_id BIGINT UNSIGNED NULL,
  transaction_date DATE NOT NULL,
  cash_account_id BIGINT UNSIGNED NOT NULL,
  destination_cash_account_id BIGINT UNSIGNED NULL,
  counterparty_name VARCHAR(160) NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  status ENUM('draft','submitted','approved','posted','reversed') NOT NULL DEFAULT 'draft',
  reference VARCHAR(120) NULL, idempotency_key VARCHAR(100) NULL UNIQUE,
  created_by BIGINT UNSIGNED NOT NULL, approved_by BIGINT UNSIGNED NULL,
  posted_journal_id BIGINT UNSIGNED NULL UNIQUE,
  reason VARCHAR(350) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(category_id) REFERENCES finance_categories(id),
  FOREIGN KEY(cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY(destination_cash_account_id) REFERENCES accounts(id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(approved_by) REFERENCES users(id),
  FOREIGN KEY(posted_journal_id) REFERENCES journals(id),
  INDEX idx_finance_date(transaction_date,status),
  CHECK(amount>0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS finance_source_links (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NULL,
  legacy_source_type ENUM('invoice_payments','bill_payments') NOT NULL,
  legacy_source_id BIGINT UNSIGNED NOT NULL,
  legacy_journal_id BIGINT UNSIGNED NULL,
  UNIQUE KEY uniq_legacy(legacy_source_type,legacy_source_id),
  FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id),
  FOREIGN KEY(legacy_journal_id) REFERENCES journals(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS finance_audit_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id BIGINT UNSIGNED NOT NULL, action VARCHAR(45) NOT NULL,
  reason VARCHAR(350) NULL, actor_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id),
  FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB;
