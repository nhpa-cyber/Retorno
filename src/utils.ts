export const normalizeMapCode = (mapCode: any): string => {
  if (mapCode === undefined || mapCode === null) return '';
  return String(mapCode).trim().replace(/^0+/, '');
};

export const isSameMapCode = (a?: any, b?: any): boolean => {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  const strA = String(a).trim().toUpperCase();
  const strB = String(b).trim().toUpperCase();
  if (!strA || !strB) return false;
  if (strA === strB) return true;
  const normA = normalizeMapCode(strA);
  const normB = normalizeMapCode(strB);
  return normA.length > 0 && normA === normB;
};
