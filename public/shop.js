import { SHOPS_DATA } from './menu_data.js';

// Parse Query Parameters
const urlParams = new URLSearchParams(window.location.search);
const shopId = urlParams.get('shop');

// Redirect if shopId is invalid
if (!shopId || !SHOPS_DATA[shopId]) {
  alert('請選擇有效的飲料店！');
  window.location.href = 'index.html';
}

const shopInfo = SHOPS_DATA[shopId];

// Dynamically set shop theme, title and page head title
document.body.classList.add(shopInfo.themeClass);
document.title = `作伙喝飲料！ - ${shopInfo.name}`;
document.getElementById('shop-title').textContent = shopInfo.name;
document.getElementById('shop-subtitle').textContent = `朋友同事專屬 · ${shopInfo.name} 即時訂單看板`;
document.getElementById('shop-menu-link').href = shopInfo.menuLink || '#';

// Fallback helper to get drink price for old orders
function getDrinkPrice(shop, drink, size = 'L') {
  const shopData = SHOPS_DATA[shop];
  if (!shopData) return 0;
  const item = shopData.menu.find(m => m.name === drink);
  if (!item) return 0;
  if (item.prices) {
    return item.prices[size] || item.prices['L'] || item.prices['M'] || 0;
  }
  return item.price || 0;
}

// Dynamically populate drink options
const drinkSelect = document.getElementById('drink-name');
const cupSizeSelect = document.getElementById('cup-size');

// 依 category 分組渲染。單一 select 在 50嵐 有 81 個選項，手機上很難找；
// 分成「找好茶／找奶茶／拿鐵系列…」後好用許多。
const menuByCategory = new Map();
shopInfo.menu.forEach(drink => {
  const category = drink.category || '其他';
  if (!menuByCategory.has(category)) menuByCategory.set(category, []);
  menuByCategory.get(category).push(drink);
});

menuByCategory.forEach((drinks, category) => {
  const group = document.createElement('optgroup');
  group.label = category;
  drinks.forEach(drink => {
    const option = document.createElement('option');
    option.value = drink.name;
    option.textContent = drink.name;
    group.appendChild(option);
  });
  drinkSelect.appendChild(group);
});

// Dynamic size options loading based on chosen drink
drinkSelect.addEventListener('change', () => {
  const selectedDrinkName = drinkSelect.value;
  const selectedDrink = shopInfo.menu.find(d => d.name === selectedDrinkName);
  
  // Clear old options
  cupSizeSelect.innerHTML = '<option value="" disabled selected>請選擇容量</option>';
  
  if (selectedDrink && selectedDrink.prices) {
    Object.keys(selectedDrink.prices).forEach(size => {
      const price = selectedDrink.prices[size];
      const option = document.createElement('option');
      option.value = size;
      option.setAttribute('data-price', price);
      const sizeLabel = size === 'L' ? '大杯 (L)' : '中杯 (M)';
      option.textContent = `${sizeLabel} - $${price}`;
      cupSizeSelect.appendChild(option);
    });
    
    // Auto-select size if there's only one option
    const sizeKeys = Object.keys(selectedDrink.prices);
    if (sizeKeys.length === 1) {
      cupSizeSelect.value = sizeKeys[0];
    }
  }
});

// Cloudflare Worker API 與 D1 訂單。
let myUid = null;
let isRefreshing = false;

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '連線失敗');
  return data;
}

async function refreshOrders() {
  if (isRefreshing || document.hidden) return;
  isRefreshing = true;
  try {
    const { orders } = await api('/api/orders?shopId=' + encodeURIComponent(shopId));
    renderBoard(orders);
  } catch (error) {
    console.error('訂單同步失敗', error);
    showToast('❌ 訂單同步失敗，請稍後再試', 'error');
  } finally { isRefreshing = false; }
}

async function initApi() {
  try {
    myUid = (await api('/api/session')).userId;
    setHostLoggedIn((await api('/api/admin/status')).loggedIn);
    await refreshOrders();
    setInterval(refreshOrders, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshOrders(); });
  } catch (error) {
    console.error('連線失敗', error);
    showToast('❌ 無法連接訂單服務，請重新載入', 'error');
  }
}

function isReady() { return !!myUid; }

// DOM Elements
const orderForm = document.getElementById('order-form');
const buyerNameInput = document.getElementById('buyer-name');
const cupCountInput = document.getElementById('cup-count');
const sweetnessSelect = document.getElementById('sweetness');
const iceLevelSelect = document.getElementById('ice-level');

const stepperMinusBtn = document.getElementById('stepper-minus');
const stepperPlusBtn = document.getElementById('stepper-plus');

const ordersList = document.getElementById('orders-list');
const emptyState = document.getElementById('empty-state');
const statPeople = document.getElementById('stat-people');
const statCups = document.getElementById('stat-cups');
const toast = document.getElementById('toast');
const summaryTableBody = document.getElementById('summary-table-body');
const paymentTableBody = document.getElementById('payment-table-body');
const clearAllBtn = document.getElementById('clear-all-btn');

// 主揪人專區
const hostLoginBtn = document.getElementById('host-login-btn');
const hostTools = document.getElementById('host-tools');
const hostLogoutBtn = document.getElementById('host-logout-btn');
const hostLoginModal = document.getElementById('host-login-modal');
const hostLoginClose = document.getElementById('host-login-close');
const hostLoginForm = document.getElementById('host-login-form');
const hostLoginSubmit = document.getElementById('host-login-submit');
const hostPasswordInput = document.getElementById('host-password');
const hostPasswordGroup = document.getElementById('host-password-group');
const hostLoginError = document.getElementById('host-login-error');

// Custom Cup Count Stepper Logic
stepperMinusBtn.addEventListener('click', () => {
  let val = parseInt(cupCountInput.value) || 1;
  if (val > 1) {
    cupCountInput.value = val - 1;
  }
});

stepperPlusBtn.addEventListener('click', () => {
  let val = parseInt(cupCountInput.value) || 1;
  if (val < 100) {
    cupCountInput.value = val + 1;
  }
});

cupCountInput.addEventListener('change', () => {
  let val = parseInt(cupCountInput.value);
  if (isNaN(val) || val < 1) {
    cupCountInput.value = 1;
  } else if (val > 100) {
    cupCountInput.value = 100;
  }
});

// Toast Notification System
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  
  if (window.toastTimeout) {
    clearTimeout(window.toastTimeout);
  }
  
  window.toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

// Form Validation and submission
orderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!isReady()) {
    showToast('❌ 尚未完成身份驗證，請稍後再試！', 'error');
    return;
  }
  
  let isValid = true;

  // Reset errors
  document.querySelectorAll('.input-group').forEach(grp => grp.classList.remove('invalid'));

  // 1. Name Check
  if (!buyerNameInput.value.trim()) {
    buyerNameInput.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 2. Drink Check
  if (!drinkSelect.value) {
    drinkSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 3. Cups Check
  const cups = parseInt(cupCountInput.value);
  if (isNaN(cups) || cups < 1) {
    cupCountInput.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 4. Sweetness Check
  if (!sweetnessSelect.value) {
    sweetnessSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 5. Ice Check
  if (!iceLevelSelect.value) {
    iceLevelSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  // 6. Size Check
  if (!cupSizeSelect.value) {
    cupSizeSelect.closest('.input-group').classList.add('invalid');
    isValid = false;
  }

  if (!isValid) {
    showToast('請填寫所有必要欄位喔！', 'error');
    return;
  }

  // Disable submit button during save
  const submitBtn = document.getElementById('submit-order-btn');
  submitBtn.disabled = true;
  submitBtn.querySelector('.btn-text').textContent = '送出中...';

  try {
    const size = cupSizeSelect.value;

    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ shopId, buyerName: buyerNameInput.value.trim(),
        drinkName: drinkSelect.value, size, cups,
        sweetness: sweetnessSelect.value, ice: iceLevelSelect.value })
    });
    await refreshOrders();

    showToast('🎉 訂單已成功送出！');

    // 手機上表單到看板約 1290px，不捲動的話看不到自己的訂單出現。
    // 尊重使用者的「減少動態效果」偏好設定。
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.board-section')?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });

    // Clear inputs (except name for convenience)
    drinkSelect.value = '';
    cupSizeSelect.innerHTML = '<option value="" disabled selected>請選擇容量</option>';
    cupCountInput.value = '1';
    sweetnessSelect.value = '';
    iceLevelSelect.value = '';
    
  } catch (error) {
    console.error('Error adding document: ', error);
    showToast('❌ 送出失敗，請再試一次！', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').textContent = '送出訂單';
  }
});

// Delete Order logic
async function deleteOrder(id, buyerName, isOwnOrder) {
  const question = isOwnOrder
    ? `確定要刪除 ${buyerName} 的訂單嗎？`
    : `你正以主揪人身份刪除「${buyerName}」的訂單，確定嗎？`;
  if (confirm(question)) {
    try {
      await api('/api/orders/' + encodeURIComponent(id), { method: 'DELETE' });
      await refreshOrders();
      showToast('🗑️ 訂單已成功刪除');
    } catch (error) {
      console.error('Error deleting document: ', error);
      showToast('❌ 刪除失敗，請再試一次', 'error');
    }
  }
}

// 主揪人登入由 Worker 驗證，登入憑證存在 HttpOnly Cookie。
let isHostLoggedIn = false;

// renderBoard 收到的最後一批訂單。登入狀態一變，刪除鈕的顯示條件就跟著變，
// 但資料沒變——重畫一次即可，不必等下一次 snapshot。
let lastOrders = [];

function openHostLoginModal() {
  hostPasswordInput.value = '';
  hostPasswordGroup.classList.remove('invalid');
  hostLoginModal.classList.remove('hidden');
  hostPasswordInput.focus();
}

function closeHostLoginModal() {
  hostLoginModal.classList.add('hidden');
  hostPasswordInput.value = '';
  hostPasswordGroup.classList.remove('invalid');
}

function setHostLoggedIn(loggedIn) {
  isHostLoggedIn = loggedIn;
  hostLoginBtn.classList.toggle('hidden', loggedIn);
  hostTools.classList.toggle('hidden', !loggedIn);
  // 重畫看板：登入後每一列都要出現刪除鈕，登出後只留自己的
  renderBoard(lastOrders);
}

function showHostLoginError(message) {
  hostLoginError.textContent = message;
  hostPasswordGroup.classList.add('invalid');
}

async function verifyHostPassword(password) {
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
    return true;
  } catch (error) {
    if (error.message === '密碼錯誤') return false;
    throw error;
  }
}

hostLoginBtn.addEventListener('click', () => {
  if (!isReady()) {
    showToast('❌ 尚未完成身份驗證，請稍後再試！', 'error');
    return;
  }
  openHostLoginModal();
});

hostLoginClose.addEventListener('click', closeHostLoginModal);

// 點遮罩空白處關閉；點卡片內部不關
hostLoginModal.addEventListener('click', (e) => {
  if (e.target === hostLoginModal) closeHostLoginModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !hostLoginModal.classList.contains('hidden')) {
    closeHostLoginModal();
  }
});

hostLoginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!isReady()) {
    showToast('❌ 尚未完成身份驗證，請稍後再試！', 'error');
    return;
  }

  const password = hostPasswordInput.value.trim();
  if (!password) {
    showHostLoginError('請輸入密碼');
    return;
  }

  hostLoginSubmit.disabled = true;
  hostLoginSubmit.querySelector('.btn-text').textContent = '驗證中...';

  try {
    const ok = await verifyHostPassword(password);
    if (ok) {
      setHostLoggedIn(true);
      closeHostLoginModal();
      showToast('🔓 主揪人已登入');
    } else {
      showHostLoginError('密碼錯誤，請再試一次');
      hostPasswordInput.select();
    }
  } catch (error) {
    console.error('Host login failed: ', error);
    showHostLoginError('登入失敗，請稍後再試');
  } finally {
    hostLoginSubmit.disabled = false;
    hostLoginSubmit.querySelector('.btn-text').textContent = '登入';
  }
});

async function hostLogout() {
  await api('/api/admin/logout', { method: 'POST' });
  setHostLoggedIn(false);
}

hostLogoutBtn.addEventListener('click', async () => {
  try {
    await hostLogout();
    showToast('👋 已登出主揪人');
  } catch (error) {
    console.error('登出失敗', error);
    showToast('❌ 登出失敗，請再試一次', 'error');
  }
});

// Clear All Shop Orders logic（只有登入後才看得到這顆按鈕）
clearAllBtn.addEventListener('click', async () => {
  if (!isReady() || !isHostLoggedIn) {
    showToast('❌ 請先以主揪人身份登入！', 'error');
    return;
  }

  if (!confirm(`⚠️ 警告：此動作將清除所有《${shopInfo.name}》的訂單，且無法復原！\n確定要繼續嗎？`)) {
    return;
  }

  clearAllBtn.disabled = true;
  clearAllBtn.querySelector('span').textContent = '清除中...';

  try {
    const { deleted } = await api('/api/admin/clear', {
      method: 'POST', body: JSON.stringify({ shopId })
    });
    await refreshOrders();
    showToast(deleted ? '🗑️ 已成功清除所有《' + shopInfo.name + '》的訂單！' : '目前沒有可清除的訂單');
  } catch (error) {
    console.error('Error clearing documents: ', error);
    showToast('❌ 清除失敗，請重新登入後再試一次！', 'error');
  } finally {
    clearAllBtn.disabled = false;
    clearAllBtn.querySelector('span').textContent = '清除本頁全部訂單';
  }
});

// 看板渲染的唯一入口。參數是單純的訂單物件陣列（`{ id, ...欄位 }`），不依賴
// API 回傳單純的訂單物件陣列，渲染不依賴資料庫實作。
function renderBoard(orders) {
  // 留一份最新資料，登入／登出切換刪除鈕時不必等下一次 snapshot
  lastOrders = orders;

  // Clear loading state or current list
  ordersList.innerHTML = '';
  summaryTableBody.innerHTML = '';
  paymentTableBody.innerHTML = '';

  if (orders.length === 0) {
    emptyState.classList.remove('hidden');
    statPeople.textContent = '0';
    statCups.textContent = '0';
    
    // Empty stats table
    summaryTableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted);">無統計資料</td>
      </tr>
    `;
    
    // Empty payments table
    paymentTableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted);">無統計資料</td>
      </tr>
    `;
    return;
  }
  
  emptyState.classList.add('hidden');
  
  let totalCups = 0;
  let totalMoney = 0;
  const uniqueNames = new Set();
  const summaryMap = {};
  const paymentMap = {};
  
  // Sort client-side to avoid requiring a composite index
  orders.sort((a, b) => {
    const timeA = a.createdAt ? (a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime()) : 0;
    const timeB = b.createdAt ? (b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime()) : 0;
    return timeB - timeA;
  });
  
  orders.forEach((order) => {
    const id = order.id;
    const cups = parseInt(order.cups) || 1;
    const drinkName = order.drinkName || '未填寫';
    const size = order.size || 'L';
    const price = parseInt(order.price) || getDrinkPrice(shopId, drinkName, size);
    const subtotal = price * cups;
    
    totalCups += cups;
    totalMoney += subtotal;
    
    if (order.buyerName) {
      uniqueNames.add(order.buyerName.trim());
    }
    
    // Grouping for Drink Summary Table (By Item + Size + Sweetness + Ice)
    const sweetness = order.sweetness || '未選';
    const ice = order.ice || '未選';
    const specKey = `${drinkName} (${size}) (${sweetness}/${ice})`;
    
    if (!summaryMap[specKey]) {
      summaryMap[specKey] = {
        drinkName: drinkName,
        size: size,
        price: price,
        specs: `${sweetness} / ${ice}`,
        cups: 0,
        total: 0
      };
    }
    summaryMap[specKey].cups += cups;
    summaryMap[specKey].total += subtotal;
    
    // Grouping for Personal Payment Table
    const buyer = order.buyerName ? order.buyerName.trim() : '無名氏';
    if (!paymentMap[buyer]) {
      paymentMap[buyer] = {
        buyer: buyer,
        items: [],
        total: 0
      };
    }
    const sizeLabelBrief = size === 'L' ? '大' : '中';
    paymentMap[buyer].items.push(`${drinkName} (${sizeLabelBrief} · $${price}) x${cups}`);
    paymentMap[buyer].total += subtotal;
    
    // Safe output escaping
    const buyerName = escapeHtml(buyer);
    const displayDrink = escapeHtml(drinkName);
    const displaySweetness = escapeHtml(sweetness);
    const displayIce = escapeHtml(ice);
    const sizeLabel = size === 'L' ? '大杯' : '中杯';

    // Check if the order belongs to the current user
    const isOwnOrder = !!(myUid && order.userId === myUid);
    // 主揪人登入後可刪任何人的訂單；規則層的 isAdmin() 是同一條授權來源
    const canDelete = isOwnOrder || isHostLoggedIn;

    // 不使用 inline onclick：屬性值會先經過 HTML 實體解碼，escapeHtml 產生的 &#39;
    // 會還原成單引號而逃脫 JS 字串，改用 addEventListener 從根本避免
    const deleteButtonHtml = canDelete ? `
      <button class="delete-order-btn" type="button" title="${isOwnOrder ? '刪除此訂單' : '以主揪人身份刪除此訂單'}">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    ` : '';

    // Create list row element
    const orderRow = document.createElement('div');
    orderRow.className = 'order-row';

    orderRow.innerHTML = `
      <div class="col-name">${buyerName}</div>
      <div class="col-drink">
        ${displayDrink} (${sizeLabel} · $${price})
      </div>
      <div class="col-specs">
        <div class="badge-wrapper">
          <span class="badge badge-sweetness">${displaySweetness}</span>
          <span class="badge badge-ice">${displayIce}</span>
        </div>
      </div>
      <div class="col-cups">
        <span class="badge-cups">${cups} 杯</span>
        <span style="font-size: 0.8rem; display: block; margin-top: 4px; font-weight: 700; color: var(--primary-color);">$${subtotal}</span>
      </div>
      <div class="col-action">
        ${deleteButtonHtml}
      </div>
    `;

    if (canDelete) {
      orderRow
        .querySelector('.delete-order-btn')
        .addEventListener('click', () => deleteOrder(id, buyer, isOwnOrder));
    }

    ordersList.appendChild(orderRow);
  });
  
  // Render consolidated summary table
  const sortedKeys = Object.keys(summaryMap).sort((a, b) => a.localeCompare(b));
  sortedKeys.forEach(key => {
    const item = summaryMap[key];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(item.drinkName)}</td>
      <td><span class="badge badge-sweetness">${item.size === 'L' ? '大杯 (L) - $' + item.price : '中杯 (M) - $' + item.price}</span> / ${escapeHtml(item.specs)}</td>
      <td style="text-align: center; font-weight: 700;">${item.cups} 杯</td>
      <td style="text-align: center; font-weight: 700; color: var(--primary-color);">$${item.total}</td>
    `;
    summaryTableBody.appendChild(tr);
  });
  
  // Add total row to summary table
  const totalTr = document.createElement('tr');
  totalTr.className = 'summary-row-total';
  totalTr.innerHTML = `
    <td colspan="2" style="text-align: right;">總計：</td>
    <td style="text-align: center;">${totalCups} 杯</td>
    <td style="text-align: center;">$${totalMoney}</td>
  `;
  summaryTableBody.appendChild(totalTr);
  
  // Render Personal Payment Table
  const sortedBuyers = Object.keys(paymentMap).sort((a, b) => a.localeCompare(b));
  sortedBuyers.forEach(buyer => {
    const info = paymentMap[buyer];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--accent-color);">${escapeHtml(info.buyer)}</td>
      <td style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.4;">${escapeHtml(info.items.join('、'))}</td>
      <td style="text-align: center; font-weight: 800; color: var(--primary-color);">$${info.total}</td>
    `;
    paymentTableBody.appendChild(tr);
  });
  
  // Update dashboard stats
  statPeople.textContent = uniqueNames.size;
  statCups.textContent = totalCups;
}

// Escape HTML utility function for security
function escapeHtml(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

initApi();
