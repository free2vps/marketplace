'use client';

import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function TrackProductView({ id }) {
  useEffect(() => {
    try {
      const key = `pv:${id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // abaikan jika sessionStorage tidak tersedia
    }
    supabase.rpc('track_product_view', { p_id: id }).then(() => {});
  }, [id]);

  return null;
}
