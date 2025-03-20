import db from './database';

// Create organizations table
db.run(`
  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    organization_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'agent')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )
`);

// Create api_keys table
db.run(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create index on api_keys.key
db.run(`
  CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)
`);

// Create rate limits table
db.run(`
  CREATE TABLE IF NOT EXISTS rate_limits (
    api_key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    reset_time INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key) REFERENCES api_keys(key) ON DELETE CASCADE
  )
`);

// Create teams table
db.run(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    organization_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(name, organization_id)
  )
`);

// Create team_members table
db.run(`
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(team_id, user_id)
  )
`);

// Create index on team_members
db.run(`
  CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)
`);

// Create contacts table
db.run(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    organization_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )
`);

// Create contact_emails table
db.run(`
  CREATE TABLE IF NOT EXISTS contact_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE(email, contact_id)
  )
`);

// Create index on contact_emails.email for smart merge lookups
db.run(`
  CREATE INDEX IF NOT EXISTS idx_contact_emails_email ON contact_emails(email)
`);

// Create contact_phones table
db.run(`
  CREATE TABLE IF NOT EXISTS contact_phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE(phone, contact_id)
  )
`);

// Create index on contact_phones.phone for smart merge lookups
db.run(`
  CREATE INDEX IF NOT EXISTS idx_contact_phones_phone ON contact_phones(phone)
`);

// Create tickets table
db.run(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK(status IN ('open', 'closed')) DEFAULT 'open',
    priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high')) DEFAULT 'normal',
    assignee_id INTEGER,
    contact_id INTEGER,
    organization_id INTEGER NOT NULL,
    closed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )
`);

// Create attachments table
db.run(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    organization_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )
`);

// Create comments table
db.run(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    body_html TEXT NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT 0,
    author_type TEXT NOT NULL CHECK(author_type IN ('user', 'contact')),
    author_id INTEGER NOT NULL,
    organization_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )
`);

// Create ticket_attachments junction table
db.run(`
  CREATE TABLE IF NOT EXISTS ticket_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    attachment_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
    UNIQUE(ticket_id, attachment_id)
  )
`);

// Create comment_attachments junction table
db.run(`
  CREATE TABLE IF NOT EXISTS comment_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    attachment_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
    UNIQUE(comment_id, attachment_id)
  )
`);

// Create indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_organization_id ON tickets(organization_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_assignee_id ON tickets(assignee_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_tickets_contact_id ON tickets(contact_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_comments_organization_id ON comments(organization_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_attachments_organization_id ON attachments(organization_id)`); 