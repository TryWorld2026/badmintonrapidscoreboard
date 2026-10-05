/* ================================================================
   routes/auth.ts — 注册 / 登录 / 刷新 / 登出

   令牌策略（详见 lib/tokens.ts 的注释）：
     access  → 15 分钟 JWT，放在响应体里，前端存内存
     refresh → 30 天随机串，走 httpOnly cookie，库里只存哈希

   为什么 refresh 要用 cookie 而不是响应体：
     放响应体就得让前端存起来，能存的地方只有 localStorage（XSS 可读）
     或内存（刷新即丢）。httpOnly cookie 是唯一「JS 读不到但浏览器会自动带」
     的存储，是刷新令牌的标准做法。
   ================================================================ */

import { ValidationError, UnauthorizedError, ConflictError, NotFoundError } from '../lib/errors';
import { hashPassword, verifyPassword, checkPasswordStrength } from '../lib/password';
import {
  signAccessToken, generateRefreshToken, hashRefreshToken, newId, REFRESH_TTL_SEC,
} from '../lib/tokens';
import { json, readJson, type Env } from '../lib/http';
import { validate, schemas } from '../lib/validate';
import { checkRate, clientIp, ruleFor, type AuthedUser } from '../middleware/auth';
import { RateLimitError } from '../lib/errors';

const REFRESH_COOKIE = 'bm_refresh';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  avatar_url: string;
  created_at: number;
}

/* ---------- cookie 工具 ----------
   SameSite=Lax 而不是 Strict：Strict 会让用户从外部链接点进来时
   不带 cookie，表现为「刚登录完又变成未登录」。
   Lax 在顶层导航时仍会发送，且能挡住跨站 POST 的 CSRF。 */
function setRefreshCookie(token: string, env: Env): string {
  const secure = (env.ENVIRONMENT || 'production') !== 'development';
  const parts = [
    `${REFRESH_COOKIE}=${token}`,
    'Path=/api/auth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${REFRESH_TTL_SEC}`,
  ];
  /* 本地 http 开发时不能加 Secure，否则浏览器不保存 cookie */
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearRefreshCookie(env: Env): string {
  const secure = (env.ENVIRONMENT || 'production') !== 'development';
  const parts = [
    `${REFRESH_COOKIE}=`,
    'Path=/api/auth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function readRefreshCookie(req: Request): string | null {
  const raw = req.headers.get('cookie') || '';
  const m = new RegExp(`(?:^|;\\s*)${REFRESH_COOKIE}=([^;]+)`).exec(raw);
  return m ? decodeURIComponent(m[1]) : null;
}

function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at,
  };
}

/* ---------- 发一对新令牌 ---------- */
async function issueTokens(
  env: Env,
  user: UserRow,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = await signAccessToken({ id: user.id, email: user.email }, env.JWT_SECRET);
  const refreshToken = generateRefreshToken();
  const now = Date.now();
  const hash = await hashRefreshToken(refreshToken);

  await env.DB.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(newId('rt'), user.id, hash, now + REFRESH_TTL_SEC * 1000, now).run();

  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}

/* ================================================================
   POST /api/auth/register
   ================================================================ */
export async function register(req: Request, env: Env): Promise<Response> {
  const ip = clientIp(req);
  const rl = await checkRate(env, 'register', ip, ruleFor(env, 'register'));
  if (!rl.allowed) throw new RateLimitError(rl.retryAfterSec);

  const body = await readJson(req);
  const v = validate(schemas.register, body);
  if (!v.ok) throw new ValidationError(v.fields);

  const email = v.value.email as string;
  const password = v.value.password as string;
  const displayName = (v.value.displayName as string) || email.split('@')[0];

  const pwErr = checkPasswordStrength(password);
  if (pwErr) throw new ValidationError([{ path: 'password', message: pwErr }]);

  /* 先查重再插入。D1 的唯一索引也会挡，但那样错误信息对用户不友好
     （会暴露"这个邮箱存在"以外的东西）。这里主动查一次，给出明确提示。 */
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    /* 注意：这会暴露「该邮箱已注册」。
       对羽毛球小工具来说，可用性 > 防枚举；换成模糊提示会让用户
       反复试错。如果将来要做更严格的隐私保护，这里应改成
       「已发送验证邮件」的统一话术。 */
    throw new ConflictError('该邮箱已注册，请直接登录');
  }

  const now = Date.now();
  const id = newId('u');
  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', ?, ?)`,
    ).bind(id, email, passwordHash, displayName, now, now).run();
  } catch (e) {
    /* 并发注册同一邮箱时唯一索引会抛错，转成 409 */
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE|unique/i.test(msg)) throw new ConflictError('该邮箱已注册，请直接登录');
    throw e;
  }

  const user: UserRow = {
    id, email, password_hash: passwordHash,
    display_name: displayName, avatar_url: '', created_at: now,
  };
  const tokens = await issueTokens(env, user);

  return json(
    { user: publicUser(user), accessToken: tokens.accessToken, expiresIn: tokens.expiresIn },
    201,
    { 'Set-Cookie': setRefreshCookie(tokens.refreshToken, env) },
  );
}

/* ================================================================
   POST /api/auth/login
   ================================================================ */
export async function login(req: Request, env: Env): Promise<Response> {
  const ip = clientIp(req);
  const body = await readJson(req);
  const v = validate(schemas.login, body);
  if (!v.ok) throw new ValidationError(v.fields);

  const email = v.value.email as string;
  const password = v.value.password as string;

  /* 两层限流：按 IP 挡单机高频，按账号挡分布式撞库 */
  const rlIp = await checkRate(env, 'login:ip', ip, ruleFor(env, 'login'));
  if (!rlIp.allowed) throw new RateLimitError(rlIp.retryAfterSec);
  const rlUser = await checkRate(env, 'login:user', email, ruleFor(env, 'login'));
  if (!rlUser.allowed) throw new RateLimitError(rlUser.retryAfterSec);

  const user = await env.DB
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>();

  /* 用户不存在时也要跑一次哈希校验：否则「不存在」会比「密码错」
     快得多，攻击者能据此枚举出哪些邮箱已注册。
     这里用固定成本的方式——对不存在的用户也验一个假哈希。 */
  const DUMMY = 'pbkdf2$sha256$600000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const hash = user ? user.password_hash : DUMMY;
  const ok = await verifyPassword(password, hash);

  if (!user || !ok) {
    throw new UnauthorizedError('邮箱或密码不正确');
  }

  const tokens = await issueTokens(env, user);
  return json(
    { user: publicUser(user), accessToken: tokens.accessToken, expiresIn: tokens.expiresIn },
    200,
    { 'Set-Cookie': setRefreshCookie(tokens.refreshToken, env) },
  );
}

/* ================================================================
   POST /api/auth/refresh

   轮换策略：每次刷新作废旧令牌、发新令牌。
   如果「已撤销的令牌」被再次使用，说明它被复制过 ——
   此时撤销该用户全部令牌，强制重新登录（这是标准的 refresh token
   reuse detection，能有效止损被盗令牌）。
   ================================================================ */
export async function refresh(req: Request, env: Env): Promise<Response> {
  const token = readRefreshCookie(req);
  if (!token) throw new UnauthorizedError('缺少刷新令牌，请重新登录');

  const ip = clientIp(req);
  const rl = await checkRate(env, 'refresh', ip, ruleFor(env, 'refresh'));
  if (!rl.allowed) throw new RateLimitError(rl.retryAfterSec);

  const hash = await hashRefreshToken(token);
  const row = await env.DB
    .prepare('SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = ?')
    .bind(hash)
    .first<{ id: string; user_id: string; revoked_at: number | null; expires_at: number }>();

  if (!row) throw new UnauthorizedError('刷新令牌无效，请重新登录');

  if (row.revoked_at) {
    /* 复用检测命中：把这个用户的所有令牌全部撤销 */
    await env.DB
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .bind(Date.now(), row.user_id)
      .run();
    throw new UnauthorizedError('登录状态异常，请重新登录');
  }

  if (row.expires_at <= Date.now()) {
    throw new UnauthorizedError('登录已过期，请重新登录');
  }

  const user = await env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(row.user_id)
    .first<UserRow>();
  if (!user) throw new UnauthorizedError('账号不存在');

  /* 作废旧令牌 */
  await env.DB
    .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?')
    .bind(Date.now(), row.id)
    .run();

  const tokens = await issueTokens(env, user);
  return json(
    { user: publicUser(user), accessToken: tokens.accessToken, expiresIn: tokens.expiresIn },
    200,
    { 'Set-Cookie': setRefreshCookie(tokens.refreshToken, env) },
  );
}

/* ================================================================
   POST /api/auth/logout
   ================================================================ */
export async function logout(req: Request, env: Env): Promise<Response> {
  const token = readRefreshCookie(req);
  if (token) {
    const hash = await hashRefreshToken(token);
    await env.DB
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(Date.now(), hash)
      .run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearRefreshCookie(env) });
}

/* ================================================================
   GET /api/auth/me
   ================================================================ */
export async function me(_req: Request, env: Env, user: AuthedUser): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  if (!row) throw new NotFoundError('账号');
  return json({ user: publicUser(row) });
}
