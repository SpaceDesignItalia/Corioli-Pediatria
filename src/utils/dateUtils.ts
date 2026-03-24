/**
 * Converte una data di visita (YYYY-MM-DD o ISO) in millisecondi a **mezzanotte locale**.
 * Evita il bug di `new Date("YYYY-MM-DD")` (interpretato come UTC) che sposta il giorno nel fuso orario.
 */
export function parseDateOnlyLocalMs(iso: string): number {
  if (!iso || typeof iso !== "string") return NaN;
  const day = iso.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Calcola l'età in anni a partire dalla data di nascita (stringa ISO o YYYY-MM-DD).
 * Restituisce null se la data non è valida.
 */
export function calculateAge(dataNascita: string): number | null {
  if (!dataNascita || typeof dataNascita !== "string") return null;
  const birth = new Date(dataNascita);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}
