CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner','admin','finance','planner','sales') NOT NULL DEFAULT 'planner',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leads (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL, phone VARCHAR(40), email VARCHAR(190),
  source VARCHAR(70), status ENUM('new','contacted','proposal','won','lost') NOT NULL DEFAULT 'new',
  wedding_date DATE NULL, estimated_budget DECIMAL(18,2) DEFAULT 0,
  notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL, partner_name VARCHAR(150), phone VARCHAR(40),
  email VARCHAR(190), address TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS packages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL, description TEXT, price DECIMAL(18,2) NOT NULL DEFAULT 0,
  inclusions JSON NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL, title VARCHAR(180) NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL, lead_id BIGINT UNSIGNED NULL,
  package_id BIGINT UNSIGNED NULL, event_date DATE NOT NULL,
  venue VARCHAR(200), city VARCHAR(100), guest_count INT UNSIGNED DEFAULT 0,
  status ENUM('planning','confirmed','in_progress','completed','cancelled') NOT NULL DEFAULT 'planning',
  contract_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  estimated_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE SET NULL,
  INDEX idx_date_status (event_date, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL, category VARCHAR(90) NOT NULL,
  contact_person VARCHAR(100), phone VARCHAR(40), email VARCHAR(190),
  city VARCHAR(100), base_price DECIMAL(18,2) DEFAULT 0,
  notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_vendors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_id BIGINT UNSIGNED NOT NULL,
  vendor_id BIGINT UNSIGNED NOT NULL, service_name VARCHAR(130),
  agreed_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('proposed','booked','confirmed','completed','cancelled') DEFAULT 'proposed',
  notes TEXT, UNIQUE KEY unique_event_vendor (event_id,vendor_id),
  FOREIGN KEY (event_id) REFERENCES events(id), FOREIGN KEY (vendor_id) REFERENCES vendors(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL, position VARCHAR(100), phone VARCHAR(40),
  daily_rate DECIMAL(18,2) DEFAULT 0, active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_staff (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL, staff_id BIGINT UNSIGNED NOT NULL,
  assignment VARCHAR(150), fee DECIMAL(18,2) DEFAULT 0,
  UNIQUE KEY unique_event_staff (event_id,staff_id),
  FOREIGN KEY (event_id) REFERENCES events(id), FOREIGN KEY (staff_id) REFERENCES staff(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL, category VARCHAR(60) DEFAULT 'Persiapan',
  due_at DATETIME NULL, assigned_to VARCHAR(100),
  priority ENUM('low','medium','high') DEFAULT 'medium',
  status ENUM('todo','progress','done') DEFAULT 'todo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id), INDEX idx_event_task(event_id,status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(16) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL, type ENUM('asset','liability','equity','revenue','cogs','expense') NOT NULL,
  is_cash BOOLEAN DEFAULT FALSE, active BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS journals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entry_date DATE NOT NULL, description VARCHAR(255) NOT NULL,
  reference_type VARCHAR(35) NOT NULL, reference_id BIGINT UNSIGNED NULL,
  cash_flow ENUM('operating','investing','financing','opening','none') NOT NULL DEFAULT 'none',
  created_by BIGINT UNSIGNED NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id), INDEX idx_entry_date(entry_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  journal_id BIGINT UNSIGNED NOT NULL, account_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0, credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  FOREIGN KEY(journal_id) REFERENCES journals(id), FOREIGN KEY(account_id) REFERENCES accounts(id),
  FOREIGN KEY(event_id) REFERENCES events(id),
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)),
  INDEX idx_account_event(account_id,event_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_id BIGINT UNSIGNED NOT NULL,
  number VARCHAR(40) NOT NULL UNIQUE, amount DECIMAL(18,2) NOT NULL,
  due_date DATE NOT NULL, description VARCHAR(250),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, invoice_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL, method ENUM('bank','cash') NOT NULL DEFAULT 'bank',
  paid_at DATE NOT NULL, reference VARCHAR(120), journal_id BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id), FOREIGN KEY(journal_id) REFERENCES journals(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NULL, vendor_id BIGINT UNSIGNED NULL,
  number VARCHAR(40) NOT NULL UNIQUE, description VARCHAR(250) NOT NULL,
  amount DECIMAL(18,2) NOT NULL, due_date DATE NOT NULL,
  expense_account_code VARCHAR(16) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id), FOREIGN KEY(vendor_id) REFERENCES vendors(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bill_payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, bill_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL, method ENUM('bank','cash') NOT NULL DEFAULT 'bank',
  paid_at DATE NOT NULL, reference VARCHAR(120), journal_id BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY(bill_id) REFERENCES bills(id), FOREIGN KEY(journal_id) REFERENCES journals(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS migrations (
  id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(200) NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
