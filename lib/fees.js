// Perhitungan biaya. Aturannya SAMA dengan yang dipakai database (fungsi create_guest_order
// dan settle_order), jadi angka di layar = angka yang dibukukan.
//
// Catatan tarif: biaya QRIS (MDR) reguler yang ditetapkan BI adalah 0,7% dan ditanggung penjual/merchant.
// Gateway bisa menambah biaya penyelesaian (settlement) sendiri, jadi isi `qrisFlat` sesuai kontrak.

const round = (n) => Math.round(n);

export function commissionOf(goods, percent) {
  return round((goods * percent) / 100);
}

// Estimasi untuk toko saat mengisi harga produk
export function storeNetEstimate(price, commissionPercent) {
  const commission = commissionOf(price, commissionPercent);
  return { commission, net: price - commission };
}

// Rincian satu pesanan
export function orderBreakdown({
  goods,
  shipping = 0,
  commissionPercent = 0,
  serviceFee = 0,
  qrisPercent = 0.7,
  qrisFlat = 0,
  method = 'cod', // 'cod' | 'qris'
}) {
  const commission = commissionOf(goods, commissionPercent);
  const total = goods + shipping + serviceFee; // yang dibayar pembeli
  const gatewayFee = method === 'qris' ? Math.round(total * (qrisPercent / 100) + qrisFlat) : 0;
  return {
    goods,
    shipping,
    serviceFee,
    commission,
    total,
    gatewayFee,
    storeNet: goods - commission, // belum termasuk ongkir
    platformNet: commission + serviceFee - gatewayFee,
  };
}
