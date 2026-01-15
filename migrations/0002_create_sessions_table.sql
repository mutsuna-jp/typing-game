-- Create game_sessions table to store session data persistently on Cloudflare Workers
CREATE TABLE game_sessions (
    id TEXT PRIMARY KEY,
    seed INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, -- Unix timestamp in ms
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for expiration cleanup
CREATE INDEX idx_game_sessions_expires_at ON game_sessions(expires_at);
