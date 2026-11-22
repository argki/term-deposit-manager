export function toWarekiShort(year: number): string {
  if (!Number.isInteger(year) || year < 1926) return '';
  if (year >= 2019) {
    return `R${year - 2018}`;
  }
  if (year >= 1989) {
    return `H${year - 1988}`;
  }
  return `S${year - 1925}`;
}

export function formatYearWithWareki(year: number | string): string {
  const num = typeof year === 'number' ? year : Number(year);
  const wareki = toWarekiShort(num);
  return wareki ? `${num} (${wareki})` : String(year);
}

export function formatDateWithWareki(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]);
  const wareki = toWarekiShort(year);
  const base = `${match[1]}/${match[2]}/${match[3]}`;
  return wareki ? `${base} (${wareki})` : base;
}
