'use client';

import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function TrackVisit({ slug }) {
  useEffect(() => {
    try {
      const key = `visit:${slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // abaikan jika sessionStorage tidak tersedia
    }
    supabase.rpc('track_store_visit', { p_slug: slug }).then(() => {});
  }, [slug]);

  return null;
}
