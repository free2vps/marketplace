// Lencana "Terverifikasi" untuk toko Premium
export default function VerifiedBadge({ store, size = 16 }) {
  if (!store?.verified_at) return null;
  return (
    <span className="store-verified" title="Toko terverifikasi" aria-label="Toko terverifikasi">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#1d6fdc" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
