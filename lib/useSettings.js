'use client';

// Pengaturan publik platform (saklar fitur, tarif) untuk komponen browser.
// Disimpan sebentar di browser supaya tidak mengambil ulang di setiap halaman.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { parseSettings } from './settings';

const KEY = 'umkm:settings:v2';
const TTL = 5 * 60 * 1000;
let mem = null;
let inflight = null;

export function clearSettingsCache() {
  mem = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // abaikan
  }
}

export async function getSettings() {
  if (mem && Date.now() - mem.t < TTL) return mem.v;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (Date.now() - o.t < TTL) {
        mem = o;
        return o.v;
      }
    }
  } catch {
    // abaikan
  }
  if (!inflight) {
    inflight = supabase
      .from('platform_settings')
      .select('key, value')
      .then(({ data }) => {
        const v = parseSettings(data);
        mem = { t: Date.now(), v };
        try {
          window.sessionStorage.setItem(KEY, JSON.stringify(mem));
        } catch {
          // abaikan
        }
        inflight = null;
        return v;
      });
  }
  return inflight;
}

// null = masih memuat
export function useSettings() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let live = true;
    getSettings().then((v) => live && setS(v));
    return () => {
      live = false;
    };
  }, []);
  return s;
}
