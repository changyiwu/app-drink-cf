import { SHOPS_DATA } from '../public/menu_data.js';

const encoder = new TextEncoder();
const SWEETNESS = new Set(['無糖', '一分糖', '三分糖', '五分糖', '全糖']);
const ICE = new Set(['去冰', '微冰', '少冰', '正常冰', '熱飲']);
const OWNER_COOKIE = 'drink_owner';
const ADMIN_COOKIE = 'drink_admin';
const OWNER_AGE = 60 * 60 * 24 * 30;
const ADMIN_AGE = 60 * 60 * 8;

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}

function cookie(name, value, request, age) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
}

function hex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

async function owner(request, env) {
  const value = cookies(request)[OWNER_COOKIE] || '';
  const [id, signature] = value.split('.');
  if (!/^[0-9a-f]{48}$/.test(id || '') || !/^[0-9a-f]{64}$/.test(signature || '')) return null;
  return equal(signature, await hmac(id, env.SESSION_SECRET)) ? id : null;
}

async function admin(request, env) {
  const token = cookies(request)[ADMIN_COOKIE] || '';
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').bind(tokenHash).first();
  return !!row && row.expires_at > Date.now();
}

function mutationAllowed(request) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  return origin === new URL(request.url).origin && (!site || site === 'same-origin');
}

async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('請使用 JSON 格式');
  const raw = await request.text();
  if (raw.length > 4096) throw new Error('資料過大');
  return JSON.parse(raw);
}

function validOrder(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (typeof data.shopId !== 'string' || !Object.hasOwn(SHOPS_DATA, data.shopId)) return null;
  const shop = SHOPS_DATA[data.shopId];
  if (!shop || typeof data.buyerName !== 'string' || !data.buyerName.trim() || data.buyerName.trim().length > 40) return null;
  if (typeof data.drinkName !== 'string' || typeof data.size !== 'string') return null;
  const drink = shop.menu.find(item => item.name === data.drinkName);
  const price = drink?.prices?.[data.size];
  if (!Number.isInteger(price) || !Number.isInteger(data.cups) || data.cups < 1 || data.cups > 100) return null;
  if (!SWEETNESS.has(data.sweetness) || !ICE.has(data.ice)) return null;
  return { shop, price, buyerName: data.buyerName.trim() };
}

async function allowOrder(request, env, ownerId) {
  // 重用既有計數表；鍵值加前綴，與管理員登入失敗的計數分開。
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const keys = [
    { key: `order-ip:${await hmac(ip, env.SESSION_SECRET)}`, limit: 120 },
    { key: `order-owner:${await hmac(ownerId, env.SESSION_SECRET)}`, limit: 30 }
  ];
  const now = Date.now();
  for (const { key, limit } of keys) {
    await env.DB.prepare('INSERT INTO login_attempts (ip_hash, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts = CASE WHEN ? - window_start >= 900000 THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN ? - window_start >= 900000 THEN ? ELSE window_start END')
      .bind(key, now, now, now, now).run();
    const counter = await env.DB.prepare('SELECT attempts FROM login_attempts WHERE ip_hash = ?').bind(key).first();
    if (counter.attempts > limit) return false;
  }
  return true;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method !== 'GET' && !mutationAllowed(request)) return fail('來源驗證失敗', 403);

  if (path === '/api/session' && method === 'GET') {
    let id = await owner(request, env);
    const headers = {};
    if (!id) {
      id = hex(crypto.getRandomValues(new Uint8Array(24)));
      headers['Set-Cookie'] = cookie(OWNER_COOKIE, `${id}.${await hmac(id, env.SESSION_SECRET)}`, request, OWNER_AGE);
    }
    return json({ userId: id }, 200, headers);
  }

  if (path === '/api/orders' && method === 'GET') {
    const shopId = url.searchParams.get('shopId');
    if (!Object.hasOwn(SHOPS_DATA, shopId || '')) return fail('店家不存在', 404);
    const { results } = await env.DB.prepare('SELECT id, owner_id AS userId, shop_id AS shopId, shop_name AS shopName, buyer_name AS buyerName, drink_name AS drinkName, size, price, cups, sweetness, ice, created_at AS createdAt FROM orders WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1000').bind(shopId).all();
    return json({ orders: results });
  }

  if (path === '/api/admin/status' && method === 'GET') {
    return json({ loggedIn: await admin(request, env) });
  }

  if (path === '/api/orders' && method === 'POST') {
    const id = await owner(request, env);
    if (!id) return fail('請先重新載入頁面', 401);
    const data = await body(request);
    const valid = validOrder(data);
    if (!valid) return fail('訂單資料不正確');
    if (!await allowOrder(request, env, id)) return fail('送單太頻繁，請稍後再試', 429);
    const orderId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await env.DB.prepare('INSERT INTO orders (id, owner_id, shop_id, shop_name, buyer_name, drink_name, size, price, cups, sweetness, ice, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(orderId, id, data.shopId, valid.shop.name, valid.buyerName, data.drinkName, data.size, valid.price, data.cups, data.sweetness, data.ice, createdAt).run();
    return json({ id: orderId }, 201);
  }

  const orderMatch = path.match(/^\/api\/orders\/([0-9a-f-]{36})$/);
  if (orderMatch && method === 'DELETE') {
    const id = await owner(request, env);
    const isAdmin = await admin(request, env);
    if (!id && !isAdmin) return fail('沒有刪除權限', 403);
    const query = isAdmin
      ? env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(orderMatch[1])
      : env.DB.prepare('DELETE FROM orders WHERE id = ? AND owner_id = ?').bind(orderMatch[1], id);
    const result = await query.run();
    if (!result.meta.changes) return fail('訂單不存在或沒有刪除權限', 404);
    return json({ deleted: result.meta.changes });
  }

  if (path === '/api/admin/login' && method === 'POST') {
    const data = await body(request);
    if (typeof data.password !== 'string' || !data.password || data.password.length > 200) return fail('密碼格式不正確');
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const ipHash = await hmac(ip, env.SESSION_SECRET);
    const now = Date.now();
    const attempts = await env.DB.prepare('SELECT attempts, window_start FROM login_attempts WHERE ip_hash = ?').bind(ipHash).first();
    if (attempts && now - attempts.window_start < 15 * 60_000 && attempts.attempts >= 5) return fail('嘗試次數過多，請稍後再試', 429);
    if (!equal(await sha256(data.password), env.ADMIN_PASSWORD_HASH)) {
      await env.DB.prepare('INSERT INTO login_attempts (ip_hash, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET attempts = CASE WHEN ? - window_start >= 900000 THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN ? - window_start >= 900000 THEN ? ELSE window_start END').bind(ipHash, now, now, now, now).run();
      return fail('密碼錯誤', 401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ?').bind(ipHash).run();
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').bind(await sha256(token), now + ADMIN_AGE * 1000).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(ADMIN_COOKIE, token, request, ADMIN_AGE) });
  }

  if (path === '/api/admin/logout' && method === 'POST') {
    const token = cookies(request)[ADMIN_COOKIE] || '';
    if (/^[0-9a-f]{64}$/.test(token)) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(ADMIN_COOKIE, '', request, 0) });
  }

  if (path === '/api/admin/clear' && method === 'POST') {
    if (!await admin(request, env)) return fail('請重新登入主揪人', 403);
    const data = await body(request);
    if (!Object.hasOwn(SHOPS_DATA, data.shopId || '')) return fail('店家不存在', 404);
    const result = await env.DB.prepare('DELETE FROM orders WHERE shop_id = ?').bind(data.shopId).run();
    return json({ deleted: result.meta.changes });
  }

  return fail('找不到 API', 404);
}

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.DB || !env.SESSION_SECRET || !env.ADMIN_PASSWORD_HASH) return fail('服務尚未設定完成', 503);
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof SyntaxError || error.message === '資料過大' || error.message === '請使用 JSON 格式') return fail('資料格式不正確');
      console.error(error);
      return fail('伺服器處理失敗', 500);
    }
  }
};
