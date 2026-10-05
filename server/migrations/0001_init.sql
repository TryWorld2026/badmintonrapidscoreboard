-- ================================================================
-- 0001_init.sql — 羽毛球计分板 初始架构
--
-- 设计原则：
--   1. 所有 id 用 TEXT（ULID 风格字符串），不用 AUTOINCREMENT。
--      理由：客户端离线时也要能生成 id，且不能与服务器冲突。
--      自增整数做不到「离线生成、合并时不撞车」。
--   2. 时间统一 INTEGER（Unix 毫秒）。D1/SQLite 没有原生时间类型，
--      用 TEXT 存 ISO 字符串会让比较与索引都变慢。
--   3. 软删除：matches 用 deleted 墓碑而不是物理删除。
--      否则多设备同步时，A 设备删掉的记录会被 B 设备推回来。
--   4. 每个「用户私有」的表都带 owner_id，查询一律先按 owner_id 过滤 —— 
--      权限判断放在 SQL 条件里，不靠应用层记得加。
-- ================================================================

PRAGMA foreign_keys = ON;

-- ---------- 用户 ----------
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    -- 只存哈希，永不存明文。算法见 server/src/lib/password.ts
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    avatar_url    TEXT NOT NULL DEFAULT '',
    -- 统计冗余：避免每次列表都全表扫 matches
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ---------- 刷新令牌 ----------
-- access token 是短效 JWT（无状态），refresh token 必须落库才能撤销。
-- 只存哈希：数据库泄露也无法直接冒用。
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    -- 轮换时把旧 token 标记为已撤销，而不是删除：
    -- 检测到「已撤销的 token 又被使用」= 令牌被盗，可以据此撤销整条链。
    revoked_at INTEGER,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(token_hash);

-- ---------- 俱乐部 ----------
CREATE TABLE IF NOT EXISTS clubs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    -- 邀请码：8 位大写，唯一。用它加入，不需要管理员逐个拉人。
    invite_code TEXT NOT NULL UNIQUE,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clubs_invite ON clubs(invite_code);

-- ---------- 俱乐部成员 ----------
CREATE TABLE IF NOT EXISTS club_members (
    club_id   TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- owner 可解散/改名；admin 可管理球局；member 只能报名
    role      TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner', 'admin', 'member')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_user ON club_members(user_id);

-- ---------- 球局（Session）----------
-- 这是本产品的核心单位：不是「一场比赛」，而是「2 小时 6 人打 9 局 AA 35 元」。
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    club_id     TEXT REFERENCES clubs(id) ON DELETE CASCADE,
    -- 个人练习局可以没有俱乐部，所以 club_id 允许为 NULL
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    starts_at   INTEGER NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 120,
    court_count INTEGER NOT NULL DEFAULT 1,
    -- 费用总额（分）。用整数存钱，不用浮点。
    fee_cents   INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'closed', 'cancelled')),
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_club ON sessions(club_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id, starts_at DESC);

-- ---------- 球局参与者 ----------
-- user_id 可为 NULL：经常有「临时来一次的球友」没账号，只记名字。
CREATE TABLE IF NOT EXISTS session_players (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    guest_name  TEXT NOT NULL DEFAULT '',
    -- going=正选, waitlist=候补, out=退出
    status      TEXT NOT NULL DEFAULT 'going'
                CHECK (status IN ('going', 'waitlist', 'out')),
    -- 候补排队顺序：越小越靠前。有人退出时取最小的那个递补。
    queue_pos   INTEGER NOT NULL DEFAULT 0,
    joined_at   INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sp_session ON session_players(session_id, status, queue_pos);
CREATE INDEX IF NOT EXISTS idx_sp_user ON session_players(user_id);

-- ---------- 比赛记录 ----------
CREATE TABLE IF NOT EXISTS matches (
    id          TEXT PRIMARY KEY,
    -- 客户端生成的稳定 id：弱网重试时用它去重，避免同一场存两条
    client_id   TEXT NOT NULL,
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,

    team_a      TEXT NOT NULL DEFAULT '',
    team_b      TEXT NOT NULL DEFAULT '',
    score_a     INTEGER NOT NULL DEFAULT 0,
    score_b     INTEGER NOT NULL DEFAULT 0,
    games_a     INTEGER NOT NULL DEFAULT 0,
    games_b     INTEGER NOT NULL DEFAULT 0,
    -- 各局比分，如 "21-18,19-21,21-15"
    game_scores TEXT NOT NULL DEFAULT '',
    duration_sec INTEGER NOT NULL DEFAULT 0,
    mode        TEXT NOT NULL DEFAULT '21',
    highlights  TEXT NOT NULL DEFAULT '[]',   -- JSON 数组
    played_at   INTEGER NOT NULL,

    -- 冲突解决：LWW（最后写入胜）。客户端时钟不可信，
    -- 所以用服务端接收时间做权威排序，同时保留客户端的 played_at 供展示。
    updated_at  INTEGER NOT NULL,
    -- 软删除墓碑
    deleted     INTEGER NOT NULL DEFAULT 0
);

-- 去重靠这个唯一索引：同一个 owner 下 client_id 只能有一条。
-- 弱网重试上传同一条记录时，用 INSERT ... ON CONFLICT DO UPDATE 而不是报错。
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_client
    ON matches(owner_id, client_id);
CREATE INDEX IF NOT EXISTS idx_matches_owner_time
    ON matches(owner_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_session
    ON matches(session_id);

-- ---------- 比赛参与者（支撑 H2H / 搭档默契度）----------
-- 老数据只有队名字符串，没有结构化球员，所以这张表初期会是空的；
-- 客户端尽力解析后回填，解析不出来就留空（诚实降级，不编造）。
CREATE TABLE IF NOT EXISTS match_players (
    match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    guest_name TEXT NOT NULL DEFAULT '',
    side       TEXT NOT NULL CHECK (side IN ('a', 'b')),
    PRIMARY KEY (match_id, side, guest_name)
);

CREATE INDEX IF NOT EXISTS idx_mp_user ON match_players(user_id);
