export const round = (n: number, d = 1) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;

export const kgToLb = (kg: number) => round((Number(kg) || 0) * 2.20462, 1);
export const lbToKg = (lb: number) => round((Number(lb) || 0) * 0.453592, 1);

export const cmToFtIn = (cm: number) => {
  const total = Math.round((Number(cm) || 0) * 0.393701);
  const ft = Math.floor(total / 12);
  const inch = total - ft * 12;
  return { ft, inch };
};

export const ftInToCm = (ft: number, inch: number) =>
  round(((Number(ft) || 0) * 12 + (Number(inch) || 0)) * 2.54, 1);

export const lToOz = (l: number) => round((Number(l) || 0) * 33.814, 1);
export const ozToL = (oz: number) => round((Number(oz) || 0) / 33.814, 2);

// Local timezone date key — fixes dashboard showing yesterday after midnight.
export const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const getTodayKey = () => getDateKey(new Date());

export const getYesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getDateKey(d);
};

export function idealWeightRange(heightCm: number) {
  const h = Number(heightCm) / 100;
  if (!h) return { min: 0, max: 0, mid: 0 };
  const min = round(18.5 * h * h, 1);
  const max = round(24.9 * h * h, 1);
  return { min, max, mid: round((min + max) / 2, 1) };
}

export function estimatedTargetFromFat(currentWeight: number, targetBf: number, currentBf = 24) {
  if (!targetBf || !currentWeight || targetBf >= 45) return undefined;
  const leanMass = currentWeight * (1 - currentBf / 100);
  return round(leanMass / (1 - targetBf / 100), 1);
}

export function estimatedFatFromTarget(currentWeight: number, targetWeight: number, currentBf = 24) {
  if (!currentWeight || !targetWeight) return undefined;
  const leanMass = currentWeight * (1 - currentBf / 100);
  const bf = round((1 - leanMass / targetWeight) * 100, 1);
  return Math.max(6, Math.min(35, bf));
}
