import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
const origin = new URL(base).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('本測試會清除測試店家的訂單，只能連接本機 Wrangler。');
}
const password = process.env.TEST_ADMIN_PASSWORD;
if (!password) throw new Error('請設定 TEST_ADMIN_PASSWORD（僅用於本機測試）');

async function call(path, method = 'GET', data, cookie = '') {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: data ? JSON.stringify(data) : undefined
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}

const home = await fetch(base + '/');
assert.equal(home.status, 200);
assert.match(await home.text(), /作伙喝飲料/);

const alice = await call('/api/session');
const bob = await call('/api/session');
assert.equal(alice.status, 200);
assert.equal(bob.status, 200);
assert.notEqual(alice.data.userId, bob.data.userId);

const shopId = 'mrwish';
const order = { shopId, buyerName: '本機測試', drinkName: '不存在的飲料', size: 'L', cups: 1, sweetness: '無糖', ice: '去冰' };
assert.equal((await call('/api/orders', 'POST', order, alice.cookie)).status, 400);

const menu = await import('../public/menu_data.js');
const drink = menu.SHOPS_DATA[shopId].menu.find(item => item.prices?.L);
order.drinkName = drink.name;
order.price = 1; // 後端必須忽略瀏覽器給的價格。
assert.equal((await call('/api/orders', 'POST', order)).status, 401);
const created = await call('/api/orders', 'POST', order, alice.cookie);
assert.equal(created.status, 201);
const id = created.data.id;

const listed = await call('/api/orders?shopId=' + shopId);
const saved = listed.data.orders.find(item => item.id === id);
assert.ok(saved);
assert.equal(saved.price, drink.prices.L);
assert.equal((await call('/api/orders/' + id, 'DELETE', undefined, bob.cookie)).status, 404);
assert.equal((await call('/api/orders/' + id, 'DELETE', undefined, alice.cookie)).status, 200);

assert.equal((await call('/api/admin/login', 'POST', { password: 'wrong' })).status, 401);
const logged = await call('/api/admin/login', 'POST', { password });
assert.equal(logged.status, 200);
assert.equal((await call('/api/admin/status', 'GET', undefined, logged.cookie)).data.loggedIn, true);

const another = await call('/api/orders', 'POST', order, bob.cookie);
assert.equal(another.status, 201);
assert.equal((await call('/api/admin/clear', 'POST', { shopId }, logged.cookie)).status, 200);
assert.equal((await call('/api/orders?shopId=' + shopId)).data.orders.some(item => item.id === another.data.id), false);
assert.equal((await call('/api/admin/logout', 'POST', undefined, logged.cookie)).status, 200);

console.log('本機驗證通過：靜態頁面、獨立訪客、價格驗證、權限、主揪人登入與清除。');
