const MAX_LEN = 60;

export function slugify(input: string): string {
  const stripped = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') return 'untitled';
  if (slug.length <= MAX_LEN) return slug;

  const truncated = slug.slice(0, MAX_LEN);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}
