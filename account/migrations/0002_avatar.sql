-- Player icon chosen in the account dialog. NULL = defaults (squid, ink picked from the login id).
ALTER TABLE users ADD COLUMN avatar_icon TEXT;
ALTER TABLE users ADD COLUMN avatar_color TEXT;
