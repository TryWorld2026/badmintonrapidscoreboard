/* ================================================================
   routes/clubs.ts — 俱乐部与成员

   角色：owner（可解散/改名/设管理员）> admin（可管理球局）> member（只能报名）

   权限检查一律写进 SQL 的 WHERE 条件，不靠应用层"记得判断"。
   这类"忘了加 owner_id 过滤"的漏洞在多租户系统里最常见。
   ================================================================ */

import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../lib/errors';
import { json, readJson, type Env } from '../lib/http';
import { validate, schemas } from '../lib/validate';
import { newId } from '../lib/tokens';
import type { AuthedUser } from '../middleware/auth';

export interface ClubRow {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  created_at: number;
  updated_at: number;
}

export type Role = 'owner' | 'admin' | 'member';

/* ---------- 邀请码 ----------
   8 位 Crockford base32（去掉 I/L/O/U 这些容易读错/念错的字母）。
   用户是口头/微信传这个码的，所以「好念」比「短」重要。 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += CODE_ALPHABET[bytes[i] % 32];
  return s;
}

/** 查当前用户在某个俱乐部里的角色。不是成员返回 null。 */
export async function roleOf(env: Env, clubId: string, userId: string): Promise<Role | null> {
  const row = await env.DB
    .prepare('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?')
    .bind(clubId, userId)
    .first<{ role: Role }>();
  return row ? row.role : null;
}

/** 要求至少是某个角色。不满足直接抛 403。 */
export async function requireRole(
  env: Env, clubId: string, userId: string, allowed: Role[],
): Promise<Role> {
  const role = await roleOf(env, clubId, userId);
  if (!role) throw new ForbiddenError('你不是该俱乐部成员');
  if (!allowed.includes(role)) throw new ForbiddenError('当前角色无权执行此操作');
  return role;
}

/* ================================================================
   POST /api/clubs
   ================================================================ */
export async function createClub(req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const body = await readJson(req);
  const v = validate(schemas.clubCreate, body);
  if (!v.ok) throw new ValidationError(v.fields);

  const now = Date.now();
  const id = newId('c');

  /* 邀请码理论上会撞（32^8 ≈ 1.1 万亿，概率极低但非零）。
     重试几次，而不是把 500 抛给用户。 */
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    code = newInviteCode();
    const hit = await env.DB.prepare('SELECT id FROM clubs WHERE invite_code = ?').bind(code).first();
    if (!hit) break;
    code = '';
  }
  if (!code) throw new ConflictError('邀请码生成失败，请重试');

  /* 建俱乐部 + 把创建者设为 owner，必须一起成功。
     D1 的 batch() 是隐式事务，用它能保证不会出现"俱乐部建了但没人是 owner"。 */
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO clubs (id, name, invite_code, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, v.value.name, code, user.id, now, now),
    env.DB.prepare(
      `INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`,
    ).bind(id, user.id, now),
  ]);

  return json({
    club: { id, name: v.value.name, inviteCode: code, ownerId: user.id, role: 'owner', createdAt: now },
  }, 201);
}

/* ================================================================
   GET /api/clubs — 我加入的俱乐部
   ================================================================ */
export async function listClubs(_req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT c.*, m.role,
            (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id) AS member_count
     FROM clubs c
     JOIN club_members m ON m.club_id = c.id
     WHERE m.user_id = ?
     ORDER BY c.updated_at DESC`,
  ).bind(user.id).all<ClubRow & { role: Role; member_count: number }>();

  return json({
    items: (rows.results || []).map(r => ({
      id: r.id,
      name: r.name,
      inviteCode: r.invite_code,
      ownerId: r.owner_id,
      role: r.role,
      memberCount: r.member_count,
      createdAt: r.created_at,
    })),
  });
}

/* ================================================================
   POST /api/clubs/join — 用邀请码加入
   ================================================================ */
export async function joinClub(req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const body = await readJson(req);
  const v = validate(schemas.clubJoin, body);
  if (!v.ok) throw new ValidationError(v.fields);

  /* 邀请码统一大写、去掉空格：用户手抄时经常带上空格或小写 */
  const code = String(v.value.inviteCode).trim().toUpperCase().replace(/\s+/g, '');

  const club = await env.DB
    .prepare('SELECT * FROM clubs WHERE invite_code = ?')
    .bind(code)
    .first<ClubRow>();
  if (!club) throw new NotFoundError('邀请码无效');

  const existing = await roleOf(env, club.id, user.id);
  if (existing) {
    /* 已经是成员就返回成功而不是报错：用户重复点「加入」不该看到红色错误 */
    return json({
      club: { id: club.id, name: club.name, inviteCode: club.invite_code, ownerId: club.owner_id, role: existing, createdAt: club.created_at },
      alreadyMember: true,
    });
  }

  await env.DB
    .prepare(`INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`)
    .bind(club.id, user.id, Date.now())
    .run();

  return json({
    club: { id: club.id, name: club.name, inviteCode: club.invite_code, ownerId: club.owner_id, role: 'member', createdAt: club.created_at },
  }, 201);
}

/* ================================================================
   GET /api/clubs/:id/members
   ================================================================ */
export async function listMembers(_req: Request, env: Env, user: AuthedUser, clubId: string): Promise<Response> {
  /* 必须是成员才能看成员列表（不然邀请码泄露就能枚举用户） */
  await requireRole(env, clubId, user.id, ['owner', 'admin', 'member']);

  const rows = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.avatar_url, m.role, m.joined_at
     FROM club_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.club_id = ?
     ORDER BY
       CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
       m.joined_at ASC`,
  ).bind(clubId).all<{ id: string; display_name: string; avatar_url: string; role: Role; joined_at: number }>();

  return json({
    items: (rows.results || []).map(r => ({
      userId: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      role: r.role,
      joinedAt: r.joined_at,
    })),
  });
}

/* ================================================================
   PATCH /api/clubs/:id — 改名（owner/admin）
   ================================================================ */
export async function updateClub(req: Request, env: Env, user: AuthedUser, clubId: string): Promise<Response> {
  await requireRole(env, clubId, user.id, ['owner', 'admin']);

  const body = await readJson(req);
  const v = validate({ name: schemas.clubCreate.name }, body);
  if (!v.ok) throw new ValidationError(v.fields);

  await env.DB
    .prepare('UPDATE clubs SET name = ?, updated_at = ? WHERE id = ?')
    .bind(v.value.name, Date.now(), clubId)
    .run();

  return json({ ok: true });
}

/* ================================================================
   DELETE /api/clubs/:id/members/:userId — 移除成员（owner/admin）
   ================================================================ */
export async function removeMember(
  _req: Request, env: Env, user: AuthedUser, clubId: string, targetUserId: string,
): Promise<Response> {
  const myRole = await requireRole(env, clubId, user.id, ['owner', 'admin']);

  /* 不能移除 owner —— 否则俱乐部会变成没人能管理的孤儿 */
  const target = await roleOf(env, clubId, targetUserId);
  if (!target) throw new NotFoundError('该成员');
  if (target === 'owner') throw new ForbiddenError('不能移除俱乐部创建者');
  /* admin 不能移除其他 admin：只有 owner 能 */
  if (target === 'admin' && myRole !== 'owner') throw new ForbiddenError('只有创建者能移除管理员');

  await env.DB
    .prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?')
    .bind(clubId, targetUserId)
    .run();

  return json({ ok: true });
}
