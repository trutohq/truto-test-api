import { Database } from "bun:sqlite";

// Initialize the database
const db = new Database("ticketing.db");

// Enable foreign keys
db.exec("PRAGMA foreign_keys = ON");

// Enable WAL mode
db.exec("PRAGMA journal_mode = WAL");

export default db; 