/* ================================================================
   lib/password.ts — 密码哈希（WebCrypto PBKDF2）

   为什么用 PBKDF2 而不是 argon2/bcrypt：
     Workers 运行时没有 Node 原生模块，argon2/bcrypt 都是原生扩展，
     要么跑不了，要么得打包 WASM（体积 + 冷启动都变差）。
     WebCrypto 的 PBKDF2 是运行时内置的，零依赖、零冷启动成本。

   安全参数（按 OWASP 2023 对 PBKDF2-HMAC-SHA256 的建议）：
     - 迭代次数 600,000
     - 每用户独立随机盐（16 字节）
   对比：单纯 SHA-256 加盐在 GPU 上每秒能试数十亿次，PBKDF2 把这个
   成本放大约 60 万倍，是"够用且能在 Workers 上跑"的折中。

   存储格式：pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
     带算法与参数前缀，将来升级迭代次数时能识别旧格式并平滑迁移
     （而不是让所有老用户无法登录）。
   ================================================================ */

const ALGO = 'PBKDF2';
const HASH = 'SHA-256';
const ITERATIONS = 600_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    ALGO,
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, salt: salt as unknown as BufferSource, iterations, hash: HASH },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** 常数时间比较：避免通过响应耗时逐字节猜出哈希。
 *  逐字节短路比较会让"前缀正确的猜测"稍快一点点，
 *  累积足够多次请求就能还原哈希。 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    return false;
  }
  const iterations = parseInt(parts[2], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[3]);
    expected = fromBase64(parts[4]);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** 密码强度下限。刻意不强制"必须含大写+数字"那类规则 ——
 *  它们促使用户用 P@ssw0rd1 这种可预测的变体。
 *  长度才是真正有效的约束。 */
export function checkPasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return '密码至少 8 位';
  }
  if (password.length > 200) {
    return '密码过长（最多 200 位）';
  }
  return null;
}
