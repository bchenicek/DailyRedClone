export type ID = string & {__isID: true};
export function toID(text: any): ID {
  if (text?.id) text = text.id; else if (text?.userid) text = text.userid;
  if (typeof text !== 'string' && typeof text !== 'number') return '' as ID;
  return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '') as ID;
}
export const Dex: any = {
  gen: 9,
  text: {getLanguage: () => 'en', get: (x: any) => ({name: x.name})},
  species: {get: (n: string) => ({name: n})},
  loadTextData(_l: string) {},
};
