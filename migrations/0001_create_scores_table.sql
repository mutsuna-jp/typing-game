-- Create scores table for online ranking
CREATE TABLE scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL DEFAULT 'guest',
    score INTEGER NOT NULL,
    kpm INTEGER NOT NULL,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for score sorting (descending)
CREATE INDEX idx_scores_score_desc ON scores(score DESC);
-- Index for user_id lookup
CREATE INDEX idx_scores_user_id ON scores(user_id);
