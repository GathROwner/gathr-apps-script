/** Pure shadow proposals. No approval, persistence, discovery, geocoding or model calls. */
import {createHash} from 'node:crypto';
import {DateTime} from 'luxon';
import {verifyAreaPublicationReferences} from './areaEventPublication.js';
import type {AreaEventLinkEvidence, EventAreaLocation} from './areaEventPublication.js';

export interface FestivalEdition {
  id: string; name: string; year: number; startDate: string; endDate: string;
  organizerId: string; organizerNames: string[]; sourceIds: string[];
}
export interface FestivalSourceEvidence {
  id: string;
  source: {id: string; url: string; text: string; publisherId: string; organizerId?: string; revision?: string};
  kind: 'programme_row' | 'festival_activity';
  /** One literal row/card, not the whole aggregated post. */
  scopeText: string;
  /** Optional contiguous caption structure; neither field is synthesized. */
  activityRowText?: string;
  dateHeaderText?: string;
  /** Literal programme heading or explicit current activity-membership statement. */
  membershipText: string;
  festivalNameText: string; yearText: string; organizerText?: string;
  activity: {name: string; venueId: string; startDate: string; startTime: string; eventPath?: string; ticketUrl?: string};
  eventText: string; dateText: string; timeText: string; venueText: string;
}
export interface FestivalCanonicalRecord {path: string; data: Record<string, any>}
export interface FestivalCanonicalVenue {id: string; label: string; aliases?: string[]; latitude: number; longitude: number}
export type FestivalLinkReason = 'eligible' | 'invalid_edition' | 'invalid_source' | 'conflicting_source_evidence' |
  'edition_conflict' | 'membership_not_explicit' | 'unbound_programme' | 'evidence_missing' | 'unknown_venue' |
  'missing_clock' | 'invalid_occurrence' | 'outside_edition' | 'ticket_identity_conflict' | 'ambiguous_canonical' |
  'missing_child' | 'canonical_identity_conflict' | 'inactive_or_noncanonical_child' | 'source_occurrence_conflict';
export interface FestivalLinkOutcome {
  id: string; sourceId: string; evidenceFingerprint: string;
  status: 'eligible' | 'held' | 'unmatched'; reason: FestivalLinkReason; pending: boolean;
  candidatePaths: string[];
}
export interface FestivalLinkProposal {
  eventPath: string; eventId: string; venueId: string; point: EventAreaLocation;
  evidence: AreaEventLinkEvidence[];
  provenance: {evidenceId: string; sourceId: string; sourceUrl: string; publisherId: string;
    revision: string | null; sourceText: string; sourceFingerprint: string; evidenceFingerprint: string}[];
  fingerprint: string;
}
export interface FestivalLinkResult {
  version: 1; umbrellaId: string; outcomes: FestivalLinkOutcome[]; links: FestivalLinkProposal[];
}

const key = (v: unknown): string => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const activityKey = (v: unknown): string => key(String(v || '').split(/\s+[—–]\s+/)[0]);
const venueKey = (v: string): string => key(v).replace(/^the /,'');
const nonempty = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
const opaqueId = (v: unknown): v is string => nonempty(v)&&v.length<=1000&&!/[\r\n\0]/.test(v);
const validDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).toISODate() === v;
const clock = (v: string): boolean => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const trueFlag = (v: unknown): boolean => v===true||v===1||typeof v==='string'&&['true','yes','1'].includes(v.trim().toLowerCase());
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {for(const entry of Object.values(value)) freeze(entry);Object.freeze(value);}
  return value;
}
function specificUrl(value: string): boolean {
  try {const url=new URL(value);return ['https:','http:'].includes(url.protocol) && url.pathname.replace(/\//g,'').length>0;}
  catch {return false;}
}
function ticketIdentity(value: unknown): string {
  if (!nonempty(value) || !specificUrl(value)) return '';
  const url=new URL(value);const ticket=url.pathname.match(/^\/events\/(\d+)(?:\/|$)/);
  if(ticket)return `${url.hostname.toLowerCase()}/events/${ticket[1]}`;
  url.hash='';url.searchParams.sort();return url.toString().replace(/\/$/,'');
}
function printedProgrammeYear(e: FestivalSourceEvidence, edition: FestivalEdition): boolean {
  if(e.yearText===String(edition.year))return new RegExp(`\\b${edition.year}\\b`).test(e.membershipText);
  const short=String(edition.year%100).padStart(2,'0');
  if(e.yearText!==short)return false;
  // A short logo year must be a separate heading line, or adjacent to the
  // festival name. A day, minute, runtime, address or digit substring is not it.
  const ownLine=e.membershipText.split(/\r?\n/).some(line=>new RegExp(`^[\\s'’]*${short}\\s*$`).test(line));
  const rest=e.membershipText.trimStart().slice(e.festivalNameText.length);
  const adjacent=new RegExp(`^[\\s'’]+${short}(?=$|[\\s:—–])`).exec(rest);
  const suffix=adjacent?rest.slice(adjacent[0].length).trimStart():'';
  const notYear=/^(?:[:/.\-]\s*\d|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|min(?:ute)?s?|seconds?)\b|\w+\s+(?:street|st|road|rd|avenue|ave)\b)/i.test(suffix);
  const besideName=Boolean(adjacent)&&!notYear;
  return ownLine||besideName;
}
const CALENDAR_DATE=/\b(?:20\d{2}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+20\d{2})?)\b/gi;
const WEEKDAY_HEADING=/^\s*(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i;
function scopedOccurrence(e: FestivalSourceEvidence): FestivalLinkReason | undefined {
  if(e.activityRowText===undefined&&e.dateHeaderText===undefined) {
    return [e.eventText,e.dateText,e.timeText,e.venueText].every(x=>nonempty(x)&&e.scopeText.includes(x))?undefined:'evidence_missing';
  }
  const row=e.activityRowText,header=e.dateHeaderText;
  if(!nonempty(row)||!nonempty(header)||!e.scopeText.startsWith(header)||!e.scopeText.endsWith(row)||
      !nonempty(e.dateText)||!header.includes(e.dateText)||![e.eventText,e.timeText,e.venueText].every(x=>nonempty(x)&&row.includes(x)))return 'evidence_missing';
  const dates=header.match(CALENDAR_DATE)||[];
  const withoutIso=header.replace(/\b20\d{2}-\d{2}-\d{2}\b/g,'');
  if(dates.length!==1||!/^(?:\s*(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)[,.]?\s+)?(?:20\d{2}-|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(header)||
      /\b\d{1,2}\s*[-–/]\s*\d{1,2}\b|\b(?:and|to|through)\s+\d{1,2}\b/i.test(withoutIso))return 'source_occurrence_conflict';
  const between=e.scopeText.slice(header.length,e.scopeText.length-row.length);
  if((between.match(CALENDAR_DATE)||[]).length||between.split(/\r?\n/).some(line=>WEEKDAY_HEADING.test(line)))return 'source_occurrence_conflict';
  return undefined;
}
function membership(e: FestivalSourceEvidence, edition: FestivalEdition): FestivalLinkReason | undefined {
  const programme=e.kind==='programme_row';
  const sameName=programme?key(e.festivalNameText).replace(/ /g,'')===key(edition.name).replace(/ /g,''):key(e.festivalNameText)===key(edition.name);
  if (!sameName || (programme?!printedProgrammeYear(e,edition):e.yearText!==String(edition.year)) ||
      !e.membershipText.includes(e.festivalNameText) || !e.membershipText.includes(e.yearText) ||
      (e.source.organizerId && e.source.organizerId!==edition.organizerId)) return 'edition_conflict';
  const years=e.membershipText.match(/\b(?:19|20)\d{2}\b/g)||[];
  if(years.some(y=>y!==String(edition.year)))return 'edition_conflict';
  if(e.organizerText && (!e.membershipText.includes(e.organizerText)||!edition.organizerNames.some(n=>key(n)===key(e.organizerText))))return 'edition_conflict';
  if(e.kind==='programme_row') {
    if(!edition.sourceIds.includes(e.source.id) || e.source.organizerId!==edition.organizerId ||
        !key(e.membershipText).startsWith(`${key(e.festivalNameText)} `)||
        !/\b(programme|program|lineup|schedule|screenings)\b/i.test(e.membershipText))return 'unbound_programme';
    const header=e.source.text.indexOf(e.membershipText),row=e.source.text.indexOf(e.scopeText);
    if(row<header)return 'unbound_programme';
    // A different section/edition header between the selected header and row
    // makes that association ambiguous. Do not borrow an earlier heading.
    const intervening=e.source.text.slice(header+e.membershipText.length,row);
    if(intervening.split(/\r?\n/).some(line=>/\b(?:programme|program|lineup|schedule|screenings)\b/i.test(line)))return 'unbound_programme';
    return undefined;
  }
  if(e.kind!=='festival_activity' || !e.scopeText.includes(e.membershipText))return 'membership_not_explicit';
  if(!nonempty(e.organizerText) || !e.membershipText.includes(e.organizerText) ||
      !edition.organizerNames.some(n=>key(n)===key(e.organizerText)))return 'edition_conflict';
  const statement=key(e.membershipText),festival=`${key(e.festivalNameText)} ${edition.year}`;
  const subjects=['this event','this screening','this show','this performance','this session','this activity',activityKey(e.eventText)];
  const explicit=subjects.some(subject=>statement.startsWith(`${subject} is part of ${festival} `)||statement===`${subject} is part of ${festival}`);
  // A separately posted festival-named activity must name the edition and
  // organizer in its heading, not merely mention a performer's past festival.
  const heading=e.membershipText.split(/\r?\n/)[0];
  const headingActivity=activityKey(e.eventText);
  const named=heading.includes(e.eventText) && /[:—–]/.test(heading) &&
    (key(heading)===`${festival} ${headingActivity}`||key(heading)===headingActivity&&headingActivity.startsWith(`${festival} `)) &&
    /\b(?:presented|organized|organised) by\b/i.test(e.membershipText);
  return explicit||named ? undefined : 'membership_not_explicit';
}

/** All reads are supplied snapshots; output is deterministic and deeply frozen. */
export async function resolveFestivalMembership(input: {
  umbrella: FestivalEdition; sources: readonly FestivalSourceEvidence[];
  candidates: readonly FestivalCanonicalRecord[]; venues: readonly FestivalCanonicalVenue[];
}): Promise<FestivalLinkResult> {
  const edition=input.umbrella;
  const validEdition=opaqueId(edition.id)&&nonempty(edition.name)&&opaqueId(edition.organizerId)&&
    Array.isArray(edition.sourceIds)&&Array.isArray(edition.organizerNames)&&edition.organizerNames.length>0&&
    Number.isInteger(edition.year)&&validDate(edition.startDate)&&validDate(edition.endDate)&&edition.endDate>=edition.startDate&&
    Number(edition.startDate.slice(0,4))===edition.year&&Number(edition.endDate.slice(0,4))===edition.year;
  const rows=[...new Map(input.sources.map(e=>[fingerprint(e),e])).entries()].sort(([a],[b])=>compare(a,b));
  const revisions=new Map<string,Set<string>>();
  for(const [hash,e]of rows){const id=fingerprint([e.source.id,e.id]);const set=revisions.get(id)||new Set<string>();set.add(hash);revisions.set(id,set);}
  const ticketClaims=new Map<string,Set<string>>();
  for(const [,e]of rows){const id=ticketIdentity(e.activity.ticketUrl);if(id&&nonempty(e.scopeText)&&nonempty(e.source.text)&&e.scopeText.includes(e.activity.ticketUrl!)&&e.source.text.includes(e.scopeText)){
    const set=ticketClaims.get(id)||new Set<string>();set.add(fingerprint({name:activityKey(e.activity.name),venue:e.activity.venueId,date:e.activity.startDate,time:e.activity.startTime}));ticketClaims.set(id,set);
  }}
  const outcomes: FestivalLinkOutcome[]=[];const proposals=new Map<string,Omit<FestivalLinkProposal,'fingerprint'>>();
  for(const [hash,e]of rows) {
    const outcome:FestivalLinkOutcome={id:e.id,sourceId:e.source.id,evidenceFingerprint:hash,status:'held',reason:'invalid_source',pending:false,candidatePaths:[]};
    outcomes.push(outcome);
    const stop=(reason:FestivalLinkReason,status:FestivalLinkOutcome['status']='held',pending=false)=>Object.assign(outcome,{reason,status,pending});
    if(!validEdition){stop('invalid_edition');continue;}
    if(!opaqueId(e.id)||!opaqueId(e.source.id)||!opaqueId(e.source.publisherId)||!specificUrl(e.source.url)||!nonempty(e.source.text))continue;
    if((revisions.get(fingerprint([e.source.id,e.id]))?.size||0)>1){stop('conflicting_source_evidence');continue;}
    if(!nonempty(e.scopeText)||!nonempty(e.membershipText)||!e.source.text.includes(e.scopeText)||!e.source.text.includes(e.membershipText)) {stop('evidence_missing');continue;}
    if(!nonempty(e.timeText)){stop('missing_clock');continue;}
    const scopeConflict=scopedOccurrence(e);if(scopeConflict){stop(scopeConflict);continue;}
    const association=membership(e,edition);if(association){stop(association,association==='membership_not_explicit'?'unmatched':'held');continue;}
    if((ticketClaims.get(ticketIdentity(e.activity.ticketUrl))?.size||0)>1){stop('source_occurrence_conflict');continue;}
    if(!e.activity.startTime||!clock(e.activity.startTime)){stop('missing_clock');continue;}
    if(!validDate(e.activity.startDate)||activityKey(e.activity.name)!==activityKey(e.eventText)){stop('invalid_occurrence');continue;}
    const printedYear=e.dateText.match(/\b20\d{2}\b/g)||[];
    const printedWeekday=e.dateText.match(/\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i)?.[1];
    const clockPrefix=e.scopeText.slice(Math.max(0,e.scopeText.indexOf(e.timeText)-30),e.scopeText.indexOf(e.timeText));
    if(printedYear.some(y=>y!==String(edition.year))||printedWeekday&&printedWeekday.slice(0,3).toLowerCase()!==DateTime.fromISO(e.activity.startDate).weekdayShort?.toLowerCase()||
       /\bdoors?\s*(?:open(?:s)?|at)?\s*[:\-]?\s*$/i.test(clockPrefix)){stop('source_occurrence_conflict');continue;}
    if(e.activity.startDate<edition.startDate||e.activity.startDate>edition.endDate){stop('outside_edition');continue;}
    const venues=input.venues.filter(v=>v.id===e.activity.venueId);
    if(venues.length!==1||!identifier(e.activity.venueId)){stop('unknown_venue');continue;}
    const venue=venues[0];const names=[venue.label,...(venue.aliases||[])];
    const matchedName=names.filter(n=>venueKey(n)===venueKey(e.venueText)).sort(compare)[0];
    if(!matchedName||!Number.isFinite(venue.latitude)||!Number.isFinite(venue.longitude)||Math.abs(venue.latitude)>90||Math.abs(venue.longitude)>180){stop('unknown_venue');continue;}
    const base=input.candidates.filter(c=>activityKey(c.data.eventName||c.data.name)===activityKey(e.activity.name)&&c.data.venueId===venue.id&&
      c.data.startDate===e.activity.startDate&&c.data.startTime===e.activity.startTime);
    let matches=base;
    if(e.activity.ticketUrl){
      const ticket=ticketIdentity(e.activity.ticketUrl);
      if(!ticket||!e.scopeText.includes(e.activity.ticketUrl)){stop('ticket_identity_conflict');continue;}
      matches=base.filter(c=>ticketIdentity(c.data.ticketsBuyUrl||c.data.ticketUrl)===ticket);
      if(base.length&&matches.length===0){stop('ticket_identity_conflict');continue;}
    }
    // Repeated snapshots of the same path are safe only if their complete data agree.
    const paths=new Map<string,FestivalCanonicalRecord>();let drift=false;
    for(const c of matches){if(paths.has(c.path)&&fingerprint(paths.get(c.path)!.data)!==fingerprint(c.data))drift=true;paths.set(c.path,c);}
    outcome.candidatePaths=[...paths.keys()].sort(compare);
    if(drift||paths.size>1){stop('ambiguous_canonical');continue;}
    if(paths.size===0){
      const conflicting=input.candidates.some(c=>activityKey(c.data.eventName||c.data.name)===activityKey(e.activity.name)&&
        (e.activity.eventPath===c.path||c.data.venueId===venue.id&&c.data.startDate===e.activity.startDate));
      stop(conflicting?'canonical_identity_conflict':'missing_child',conflicting?'held':'unmatched',!conflicting);continue;
    }
    const candidate=[...paths.values()][0],data=candidate.data,id=candidate.path.split('/').at(-1)!;
    if(new Set(input.candidates.filter(c=>c.path.split('/').at(-1)===id).map(c=>c.path)).size>1){stop('ambiguous_canonical');continue;}
    if(!/^(?:events\/[A-Za-z0-9_-]+|venues\/[A-Za-z0-9_-]+\/events\/[A-Za-z0-9_-]+)$/.test(candidate.path)||
        (candidate.path.startsWith('venues/')&&candidate.path.split('/')[1]!==venue.id)||
        e.activity.eventPath&&e.activity.eventPath!==candidate.path){stop('canonical_identity_conflict');continue;}
    if(trueFlag(data.isRecurring)||data.recurringPattern&&!['none','no'].includes(String(data.recurringPattern).toLowerCase())||data.originalEventId||trueFlag(data.isRecurringInstance)||
       ['deleted','isDeleted','cancelled','canceled','isCancelled','isCanceled','expired','isExpired'].some(k=>trueFlag(data[k]))||
       ['cancelled','canceled','deleted','rejected','superseded','expired'].includes(String(data.status||'').toLowerCase())){stop('inactive_or_noncanonical_child');continue;}
    const point:EventAreaLocation={id:`venue_${venue.id}`,label:matchedName,venueId:venue.id,
      coordinates:{latitude:venue.latitude,longitude:venue.longitude},certainty:'confirmed',linkedEventIds:[id]};
    const evidence:AreaEventLinkEvidence={eventPath:candidate.path,eventName:data.eventName||data.name,venueId:venue.id,startDate:data.startDate,startTime:data.startTime,
      festivalName:e.festivalNameText,sourceUrl:e.source.url,sourceText:`${e.membershipText}\n${e.scopeText}`,sourceEventText:e.eventText,
      sourceDateText:e.dateText,sourceTimeText:e.timeText,sourceVenueText:e.venueText};
    // Membership above binds the literal typography alias to the canonical
    // edition. Validate occurrence excerpts using that literal name, retaining
    // original source words in the proof rather than manufacturing a heading.
    try {await verifyAreaPublicationReferences({areaData:{version:1,status:'partial',locations:[point]},evidence:[evidence],eventName:`${e.festivalNameText} ${edition.year}`,
      startDate:edition.startDate,endDate:edition.endDate,read:async p=>p===candidate.path?{...data,isRecurringInstance:false}:p===`venues/${venue.id}`?venue:undefined});}
    catch {stop('source_occurrence_conflict');continue;}
    stop('eligible','eligible');
    const proposal=proposals.get(candidate.path)||{eventPath:candidate.path,eventId:id,venueId:venue.id,point,evidence:[],provenance:[]};
    proposal.evidence.push(evidence);proposal.provenance.push({evidenceId:e.id,sourceId:e.source.id,sourceUrl:e.source.url,publisherId:e.source.publisherId,
      revision:e.source.revision??null,sourceText:e.source.text,sourceFingerprint:fingerprint(e.source),evidenceFingerprint:hash});
    // Alias selection must not depend on source order.
    if(compare(point.label,proposal.point.label)<0)proposal.point={...proposal.point,label:point.label};
    proposals.set(candidate.path,proposal);
  }
  const links=[...proposals.values()].sort((a,b)=>compare(a.eventPath,b.eventPath)).map(p=>{
    p.evidence.sort((a,b)=>compare(fingerprint(a),fingerprint(b)));p.provenance.sort((a,b)=>compare(a.evidenceFingerprint,b.evidenceFingerprint));
    const editionIdentity={...edition,sourceIds:[...edition.sourceIds].sort(compare),organizerNames:[...edition.organizerNames].sort(compare)};
    return {...p,fingerprint:fingerprint({edition:editionIdentity,p})};
  });
  return freeze(canonical({version:1,umbrellaId:edition.id,outcomes,links})) as FestivalLinkResult;
}
