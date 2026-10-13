// Keranjang belanja: disimpan di browser (localStorage), tanpa akun.
// Satu keranjang hanya untuk satu toko karena satu pesanan = satu toko.
import { useEffect, useState } from 'react';

const KEY = 'umkm:cart:v1';
const EVENT = 'umkm:cart-changed';
const EMPTY = { store: null, items: [] };
export const MAX_QTY = 99;

export function readCart() {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const c = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (c && c.store?.id && Array.isArray(c.items) && c.items.length > 0) return c;
  } catch {
    // data rusak: anggap kosong
  }
  return EMPTY;
}

function save(cart) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cart.items.length ? cart : EMPTY));
  } catch {
    // penyimpanan penuh/dimatikan: abaikan
  }
  window.dispatchEvent(new Event(EVENT));
}

const clampQty = (q, stock) => {
  const n = Number.isFinite(q) ? Math.floor(q) : 1;
  const cap = stock == null ? MAX_QTY : Math.max(Math.min(stock, MAX_QTY), 1);
  return Math.max(1, Math.min(n, cap));
};

// item: { productId, name, price, image_path, stock }
export function addToCart(store, item, qty = 1, { replace = false } = {}) {
  let cart = readCart();
  if (cart.store && cart.store.id !== store.id) {
    if (!replace) return { ok: false, reason: 'other_store', currentStore: cart.store };
    cart = EMPTY;
  }
  const items = [...cart.items];
  const i = items.findIndex((x) => x.productId === item.productId);
  if (i >= 0) items[i] = { ...items[i], ...item, qty: clampQty(items[i].qty + qty, item.stock) };
  else items.push({ ...item, qty: clampQty(qty, item.stock) });

  save({
    store: { id: store.id, name: store.name, slug: store.slug, logo_url: store.logo_url || null },
    items,
  });
  return { ok: true };
}

export function setQty(productId, qty) {
  const cart = readCart();
  save({ ...cart, items: cart.items.map((x) => (x.productId === productId ? { ...x, qty: clampQty(qty, x.stock) } : x)) });
}

export function removeItem(productId) {
  const cart = readCart();
  save({ ...cart, items: cart.items.filter((x) => x.productId !== productId) });
}

export function clearCart() {
  save(EMPTY);
}

export const cartCount = (cart) => cart.items.reduce((s, x) => s + x.qty, 0);

// Mengembalikan { cart, ready }. `ready` false sampai browser selesai membaca penyimpanan
// (supaya tidak sempat berkedip "keranjang kosong").
export function useCart() {
  const [state, setState] = useState({ cart: EMPTY, ready: false });
  useEffect(() => {
    const sync = () => setState({ cart: readCart(), ready: true });
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return state;
}
