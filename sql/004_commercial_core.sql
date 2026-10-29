-- Wedding-In hybrid commercial core. Additive only. No legacy table drops.
CREATE TABLE IF NOT EXISTS event_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(45) NOT NULL UNIQUE, name VARCHAR(130) NOT NULL,
  duration_hours DECIMAL(7,2) NULL, description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(55) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL,
  category VARCHAR(90) NOT NULL, unit VARCHAR(30) NOT NULL DEFAULT 'event',
  default_fulfillment ENUM('internal','managed_vendor','client_direct') NOT NULL DEFAULT 'internal',
  default_cost DECIMAL(18,2) NULL, default_sell DECIMAL(18,2) NULL,
  tax_code VARCHAR(40) NULL, notes TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (default_cost IS NULL OR default_cost>=0),
  CHECK (default_sell IS NULL OR default_sell>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_price_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL, event_type_id BIGINT UNSIGNED NULL,
  city VARCHAR(100) NULL, min_guests INT UNSIGNED NULL, max_guests INT UNSIGNED NULL,
  day_type ENUM('weekday','weekend') NULL,
  valid_from DATE NOT NULL, valid_to DATE NULL, priority INT NOT NULL DEFAULT 0,
  cost_unit DECIMAL(18,2) NOT NULL, sell_unit DECIMAL(18,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(service_id) REFERENCES services(id),
  FOREIGN KEY(event_type_id) REFERENCES event_types(id),
  INDEX idx_price_lookup(service_id,active,valid_from,valid_to),
  CHECK (cost_unit>=0 AND sell_unit>=0),
  CHECK (max_guests IS NULL OR min_guests IS NULL OR max_guests>=min_guests)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendor_services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vendor_id BIGINT UNSIGNED NOT NULL, service_id BIGINT UNSIGNED NULL,
  vendor_sku VARCHAR(75) NOT NULL, title VARCHAR(180) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'package', min_qty DECIMAL(12,3) NOT NULL DEFAULT 1,
  capacity_per_day INT UNSIGNED NOT NULL DEFAULT 1,
  lead_time_days INT UNSIGNED NOT NULL DEFAULT 0,
  service_area VARCHAR(200) NULL, terms TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uniq_vendor_sku(vendor_id,vendor_sku),
  FOREIGN KEY(vendor_id) REFERENCES vendors(id),
  FOREIGN KEY(service_id) REFERENCES services(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vendor_service_rates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vendor_service_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL, effective_to DATE NULL,
  city VARCHAR(100) NULL, min_qty DECIMAL(12,3) NOT NULL DEFAULT 1,
  max_qty DECIMAL(12,3) NULL, cost_unit DECIMAL(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'IDR', active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY(vendor_service_id) REFERENCES vendor_services(id),
  INDEX idx_vendor_rate(vendor_service_id,active,effective_from),
  CHECK(cost_unit>=0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS package_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_id BIGINT UNSIGNED NOT NULL, version_no INT UNSIGNED NOT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  pricing_mode ENUM('sum_items','fixed_bundle') NOT NULL DEFAULT 'sum_items',
  fixed_bundle_price DECIMAL(18,2) NULL,
  published_at DATETIME NULL, created_by BIGINT UNSIGNED NULL,
  UNIQUE KEY uniq_package_version(package_id,version_no),
  FOREIGN KEY(package_id) REFERENCES packages(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS package_version_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_version_id BIGINT UNSIGNED NOT NULL, service_id BIGINT UNSIGNED NULL,
  vendor_service_id BIGINT UNSIGNED NULL, line_name VARCHAR(200) NOT NULL,
  qty DECIMAL(12,3) NOT NULL DEFAULT 1, unit VARCHAR(30) NOT NULL DEFAULT 'event',
  fulfillment ENUM('internal','managed_vendor','client_direct') NOT NULL,
  default_cost_unit DECIMAL(18,2) NOT NULL DEFAULT 0,
  default_sell_unit DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_optional BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY(package_version_id) REFERENCES package_versions(id),
  FOREIGN KEY(service_id) REFERENCES services(id),
  FOREIGN KEY(vendor_service_id) REFERENCES vendor_services(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quote_number VARCHAR(50) NOT NULL UNIQUE, lead_id BIGINT UNSIGNED NULL,
  client_id BIGINT UNSIGNED NULL, client_name VARCHAR(150) NOT NULL,
  client_phone VARCHAR(40) NULL, status ENUM('draft','sent','accepted','rejected','withdrawn') NOT NULL DEFAULT 'draft',
  current_revision_id BIGINT UNSIGNED NULL, accepted_revision_id BIGINT UNSIGNED NULL,
  accepted_event_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(lead_id) REFERENCES leads(id),
  FOREIGN KEY(client_id) REFERENCES clients(id),
  FOREIGN KEY(accepted_event_id) REFERENCES events(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_revisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id BIGINT UNSIGNED NOT NULL, version_no INT UNSIGNED NOT NULL,
  event_type_id BIGINT UNSIGNED NULL, event_date DATE NOT NULL,
  city VARCHAR(100) NULL, venue VARCHAR(200) NULL, guest_count INT UNSIGNED NOT NULL DEFAULT 0,
  valid_until DATE NOT NULL, package_version_id BIGINT UNSIGNED NULL,
  notes TEXT, payment_terms_json JSON NULL, tax_policy VARCHAR(100) NULL,
  subtotal_managed DECIMAL(18,2) NOT NULL DEFAULT 0,
  subtotal_direct DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount_total DECIMAL(18,2) NOT NULL DEFAULT 0, tax_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  contract_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  client_budget_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_est_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  status ENUM('draft','sent','accepted','rejected','withdrawn') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL, sent_at DATETIME NULL, accepted_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_quote_revision(quotation_id,version_no),
  FOREIGN KEY(quotation_id) REFERENCES quotations(id),
  FOREIGN KEY(event_type_id) REFERENCES event_types(id),
  FOREIGN KEY(package_version_id) REFERENCES package_versions(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  revision_id BIGINT UNSIGNED NOT NULL, line_no INT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NULL, vendor_service_id BIGINT UNSIGNED NULL,
  title_snapshot VARCHAR(220) NOT NULL, unit_snapshot VARCHAR(30) NOT NULL,
  fulfillment ENUM('internal','managed_vendor','client_direct') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL, unit_sell DECIMAL(18,2) NOT NULL,
  unit_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  sell_net DECIMAL(18,2) NOT NULL, cost_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  price_rule_id BIGINT UNSIGNED NULL, overridden BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason VARCHAR(350) NULL,
  UNIQUE KEY uniq_quote_line(revision_id,line_no),
  FOREIGN KEY(revision_id) REFERENCES quotation_revisions(id),
  FOREIGN KEY(service_id) REFERENCES services(id),
  FOREIGN KEY(vendor_service_id) REFERENCES vendor_services(id),
  FOREIGN KEY(price_rule_id) REFERENCES service_price_rules(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS price_override_audits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(65) NOT NULL, entity_id BIGINT UNSIGNED NOT NULL,
  field_name VARCHAR(55) NOT NULL, before_amount DECIMAL(18,2) NOT NULL,
  after_amount DECIMAL(18,2) NOT NULL, reason VARCHAR(350) NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(actor_id) REFERENCES users(id),
  INDEX idx_override_target(entity_type,entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_actions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  quotation_id BIGINT UNSIGNED NOT NULL, revision_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(45) NOT NULL, reason VARCHAR(350) NULL,
  actor_id BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(quotation_id) REFERENCES quotations(id),
  FOREIGN KEY(revision_id) REFERENCES quotation_revisions(id),
  FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_budget_revisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT UNSIGNED NOT NULL, revision_no INT UNSIGNED NOT NULL DEFAULT 1,
  source_revision_id BIGINT UNSIGNED NOT NULL,
  contract_total DECIMAL(18,2) NOT NULL,
  direct_budget DECIMAL(18,2) NOT NULL, cost_est_total DECIMAL(18,2) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_event_budget(event_id,revision_no),
  FOREIGN KEY(event_id) REFERENCES events(id),
  FOREIGN KEY(source_revision_id) REFERENCES quotation_revisions(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_budget_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  budget_revision_id BIGINT UNSIGNED NOT NULL, quotation_line_id BIGINT UNSIGNED NOT NULL,
  title_snapshot VARCHAR(220) NOT NULL, fulfillment ENUM('internal','managed_vendor','client_direct') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL, unit_sell DECIMAL(18,2) NOT NULL,
  unit_cost DECIMAL(18,2) NOT NULL, sell_net DECIMAL(18,2) NOT NULL, cost_total DECIMAL(18,2) NOT NULL,
  FOREIGN KEY(budget_revision_id) REFERENCES event_budget_revisions(id),
  FOREIGN KEY(quotation_line_id) REFERENCES quotation_lines(id)
) ENGINE=InnoDB;
