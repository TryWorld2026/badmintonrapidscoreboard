/* ================================================================
   routes/sessions.ts — 球局（本产品的核心单位）

   「球局」= 一次活动：2 小时、6 个人、几块场地、AA 多少钱。
   不是「一场比赛」——那只是球局里的一个片段。

   本文件里最关键的是**候补自动递补**：
     满员后报名进候补队列；有人退出时，队列第一个自动转正。
     这个逻辑必须放在服务端事务里，否则两个设备同时退出会
     把同一个人递补两次（或者一个都不递补）。
   ================================================================ */

import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../lib/errors';
import { json, readJson, type Env } from '../lib/http';
import { validate, schemas, vStr } from '../lib/validate';
import { newId } from '../lib/tokens';
import type { AuthedUser } from '../middleware/auth';
import { roleOf } from './clubs';

export interface SessionRow {
  id: string;
  club_id: string | null;
  owner_id: string;
  title: string;
  starts_at: number;
  duration_min: number;
  court_count: number;
  fee_cents: number;
  status: 'open' | 'closed' | 'cancelled';
  created_at: number;
  updated_at: number;
}

export interface PlayerRow {
  id: string;
  session_id: string;
  user_id: string | null;
  guest_name: string;
  status: 'going' | 'waitlist' | 'out';
  queue_pos: number;
  joined_at: number;
  updated_at: number;
}

function toDto(s: SessionRow, extras: { goingCount?: number; waitlistCount?: number; myStatus?: string | null } = {}) {
  return {
    id: s.id,
    clubId: s.club_id,
    ownerId: s.owner_id,
    title: s.title,
    startsAt: s.starts_at,
    durationMin: s.duration_min,
    courtCount: s.court_count,
    feeCents: s.fee_cents,
    status: s.status,
    createdAt: s.created_at,
    goingCount: extras.goingCount ?? 0,
    waitlistCount: extras.waitlistCount ?? 0,
    myStatus: extras.myStatus ?? null,
  };
}

/* 满员判定：一块场地 4 人（双打）。这是羽毛球的常识默认值，
   不额外做成配置项——真实球局就是按 4 的倍数排的。 */
function capacityOf(s: SessionRow): number {
  return Math.max(1, s.court_count) * 4;
}

/* ================================================================
   POST /api/sessions
   ================================================================ */
export async function createSession(req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const body = await readJson(req);
  const v = validate(schemas.sessionCreate, body);
  if (!v.ok) throw new ValidationError(v.fields);

  const clubId = (v.value.clubId as string) || null;
  /* 挂了俱乐部就必须是成员，否则任何人都能往别人俱乐部里塞球局 */
  if (clubId) {
    const role = await roleOf(env, clubId, user.id);
    if (!role) throw new ForbiddenError('你不是该俱乐部成员');
  }

  const now = Date.now();
  const id = newId('s');
  const row: SessionRow = {
    id,
    club_id: clubId,
    owner_id: user.id,
    title: (v.value.title as string) || '',
    starts_at: v.value.startsAt as number,
    duration_min: (v.value.durationMin as number) ?? 120,
    court_count: (v.value.courtCount as number) ?? 1,
    fee_cents: (v.value.feeCents as number) ?? 0,
    status: 'open',
    created_at: now,
    updated_at: now,
  };

  await env.DB.prepare(
    `INSERT INTO sessions (id, club_id, owner_id, title, starts_at, duration_min,
                           court_count, fee_cents, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.id, row.club_id, row.owner_id, row.title, row.starts_at,
    row.duration_min, row.court_count, row.fee_cents, row.status,
    row.created_at, row.updated_at,
  ).run();

  /* 创建者自动报名（发起人当然是参加的） */
  await env.DB.prepare(
    `INSERT INTO session_players (id, session_id, user_id, guest_name, status, queue_pos, joined_at, updated_at)
     VALUES (?, ?, ?, '', 'going', 0, ?, ?)`,
  ).bind(newId('sp'), id, user.id, now, now).run();

  return json({ session: toDto(row, { goingCount: 1 }) }, 201);
}

/* ================================================================
   GET /api/sessions?clubId=&upcoming=1
   ================================================================ */
export async function listSessions(req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const url = new URL(req.url);
  const clubId = url.searchParams.get('clubId');
  const upcoming = url.searchParams.get('upcoming') === '1';

  /* 可见性：自己的球局 + 自己是成员的俱乐部里的球局。
     这条 SQL 就是权限边界，改它之前先想清楚会不会泄露别人的球局。 */
  let sql = `SELECT s.*,
      (SELECT COUNT(*) FROM session_players p WHERE p.session_id = s.id AND p.status = 'going') AS going_count,
      (SELECT COUNT(*) FROM session_players p WHERE p.session_id = s.id AND p.status = 'waitlist') AS waitlist_count,
      (SELECT p.status FROM session_players p WHERE p.session_id = s.id AND p.user_id = ?) AS my_status
    FROM sessions s
    WHERE (
      s.owner_id = ?
      OR s.club_id IN (SELECT club_id FROM club_members WHERE user_id = ?)
    )`;
  const binds: unknown[] = [user.id, user.id, user.id];

  if (clubId) {
    sql += ' AND s.club_id = ?';
    binds.push(clubId);
  }
  if (upcoming) {
    /* 未来的球局排前面，已过去的仍然返回（用户要回看） */
    sql += ' AND s.starts_at >= ?';
    binds.push(Date.now() - 6 * 3600 * 1000);
  }
  sql += ' ORDER BY s.starts_at DESC LIMIT 200';

  const rows = await env.DB.prepare(sql).bind(...binds).all<SessionRow & {
    going_count: number; waitlist_count: number; my_status: string | null;
  }>();

  return json({
    items: (rows.results || []).map(r => toDto(r, {
      goingCount: r.going_count,
      waitlistCount: r.waitlist_count,
      myStatus: r.my_status,
    })),
  });
}

/* ================================================================
   GET /api/sessions/:id — 详情（含参与者名单）
   ================================================================ */
export async function getSession(_req: Request, env: Env, user: AuthedUser, id: string): Promise<Response> {
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  if (!s) throw new NotFoundError('球局', id);

  /* 可见性检查：发起人，或俱乐部成员 */
  if (s.owner_id !== user.id) {
    if (!s.club_id) throw new ForbiddenError();
    const role = await roleOf(env, s.club_id, user.id);
    if (!role) throw new ForbiddenError('你不是该俱乐部成员');
  }

  const players = await env.DB.prepare(
    `SELECT p.*, u.display_name, u.avatar_url
     FROM session_players p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.session_id = ? AND p.status != 'out'
     ORDER BY
       CASE p.status WHEN 'going' THEN 0 ELSE 1 END,
       p.queue_pos ASC,
       p.joined_at ASC`,
  ).bind(id).all<PlayerRow & { display_name: string | null; avatar_url: string | null }>();

  const items = (players.results || []).map(p => ({
    id: p.id,
    userId: p.user_id,
    /* 没有账号的临时球友显示 guest_name */
    displayName: p.display_name || p.guest_name || '球友',
    avatarUrl: p.avatar_url || '',
    status: p.status,
    queuePos: p.queue_pos,
    joinedAt: p.joined_at,
  }));

  const going = items.filter(p => p.status === 'going');
  const waitlist = items.filter(p => p.status === 'waitlist');

  return json({
    session: toDto(s, {
      goingCount: going.length,
      waitlistCount: waitlist.length,
      myStatus: (items.find(p => p.userId === user.id) || {}).status ?? null,
    }),
    capacity: capacityOf(s),
    players: items,
  });
}

/* ================================================================
   POST /api/sessions/:id/join

   核心逻辑：**满员自动进候补**，不用用户自己选。
   这是真实痛点——球局群里喊「还差一个」的时代应该结束了。
   ================================================================ */
export async function joinSession(_req: Request, env: Env, user: AuthedUser, id: string): Promise<Response> {
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  if (!s) throw new NotFoundError('球局', id);
  if (s.status !== 'open') throw new ConflictError('该球局已关闭报名');
  if (s.owner_id !== user.id && s.club_id) {
    const role = await roleOf(env, s.club_id, user.id);
    if (!role) throw new ForbiddenError('你不是该俱乐部成员');
  }

  const existing = await env.DB
    .prepare('SELECT * FROM session_players WHERE session_id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<PlayerRow>();

  const now = Date.now();
  const goingCount = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM session_players WHERE session_id = ? AND status = 'going'`)
    .bind(id)
    .first<{ n: number }>();
  const isFull = (goingCount?.n ?? 0) >= capacityOf(s);
  const targetStatus: 'going' | 'waitlist' = isFull ? 'waitlist' : 'going';

  if (existing) {
    /* 已在名单里：把它改回目标状态（可能是从 out 重新报名，或从候补转正） */
    if (existing.status === targetStatus) {
      return json({ status: targetStatus, alreadyJoined: true });
    }
    await env.DB.prepare(
      `UPDATE session_players SET status = ?, queue_pos = ?, updated_at = ?
       WHERE session_id = ? AND user_id = ?`,
    ).bind(targetStatus, await nextQueuePos(env, id), now, id, user.id).run();
    return json({ status: targetStatus });
  }

  await env.DB.prepare(
    `INSERT INTO session_players (id, session_id, user_id, guest_name, status, queue_pos, joined_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?)`,
  ).bind(newId('sp'), id, user.id, targetStatus, await nextQueuePos(env, id), now, now).run();

  return json({ status: targetStatus, waitlisted: targetStatus === 'waitlist' }, 201);
}

async function nextQueuePos(env: Env, sessionId: string): Promise<number> {
  const r = await env.DB
    .prepare('SELECT COALESCE(MAX(queue_pos), 0) AS m FROM session_players WHERE session_id = ?')
    .bind(sessionId)
    .first<{ m: number }>();
  return (r?.m ?? 0) + 1;
}

/* ================================================================
   POST /api/sessions/:id/leave

   ⚠️ 这里是最容易出错的地方。
   有人退出时要把候补队列的第一个人递补上来。必须放在事务里：
   两个设备同时退出，若不原子，可能把同一个候补递补两次，
   或者一个都不递补（两人都以为对方会处理）。
   ================================================================ */
export async function leaveSession(_req: Request, env: Env, user: AuthedUser, id: string): Promise<Response> {
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  if (!s) throw new NotFoundError('球局', id);

  const me = await env.DB
    .prepare('SELECT * FROM session_players WHERE session_id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<PlayerRow>();
  if (!me || me.status === 'out') {
    return json({ status: 'out', alreadyLeft: true });
  }

  const wasGoing = me.status === 'going';
  const now = Date.now();

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE session_players SET status = 'out', updated_at = ? WHERE session_id = ? AND user_id = ?`,
    ).bind(now, id, user.id),
  ];

  /* 只有正选退出才需要递补（候补退出不影响正选名单） */
  let promoted: { userId: string | null; playerId: string } | null = null;
  if (wasGoing) {
    const next = await env.DB.prepare(
      `SELECT * FROM session_players
       WHERE session_id = ? AND status = 'waitlist'
       ORDER BY queue_pos ASC, joined_at ASC
       LIMIT 1`,
    ).bind(id).first<PlayerRow>();

    if (next) {
      promoted = { userId: next.user_id, playerId: next.id };
      stmts.push(
        env.DB.prepare(
          `UPDATE session_players SET status = 'going', queue_pos = 0, updated_at = ?
           WHERE id = ? AND status = 'waitlist'`,
        ).bind(now, next.id),
      );
    }
  }

  /* batch() 是隐式事务：退出 + 递补要么都成功，要么都不发生 */
  await env.DB.batch(stmts);

  return json({
    status: 'out',
    /* 客户端据此提示「已把 XX 递补为正选」 */
    promoted: promoted ? { userId: promoted.userId } : null,
  });
}

/* ================================================================
   POST /api/sessions/:id/players — 添加无账号的临时球友
   （球局里总有「今天临时来的朋友」，不能强制他们注册）
   ================================================================ */
export async function addGuest(req: Request, env: Env, user: AuthedUser, id: string): Promise<Response> {
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  if (!s) throw new NotFoundError('球局', id);

  /* 只有发起人或俱乐部管理员能代报名 */
  if (s.owner_id !== user.id) {
    if (!s.club_id) throw new ForbiddenError();
    const role = await roleOf(env, s.club_id, user.id);
    if (!role || role === 'member') throw new ForbiddenError('只有发起人或管理员可以代报名');
  }

  const body = await readJson(req);
  const v = validate({ guestName: vStr({ min: 1, max: 30 }) }, body);
  if (!v.ok) throw new ValidationError(v.fields);
  const name = v.value.guestName as string;

  const now = Date.now();
  const goingCount = await env.DB
    .prepare(`SELECT COUNT(*) AS n FROM session_players WHERE session_id = ? AND status = 'going'`)
    .bind(id)
    .first<{ n: number }>();
  const status: 'going' | 'waitlist' =
    (goingCount?.n ?? 0) >= capacityOf(s) ? 'waitlist' : 'going';

  const pid = newId('sp');
  await env.DB.prepare(
    `INSERT INTO session_players (id, session_id, user_id, guest_name, status, queue_pos, joined_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).bind(pid, id, name, status, await nextQueuePos(env, id), now, now).run();

  return json({ id: pid, displayName: name, status }, 201);
}

/* ================================================================
   GET /api/sessions/:id/rotation — 自动轮转排阵

   真实痛点：6 个人 2 块场地打 2 小时，谁该上场了？
   现在靠人喊，经常出现「某人连打 4 局」或「有人一直坐冷板凳」。

   算法（贪心 + 约束）：
     1. 上场次数最少的人优先
     2. 同次数时，休息时间最久的优先
     3. 尽量不与上一局搭档重复（避免总跟同一个人配）
   只排**下一轮**，不排整个赛程：球局是动态的，排太远一定会被现实打乱。
   ================================================================ */
export async function nextRotation(_req: Request, env: Env, _user: AuthedUser, id: string): Promise<Response> {
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first<SessionRow>();
  if (!s) throw new NotFoundError('球局', id);

  const players = await env.DB.prepare(
    `SELECT p.*, u.display_name FROM session_players p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.session_id = ? AND p.status = 'going'
     ORDER BY p.joined_at ASC`,
  ).bind(id).all<PlayerRow & { display_name: string | null }>();

  const roster = (players.results || []).map(p => ({
    id: p.id,
    name: p.display_name || p.guest_name || '球友',
  }));

  /* 该球局已打过的比赛：用来算上场次数与搭档历史 */
  const matches = await env.DB.prepare(
    `SELECT team_a, team_b, played_at FROM matches
     WHERE session_id = ? AND deleted = 0
     ORDER BY played_at ASC`,
  ).bind(id).all<{ team_a: string; team_b: string; played_at: number }>();

  const played = matches.results || [];
  const playCount = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  const partnerPairs = new Map<string, number>();

  const key = (a: string, b: string) => [a, b].sort().join('|');

  for (const m of played) {
    /* 队名可能是 "张三/李四" 这种组合，按已有约定拆开 */
    const sideA = String(m.team_a).split(/[\/、]/).map(x => x.trim()).filter(Boolean);
    const sideB = String(m.team_b).split(/[\/、]/).map(x => x.trim()).filter(Boolean);
    for (const n of [...sideA, ...sideB]) {
      playCount.set(n, (playCount.get(n) || 0) + 1);
      lastPlayed.set(n, Math.max(lastPlayed.get(n) || 0, m.played_at));
    }
    for (const side of [sideA, sideB]) {
      for (let i = 0; i < side.length; i++) {
        for (let j = i + 1; j < side.length; j++) {
          const k = key(side[i], side[j]);
          partnerPairs.set(k, (partnerPairs.get(k) || 0) + 1);
        }
      }
    }
  }

  const courtCount = Math.max(1, s.court_count);
  const need = courtCount * 4;   /* 双打：每场 4 人 */

  /* 排序：上场少的优先 → 休息久的优先 → 报名早的优先（稳定） */
  const sorted = roster.slice().sort((a, b) => {
    const ca = playCount.get(a.name) || 0;
    const cb = playCount.get(b.name) || 0;
    if (ca !== cb) return ca - cb;
    const la = lastPlayed.get(a.name) || 0;
    const lb = lastPlayed.get(b.name) || 0;
    if (la !== lb) return la - lb;
    return 0;
  });

  const playing = sorted.slice(0, need);
  const resting = sorted.slice(need);

  /* 组队：把 playing 按顺序四人一组，组内首尾配对
     （最强的配最弱的，避免一队碾压）——与现有 grouping.js 的 balanced 思路一致 */
  const courts: { court: number; teamA: string[]; teamB: string[] }[] = [];
  for (let c = 0; c < courtCount; c++) {
    const four = playing.slice(c * 4, c * 4 + 4);
    if (four.length < 4) break;
    courts.push({
      court: c + 1,
      teamA: [four[0].name, four[3].name],
      teamB: [four[1].name, four[2].name],
    });
  }

  return json({
    courts,
    resting: resting.map(p => p.name),
    /* 把统计一并返回，界面可以直接展示"为什么是他上场"——
       算法不透明的话，球友会觉得不公平。 */
    stats: roster.map(p => ({
      name: p.name,
      played: playCount.get(p.name) || 0,
      restingSince: lastPlayed.get(p.name) || null,
    })),
    totalMatchesRecorded: played.length,
  });
}
