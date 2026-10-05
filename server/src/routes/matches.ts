/* ================================================================
   routes/matches.ts — 比赛记录同步

   同步模型：**客户端权威 + 服务端去重**
     - 客户端离线也能计分，登录后把本地记录推上来
     - 去重靠 (owner_id, client_id) 唯一索引：弱网重试不会产生重复
     - 冲突解决用 LWW（last-write-wins），按服务端接收时间排序

   为什么不做 CRDT：
     计分场景的并发写极少（同一场比赛不会两个人同时改），
     而 CRDT 会让数据结构复杂到"没人敢改"。LWW 在这里是正确取舍，
     不是偷懒 —— 代价是极端并发下可能丢一次修改，收益是代码可维护。

   删除用墓碑（deleted=1）而不是物理删除：
     否则 A 设备删掉的记录，会被 B 设备下次同步时又推回来。
   ================================================================ */

import { ValidationError, NotFoundError } from '../lib/errors';
import { json, readJson, type Env } from '../lib/http';
import { validate, schemas } from '../lib/validate';
import { newId } from '../lib/tokens';
import type { AuthedUser } from '../middleware/auth';

export interface MatchRow {
  id: string;
  client_id: string;
  owner_id: string;
  session_id: string | null;
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
  games_a: number;
  games_b: number;
  game_scores: string;
  duration_sec: number;
  mode: string;
  highlights: string;
  played_at: number;
  updated_at: number;
  deleted: number;
}

function toDto(r: MatchRow) {
  let highlights: string[] = [];
  try {
    const parsed = JSON.parse(r.highlights);
    if (Array.isArray(parsed)) highlights = parsed.map(String);
  } catch {
    /* 坏 JSON 降级成空数组，不让它把整个列表接口搞挂 */
  }
  return {
    id: r.id,
    clientId: r.client_id,
    sessionId: r.session_id,
    teamA: r.team_a,
    teamB: r.team_b,
    scoreA: r.score_a,
    scoreB: r.score_b,
    gamesA: r.games_a,
    gamesB: r.games_b,
    gameScores: r.game_scores,
    durationSec: r.duration_sec,
    mode: r.mode,
    highlights,
    playedAt: r.played_at,
    updatedAt: r.updated_at,
    deleted: r.deleted === 1,
  };
}

/* ================================================================
   GET /api/matches?since=<ms>&limit=<n>
   增量拉取：只取 updated_at > since 的记录。
   since=0 表示全量（首次登录时用）。
   ================================================================ */
export async function listMatches(req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const url = new URL(req.url);
  const since = parseInt(url.searchParams.get('since') || '0', 10);
  const limitRaw = parseInt(url.searchParams.get('limit') || '500', 10);
  /* 上限 1000：一次拉太多会让响应体过大，客户端解析也慢。
     客户端应该循环拉取直到拿满。 */
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 500, 1), 1000);

  const rows = await env.DB.prepare(
    `SELECT * FROM matches
     WHERE owner_id = ? AND updated_at > ?
     ORDER BY updated_at ASC
     LIMIT ?`,
  ).bind(user.id, Number.isFinite(since) ? since : 0, limit).all<MatchRow>();

  const items = (rows.results || []).map(toDto);
  return json({
    items,
    /* 客户端拿这个当作下一次的 since */
    cursor: items.length ? items[items.length - 1].updatedAt : (Number.isFinite(since) ? since : 0),
    hasMore: items.length === limit,
  });
}

/* ================================================================
   POST /api/matches — 批量 upsert（同步的主入口）

   批量而不是单条：一次球局可能攒了十几场，逐条 POST 会让弱网下的
   往返次数爆炸。这里一次最多 200 条。

   幂等：同一个 clientId 重复提交只会更新，不会新增。
   ================================================================ */
export async function upsertMatches(req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const body = await readJson(req);
  const raw = (body && typeof body === 'object' && !Array.isArray(body))
    ? (body as Record<string, unknown>).items
    : body;

  if (!Array.isArray(raw)) {
    throw new ValidationError([{ path: 'items', message: '应为数组' }]);
  }
  if (raw.length > 200) {
    throw new ValidationError([{ path: 'items', message: '一次最多同步 200 条' }]);
  }

  const now = Date.now();
  const accepted: string[] = [];
  const rejected: { index: number; fields: unknown }[] = [];

  /* D1 没有跨语句事务的批量 API 之外的好办法，但 batch() 会把这些语句
     放进一个隐式事务里，比逐条 run() 快得多也安全得多。 */
  const stmts: D1PreparedStatement[] = [];

  for (let i = 0; i < raw.length; i++) {
    const v = validate(schemas.matchUpsert, raw[i]);
    if (!v.ok) {
      rejected.push({ index: i, fields: v.fields });
      continue;
    }
    const d = v.value;

    /* 服务端重新计算 updated_at，不用客户端的时间戳：
       客户端时钟不可信（用户可能手动改过系统时间），
       用它会破坏 LWW 的因果顺序。 */
    stmts.push(
      env.DB.prepare(
        `INSERT INTO matches (
           id, client_id, owner_id, session_id,
           team_a, team_b, score_a, score_b, games_a, games_b,
           game_scores, duration_sec, mode, highlights, played_at,
           updated_at, deleted
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(owner_id, client_id) DO UPDATE SET
           team_a       = excluded.team_a,
           team_b       = excluded.team_b,
           score_a      = excluded.score_a,
           score_b      = excluded.score_b,
           games_a      = excluded.games_a,
           games_b      = excluded.games_b,
           game_scores  = excluded.game_scores,
           duration_sec = excluded.duration_sec,
           mode         = excluded.mode,
           highlights   = excluded.highlights,
           played_at    = excluded.played_at,
           updated_at   = excluded.updated_at,
           deleted      = excluded.deleted`,
      ).bind(
        newId('m'),
        d.clientId,
        user.id,
        (d.sessionId as string) || null,
        (d.teamA as string) || '',
        (d.teamB as string) || '',
        d.scoreA ?? 0,
        d.scoreB ?? 0,
        d.gamesA ?? 0,
        d.gamesB ?? 0,
        (d.gameScores as string) || '',
        d.durationSec ?? 0,
        (d.mode as string) || '21',
        /* highlights 从客户端来是数组，库里存 JSON 文本 */
        JSON.stringify(Array.isArray((raw[i] as Record<string, unknown>)?.highlights)
          ? ((raw[i] as Record<string, unknown>).highlights as unknown[]).map(String).slice(0, 20)
          : []),
        d.playedAt ?? now,
        now,
        d.deleted ? 1 : 0,
      ),
    );
    accepted.push(d.clientId as string);
  }

  if (stmts.length) {
    await env.DB.batch(stmts);
  }

  return json({
    accepted: accepted.length,
    rejected,
    /* 服务端时间：客户端可以用它校正下一次 since */
    serverTime: now,
  });
}

/* ================================================================
   DELETE /api/matches/:clientId
   软删除：写墓碑，让其他设备同步时知道"这条被删了"。

   ⚠️ 必须同时按 owner_id 过滤，不能只按 client_id 查。
   client_id 只保证「同一用户内唯一」（唯一索引是 (owner_id, client_id)），
   不同用户完全可能用同一个 client_id。
   实测抓到的 bug：连跑两遍接口测试，第二遍「删除」返回 403 ——
   因为第一遍留下的另一个用户也有 clientId='c-test-1'，
   只按 client_id 查会 .first() 命中别人的记录，于是删自己的东西被拒。
   这类串号是多租户系统最典型的坑，且只在数据积累后才暴露。
   ================================================================ */
export async function deleteMatch(_req: Request, env: Env, user: AuthedUser, clientId: string): Promise<Response> {
  const row = await env.DB
    .prepare('SELECT id, owner_id FROM matches WHERE owner_id = ? AND client_id = ?')
    .bind(user.id, clientId)
    .first<{ id: string; owner_id: string }>();

  if (!row) throw new NotFoundError('比赛记录', clientId);

  await env.DB
    .prepare('UPDATE matches SET deleted = 1, updated_at = ? WHERE id = ? AND owner_id = ?')
    .bind(Date.now(), row.id, user.id)
    .run();

  return json({ ok: true });
}
