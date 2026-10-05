/* ================================================================
   lib/validate.ts — 零依赖的入参校验

   为什么不用 Zod：
     Zod 要进 Workers 打包产物（约 60 KB），而本项目只需要校验
     十来个字段类型。手写一个 200 行的校验器更小、更快、也更好读 ——
     对开源项目来说，「读者能一眼看懂」本身就是价值。

   设计：声明式 schema，返回 { ok, value } 或 { ok, fields }。
     绝不抛错 —— 调用方显式判断，避免"忘了 try"导致 500。
   ================================================================ */

export type FieldError = { path: string; message: string };

export type Validator<T> = (v: unknown, path: string) => { ok: true; value: T } | { ok: false; fields: FieldError[] };

/* ---------- 基础校验器 ---------- */

export function vStr(opts: { min?: number; max?: number; trim?: boolean; optional?: boolean; default?: string } = {}): Validator<string | undefined> {
  const { min = 0, max = 10000, trim = true, optional = false, default: def } = opts;
  return (v, path) => {
    if (v === undefined || v === null || v === '') {
      if (optional) return { ok: true, value: def };
      return { ok: false, fields: [{ path, message: '不能为空' }] };
    }
    if (typeof v !== 'string') {
      return { ok: false, fields: [{ path, message: '应为字符串' }] };
    }
    const s = trim ? v.trim() : v;
    if (s.length < min) return { ok: false, fields: [{ path, message: `至少 ${min} 个字符` }] };
    if (s.length > max) return { ok: false, fields: [{ path, message: `最多 ${max} 个字符` }] };
    return { ok: true, value: s };
  };
}

export function vEmail(): Validator<string> {
  /* 邮箱校验刻意宽松：过于严格的正则会拒掉合法地址
     （比如带 + 标签、新顶级域）。真正的验证是「发一封信看能不能收到」。
     这里只挡明显不是邮箱的输入。 */
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (v, path) => {
    if (typeof v !== 'string' || !v.trim()) {
      return { ok: false, fields: [{ path, message: '邮箱不能为空' }] };
    }
    const s = v.trim().toLowerCase();
    if (s.length > 254) return { ok: false, fields: [{ path, message: '邮箱过长' }] };
    if (!re.test(s)) return { ok: false, fields: [{ path, message: '邮箱格式不正确' }] };
    return { ok: true, value: s };
  };
}

export function vInt(opts: { min?: number; max?: number; optional?: boolean; default?: number } = {}): Validator<number | undefined> {
  const { min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, optional = false, default: def } = opts;
  return (v, path) => {
    if (v === undefined || v === null || v === '') {
      if (optional) return { ok: true, value: def };
      return { ok: false, fields: [{ path, message: '不能为空' }] };
    }
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n)) return { ok: false, fields: [{ path, message: '应为整数' }] };
    const i = Math.trunc(n);
    if (i < min) return { ok: false, fields: [{ path, message: `不能小于 ${min}` }] };
    if (i > max) return { ok: false, fields: [{ path, message: `不能大于 ${max}` }] };
    return { ok: true, value: i };
  };
}

export function vBool(opts: { optional?: boolean; default?: boolean } = {}): Validator<boolean | undefined> {
  const { optional = false, default: def } = opts;
  return (v, path) => {
    if (v === undefined || v === null) {
      if (optional) return { ok: true, value: def };
      return { ok: false, fields: [{ path, message: '不能为空' }] };
    }
    if (typeof v === 'boolean') return { ok: true, value: v };
    if (v === 'true' || v === 1 || v === '1') return { ok: true, value: true };
    if (v === 'false' || v === 0 || v === '0') return { ok: true, value: false };
    return { ok: false, fields: [{ path, message: '应为布尔值' }] };
  };
}

export function vEnum<T extends string>(allowed: readonly T[], opts: { optional?: boolean; default?: T } = {}): Validator<T | undefined> {
  const { optional = false, default: def } = opts;
  return (v, path) => {
    if (v === undefined || v === null || v === '') {
      if (optional) return { ok: true, value: def };
      return { ok: false, fields: [{ path, message: '不能为空' }] };
    }
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      return { ok: false, fields: [{ path, message: `只能是 ${allowed.join(' / ')} 之一` }] };
    }
    return { ok: true, value: v as T };
  };
}

export function vArray<T>(item: Validator<T>, opts: { max?: number; optional?: boolean } = {}): Validator<T[] | undefined> {
  const { max = 1000, optional = false } = opts;
  return (v, path) => {
    if (v === undefined || v === null) {
      if (optional) return { ok: true, value: undefined };
      return { ok: false, fields: [{ path, message: '不能为空' }] };
    }
    if (!Array.isArray(v)) return { ok: false, fields: [{ path, message: '应为数组' }] };
    if (v.length > max) return { ok: false, fields: [{ path, message: `最多 ${max} 项` }] };
    const out: T[] = [];
    const errs: FieldError[] = [];
    for (let i = 0; i < v.length; i++) {
      const r = item(v[i], `${path}[${i}]`);
      if (r.ok) out.push(r.value as T);
      else errs.push(...r.fields);
    }
    return errs.length ? { ok: false, fields: errs } : { ok: true, value: out };
  };
}

/* ---------- 对象 schema ----------
   S = 字段名 → 校验器。返回的 value 类型由校验器推断。
   刻意不追求完整类型推导（那需要大量条件类型体操），
   调用方显式标注返回类型即可 —— 可读性优先。 */
export type Schema = Record<string, Validator<unknown>>;

export function validate<S extends Schema>(
  schema: S,
  input: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; fields: FieldError[] } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, fields: [{ path: '(body)', message: '应为 JSON 对象' }] };
  }
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const errs: FieldError[] = [];

  for (const key of Object.keys(schema)) {
    const r = schema[key](src[key], key);
    if (r.ok) {
      /* undefined 且是可选字段就不写进结果，避免把 undefined 带进 SQL */
      if (r.value !== undefined) out[key] = r.value;
    } else {
      errs.push(...r.fields);
    }
  }
  return errs.length ? { ok: false, fields: errs } : { ok: true, value: out };
}

/* ---------- 常用 schema ---------- */
export const schemas = {
  register: {
    email: vEmail(),
    password: vStr({ min: 8, max: 200, trim: false }),
    displayName: vStr({ min: 1, max: 40, optional: true, default: '' }),
  },
  login: {
    email: vEmail(),
    password: vStr({ min: 1, max: 200, trim: false }),
  },
  clubCreate: {
    name: vStr({ min: 1, max: 40 }),
  },
  clubJoin: {
    inviteCode: vStr({ min: 4, max: 16 }),
  },
  sessionCreate: {
    clubId: vStr({ min: 1, max: 64, optional: true }),
    title: vStr({ max: 80, optional: true, default: '' }),
    startsAt: vInt({ min: 0, max: 4102444800000 }),   // 2100 年
    durationMin: vInt({ min: 15, max: 720, optional: true, default: 120 }),
    courtCount: vInt({ min: 1, max: 20, optional: true, default: 1 }),
    feeCents: vInt({ min: 0, max: 100_000_00, optional: true, default: 0 }),
  },
  matchUpsert: {
    clientId: vStr({ min: 1, max: 64 }),
    teamA: vStr({ max: 60, optional: true, default: '' }),
    teamB: vStr({ max: 60, optional: true, default: '' }),
    scoreA: vInt({ min: 0, max: 99, optional: true, default: 0 }),
    scoreB: vInt({ min: 0, max: 99, optional: true, default: 0 }),
    gamesA: vInt({ min: 0, max: 9, optional: true, default: 0 }),
    gamesB: vInt({ min: 0, max: 9, optional: true, default: 0 }),
    gameScores: vStr({ max: 200, optional: true, default: '' }),
    durationSec: vInt({ min: 0, max: 86400, optional: true, default: 0 }),
    mode: vStr({ max: 16, optional: true, default: '21' }),
    playedAt: vInt({ min: 0, max: 4102444800000 }),
    sessionId: vStr({ min: 1, max: 64, optional: true }),
    deleted: vBool({ optional: true, default: false }),
  },
} as const;
