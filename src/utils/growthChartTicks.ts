/** Passo dell’asse altezza (cm): etichette e linee di sfondo ogni N cm, valori interi. */
export const CM_AXIS_STEP = 20;

/**
 * Multipli di {@link CM_AXIS_STEP} compresi nel range visibile [minY, maxY].
 * Se il range è troppo stretto per contenere un multiplo, usa un solo tick centrato sul multiplo più vicino.
 */
export function backgroundCmTicksEvery20(minY: number, maxY: number): number[] {
  const step = CM_AXIS_STEP;
  const lo = Math.ceil(minY / step) * step;
  const hi = Math.floor(maxY / step) * step;
  const out: number[] = [];
  if (lo <= hi) {
    for (let y = lo; y <= hi + 1e-9; y += step) out.push(y);
  } else {
    const mid = Math.round((minY + maxY) / 2 / step) * step;
    out.push(mid);
  }
  return out;
}
