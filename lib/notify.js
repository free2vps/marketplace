// Isi pesan WhatsApp dan pengirimnya. Antrean ada di tabel notification_outbox.
const rupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const TEMPLATES = {
  new_order: (p) => `Pesanan baru #${p.order_code} dari ${p.buyer_name} senilai ${rupiah(p.total)}. Buka dashboard toko untuk memprosesnya.`,
  order_received: (p) => `Pesananmu #${p.order_code} di ${p.store} (${rupiah(p.total)}) sudah kami terima dan diteruskan ke toko.`,
  order_accepted: (p) => `${p.store} sudah menerima pesananmu #${p.order_code} dan sedang menyiapkannya.`,
  order_delivering: (p) => `Pesananmu #${p.order_code} dari ${p.store} sedang diantar. Siapkan ${rupiah(p.total)} jika bayar tunai.`,
  order_done: (p) => `Pesananmu #${p.order_code} selesai. Terima kasih! Beri ulasan di halaman pesananmu ya.`,
  order_cancelled: (p) => `Pesanan #${p.order_code} di ${p.store} dibatalkan.`,
};

export function renderMessage(template, payload) {
  const fn = TEMPLATES[template];
  return fn ? fn(payload || {}) : null;
}

export function toInternational(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('0') ? `62${d.slice(1)}` : d;
}

export const senderEnabled = () => Boolean(process.env.NOTIFY_WEBHOOK_URL);

// Pengirim generik: POST JSON {to, message} ke gateway pesan pilihanmu.
// Sesuaikan isi body/header dengan penyedia yang dipakai (mis. gateway WhatsApp lokal).
export async function sendWhatsapp(to, message) {
  const res = await fetch(process.env.NOTIFY_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.NOTIFY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` } : {}),
    },
    body: JSON.stringify({ to, message }),
  });
  if (!res.ok) throw new Error(`Gateway pesan membalas ${res.status}`);
}
