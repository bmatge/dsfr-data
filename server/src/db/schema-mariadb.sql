-- dsfr-data MariaDB schema v1

-- Users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  display_name VARCHAR(255),
  role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'editor',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Groups
CREATE TABLE IF NOT EXISTS `groups` (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS group_members (
  group_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sources
CREATE TABLE IF NOT EXISTS sources (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config_json JSON NOT NULL,
  data_json LONGTEXT,
  record_count INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Connections
CREATE TABLE IF NOT EXISTS connections (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  config_json JSON NOT NULL,
  api_key_encrypted TEXT,
  status VARCHAR(50) DEFAULT 'unknown',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  chart_type VARCHAR(50),
  code LONGTEXT NOT NULL,
  builder_state_json JSON,
  source_app VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dashboards
CREATE TABLE IF NOT EXISTS dashboards (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  layout_json JSON NOT NULL,
  widgets_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sharing (polymorphic). target_type='public' = anonymous capability link
-- (the row id is the unguessable token, target_id stays NULL).
CREATE TABLE IF NOT EXISTS shares (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(36) NOT NULL,
  target_type ENUM('user', 'group', 'global', 'public') NOT NULL,
  target_id VARCHAR(36),
  permission ENUM('read', 'write') NOT NULL DEFAULT 'read',
  granted_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  INDEX idx_shares_resource (resource_type, resource_id),
  INDEX idx_shares_target (target_type, target_id),
  FOREIGN KEY (granted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Data cache (API fallback)
CREATE TABLE IF NOT EXISTS data_cache (
  source_id VARCHAR(36) NOT NULL PRIMARY KEY,
  data_json LONGTEXT NOT NULL,
  data_hash VARCHAR(64),
  record_count INT UNSIGNED DEFAULT 0,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ttl_seconds INT UNSIGNED DEFAULT 3600
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monitoring (centralized, replaces beacon logs)
CREATE TABLE IF NOT EXISTS monitoring (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  component VARCHAR(100) NOT NULL,
  chart_type VARCHAR(50),
  origin VARCHAR(500) NOT NULL,           -- full URL (origin + path) since v2, was origin-only before
  first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  call_count INT UNSIGNED DEFAULT 1,
  UNIQUE KEY uq_monitoring (component, chart_type, origin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Schema version (for future migrations)
CREATE TABLE IF NOT EXISTS schema_version (
  version INT UNSIGNED PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO schema_version (version) VALUES (1);

-- Indexes (IF NOT EXISTS for idempotent re-runs)
CREATE INDEX IF NOT EXISTS idx_sources_owner ON sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_connections_owner ON connections(owner_id);
CREATE INDEX IF NOT EXISTS idx_favorites_owner ON favorites(owner_id);
CREATE INDEX IF NOT EXISTS idx_dashboards_owner ON dashboards(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_resource ON shares(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_shares_target ON shares(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_component ON monitoring(component, origin);
CREATE INDEX IF NOT EXISTS idx_data_cache_fetched ON data_cache(fetched_at);
