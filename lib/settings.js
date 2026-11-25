// Membaca pengaturan publik platform (saklar fitur dan tarif) dari tabel platform_settings.
export function parseSettings(rows = []) {
  const m = Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
  const num = (k, d) => (m[k] == null || Number.isNaN(Number(m[k])) ? d : Number(m[k]));
  return {
    commissionOn: m['feature.commission'] === true,
    onlinePaymentOn: m['feature.online_payment'] === true,
    walletOn: m['feature.wallet'] === true,
    courierOn: m['feature.courier'] === true,
    commissionPercent: num('fee.commission_percent', 0),
    serviceFee: num('fee.service_fee', 0),
    payoutMin: num('payout.min_amount', 20000),
    // Fase 1: paket & pembayaran manual
    webOrdersOn: m['feature.web_orders'] === true,
    freeProductLimit: num('plan.free_product_limit', 10),
    premiumPriceMonth: num('plan.premium_price_month', 25000),
    bank: {
      name: typeof m['payment.bank_name'] === 'string' ? m['payment.bank_name'] : '',
      number: typeof m['payment.account_number'] === 'string' ? m['payment.account_number'] : '',
      holder: typeof m['payment.account_holder'] === 'string' ? m['payment.account_holder'] : '',
    },
    // Fase 2: ongkir
    shippingMode: m['shipping.mode'] === 'distance' ? 'distance' : 'flat',
    digitalDiscount: num('shipping.digital_discount', 0),
  };
}

export async function loadSettings(supabase) {
  const { data } = await supabase.from('platform_settings').select('key, value');
  return parseSettings(data);
}
