'use client';

import { useState } from 'react';

// Kotak ulasan: pilih bintang 1-5 + komentar. onSubmit(rating, comment) mengembalikan pesan error atau null.
export default function ReviewBox({ title, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (rating < 1) {
      setError('Pilih jumlah bintang dulu.');
      return;
    }
    setBusy(true);
    setError(null);
    const err = await onSubmit(rating, comment.trim());
    if (err) setError(err);
    setBusy(false);
  }

  return (
    <form className="review-box" onSubmit={submit}>
      <strong>{title}</strong>
      <div className="star-picker" role="radiogroup" aria-label="Penilaian">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} bintang`}
            className={n <= rating ? 'on' : ''}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        maxLength={500}
        placeholder="Tulis ulasan singkat (opsional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <div className="alert alert-error">{error}</div>}
      <button className="btn btn-navy btn-sm" type="submit" disabled={busy}>
        {busy ? 'Mengirim...' : 'Kirim ulasan'}
      </button>
    </form>
  );
}
