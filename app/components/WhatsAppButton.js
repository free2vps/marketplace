'use client';

import { supabase } from '../../lib/supabase';
import { whatsappLink } from '../../lib/media';

// Tombol WhatsApp yang sekaligus mencatat klik untuk statistik toko Premium.
export default function WhatsAppButton({ phone, message = '', label = 'Chat WhatsApp', className = 'btn btn-gold', productId = null, slug = null, disabled = false }) {
  const base = whatsappLink(phone);
  if (!base) return null;

  function open() {
    supabase.rpc('track_whatsapp_click', { p_product: productId, p_slug: slug }).then(() => {});
    const text = typeof message === 'function' ? message(window.location.origin) : message;
    const url = text ? `${base}?text=${encodeURIComponent(text)}` : base;
    window.open(url, '_blank', 'noopener');
  }

  return (
    <button type="button" className={className} onClick={open} disabled={disabled}>
      {label}
    </button>
  );
}
