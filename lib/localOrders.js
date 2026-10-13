// Pembeli tidak punya akun, jadi daftar pesanannya diingat di browser ini saja.
const KEY = 'umkm:orders:v1';
const BUYER = 'umkm:buyer:v1';

function read(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // abaikan
  }
}

export const listLocalOrders = () => read(KEY, []);

export function rememberOrder({ code, phone, storeName = '', total = 0 }) {
  const list = listLocalOrders().filter((o) => o.code !== code);
  list.unshift({ code, phone, storeName, total, savedAt: Date.now() });
  write(KEY, list.slice(0, 30));
}

export const phoneFor = (code) => listLocalOrders().find((o) => o.code === code)?.phone || '';

export const loadBuyer = () => read(BUYER, { name: '', phone: '', address: '' });
export const saveBuyer = (b) => write(BUYER, b);

// "0812-3456 7890" -> "081234567890"
export const normalizePhone = (s) => String(s || '').replace(/[^0-9+]/g, '');
