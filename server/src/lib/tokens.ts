/* ================================================================
   lib/tokens.ts — 访问令牌（JWT）与刷新令牌

   分工：
     access token  = 短效（15 分钟）JWT，无状态、不查库，放内存里
                     （前端不写 localStorage —— XSS 拿不到）
     refresh token = 长效（30 天）随机串，**落库且只存哈希**，
                     走 httpOnly + Secure + SameSite=Lax cookie

   为什么不用 JWT 做 refresh：
     JWT 无法撤销。用户点「登出所有设备」时，未过期的 JWT 依然有效。
     刷新令牌落库才能撤销，这是安全性的硬要求。

   为什么 refresh 要轮换（rotation）：
     每次刷新都发新令牌并作废旧令牌。如果旧令牌被再次使用，
     说明它被复制过 —— 此时撤销该用户全部令牌并强制重新登录。
   ================================================================ */

import { ConfigError, UnauthorizedError } from './errors';

export interface AccessClaims {
  sub: string;        // user id
  email: string;
  iat: number;
  exp: number;
}

const ACCESS_TTL_SEC = 15 * 60;          // 15 分钟
export const REFRESH_TTL_SEC = 30 * 24 * 3600;  // 30 天

/* ---------- base64url（JWT 用，不能用标准 base64：+ / = 在 URL 里有歧义）---------- */
function b64urlEncode(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let s = '';
  for (let i = 0; i < raw.length; i++) s += String.fromCharCode(raw[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToString(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/* 已知的占位符：这些都是「显而易见的假值」，必须拒绝。
   为什么要显式列出来：只判长度是不够的 —— server/.env.example 里那个
   占位符 `replace-me-with-a-random-string-of-at-least-32-chars`
   本身就超过 32 字符，会顺利通过长度检查。而 .env.example 的注释
   却写着「长度不足 32，启动时会被 lib/tokens.ts 拒绝」——
   文档承诺的安全行为其实并不成立。
   （真要在生产上用占位符当密钥，攻击者猜都不用猜。） */
const KNOWN_PLACEHOLDERS = [
  'replace-me-with-a-random-string-of-at-least-32-chars',
  'changeme', 'change-me', 'your-secret-here', 'secret', 'placeholder',
];

function requireSecret(secret: string | undefined): string {
  assertSecretUsable(secret);
  return secret as string;
}

/* 供 /ready 探活复用。
   刻意导出：健康检查若自己重写一遍校验，就会与真实校验漂移 ——
   实测过 /ready 只判长度，把占位符报成 auth: ok。 */
export function assertSecretUsable(secret: string | undefined): void {
  if (!secret || secret.length < 32) {
    /* 密钥太短等于没有签名。宁可启动失败，也不要带着弱密钥上线。 */
    throw new ConfigError('JWT_SECRET 未配置或长度不足 32 字符');
  }
  if (KNOWN_PLACEHOLDERS.indexOf(secret.trim().toLowerCase()) >= 0) {
    throw new ConfigError('JWT_SECRET 仍是示例里的占位符，请生成一个真正的随机串');
  }
}

/* ---------- 签发 ---------- */
export async function signAccessToken(
  user: { id: string; email: string },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const key = requireSecret(secret);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: AccessClaims = {
    sub: user.id,
    email: user.email,
    iat: nowSec,
    exp: nowSec + ACCESS_TTL_SEC,
  };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(key), new TextEncoder().encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

/* ---------- 校验 ----------
   必须自己验签名。把 payload 解出来直接用是常见且致命的错误：
   任何人都能伪造一个 sub 冒充他人。 */
export async function verifyAccessToken(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<AccessClaims> {
  const key = requireSecret(secret);
  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedError('令牌格式不正确');

  const [h, p, sig] = parts;
  let sigBytes: Uint8Array;
  try {
    const pad = sig.length % 4 === 0 ? '' : '='.repeat(4 - (sig.length % 4));
    const bin = atob(sig.replace(/-/g, '+').replace(/_/g, '/') + pad);
    sigBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) sigBytes[i] = bin.charCodeAt(i);
  } catch {
    throw new UnauthorizedError('令牌签名无法解析');
  }

  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(key),
    sigBytes as unknown as BufferSource,
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new UnauthorizedError('令牌签名校验失败');

  let claims: AccessClaims;
  try {
    claims = JSON.parse(b64urlDecodeToString(p));
  } catch {
    throw new UnauthorizedError('令牌内容无法解析');
  }

  if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
    throw new UnauthorizedError('令牌缺少用户标识');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
    throw new UnauthorizedError('登录已过期，请重新登录');
  }
  return claims;
}

/* ---------- 刷新令牌：随机串 + SHA-256 哈希 ----------
   刷新令牌是高熵随机值（256 位），不需要慢哈希 —— 暴力破解不可行。
   用 SHA-256 是为了"库泄露也拿不到原值"。 */
export function generateRefreshToken(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashRefreshToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return b64urlEncode(new Uint8Array(digest));
}

/* ---------- id 生成：ULID 风格 ----------
   为什么不用自增整数：客户端离线时也要能生成 id，且合并时不能撞车。
   为什么不用纯随机：按时间有序的 id 让 B-tree 索引写入更友好
   （随机 id 会导致索引页频繁分裂）。 */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  // Crockford base32（去掉易混的 I L O U）

export function newId(prefix = ''): string {
  const now = Date.now();
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = B32[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rand = crypto.getRandomValues(new Uint8Array(10));
  let r = '';
  for (let i = 0; i < rand.length; i++) r += B32[rand[i] % 32];
  return (prefix ? prefix + '_' : '') + time + r;
}
