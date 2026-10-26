/** Source evidence only. No lookup, alias creation, coordinates or publication. */
const street='\\d{1,6}\\s+[\\p{L}\\d .\'’-]{1,80}?\\s+(?:Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Lane|Ln|Boulevard|Blvd)';
const owned=new RegExp(`\\bat\\s+our\\s+(?:space|studio|centre|center|venue)\\s*\\(\\s*(${street})\\.?\\s*\\)`, 'giu');
const key=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/\bmt\.?\b/g,'mount').replace(/\brd\.?\b/g,'road').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function ownedSpaceAddress(description:string):string|undefined {
  const matches=[...description.matchAll(owned)];if(matches.length!==1)return undefined;
  const addresses=[...description.matchAll(new RegExp(`\\b(${street})\\b`,'giu'))];
  const unique=new Set(addresses.map(x=>key(x[1])));if(unique.size!==1||!unique.has(key(matches[0][1])))return undefined;
  return matches[0][1].trim();
}
export function typedOrganizerPlace(input:{name:string;organizer:string;type:string;url:string;description:string}):{name:string;address:string}|undefined {
  if(input.type.toUpperCase()!=='PLACE'||!input.name.trim()||key(input.name)!==key(input.organizer))return undefined;
  try{const url=new URL(input.url);if(url.protocol!=='https:'||!['facebook.com','www.facebook.com'].includes(url.hostname)||!/^\/[\w.-]+\/?$/.test(url.pathname)||/^\/(?:events|groups|places)\/?$/i.test(url.pathname))return undefined;}catch{return undefined;}
  const address=ownedSpaceAddress(input.description);return address?{name:input.name.trim(),address}:undefined;
}
export function isOwnedSpaceTailAtAddress(tail:string,address:string):boolean {
  const match=[...tail.matchAll(owned)];if(match.length!==1||match[0].index!==0||!address)return false;
  const remainder=tail.slice(match[0][0].length);return (!remainder||/^[\s]*[.!?,]/.test(remainder))&&key(match[0][1])===key(address.split(',')[0]);
}
