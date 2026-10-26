import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {ownedSpaceAddress,typedOrganizerPlace,isOwnedSpaceTailAtAddress} from './ownedPlaceEvidence.js';
import {parseXlsxFile} from '../services/driveService.js';
import {resolveFacebookEventEndDateTime} from '../processing/rowProcessor.js';
import {RawRowData} from '../types/index.js';
const description='Did you know October24th is World Sustainability Day?\n\nOn October24th, we will be holding our World Sustainability Day event from1pm to3:30pm at our space(149 Mount Edward Rd)! This is a free community initiative.\n\nTo learn more about the event and to register:\nhttps://steampei.jumbula.com/Fall2026/WorldSustainabilityDaySTEAMEvent'.replaceAll('October24','October 24').replace('from1','from 1').replace('to3','to 3').replace('space(','space (');
const input={name:'STEAM PEI',organizer:'STEAM PEI',type:'PLACE',url:'https://facebook.com/STEAMPEI',description};
test('literal owned-space address and typed organizer PLACE preserve organization identity',()=>{assert.deepEqual(typedOrganizerPlace(input),{name:'STEAM PEI',address:'149 Mount Edward Rd'});});
for(const change of [{type:'CITY'},{organizer:'A different host'},{url:'https://facebook.com/events/123'},{description:description+' Second location:250 Queen Road.'}])test('does not promote incomplete/conflicting PLACE '+JSON.stringify(change),()=>{assert.equal(typedOrganizerPlace({...input,...change}),undefined);});
test('owned-space tail must match captured street, not merely an address-looking suffix',()=>{assert.equal(isOwnedSpaceTailAtAddress('at our space (149 Mount Edward Rd)! More details.','149 Mt Edward Rd, Charlottetown'),true);assert.equal(isOwnedSpaceTailAtAddress('at our space (149 Mount Edward Rd)!','150 Mount Edward Rd'),false);assert.equal(ownedSpaceAddress(description+' at our studio (50 Queen Street).'),undefined);});
test('actual STEAM workbook row retains PLACE and source address, then resolves explicit matching end',async()=>{
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{id:'28532408339730928',name:'STEAM PEI World Sustainability Day Event',description,'location/name':'STEAM PEI','location/placeType':'PLACE','location/url':input.url,'organizators/0/name':'STEAM PEI',organizedBy:'Event by STEAM PEI',utcStartDate:'2026-10-24T16:00:00Z',dateTimeSentence:'Saturday, October 24, 2026 at 1:00 PM ADT',usersResponded:'3',url:'https://www.facebook.com/events/28532408339730928/',eventFrequency:'SINGLE'}]),'Data');
 const parsed=await parseXlsxFile(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));const row=parsed.rows[0];assert.equal(row.facebookEventLocationName,'STEAM PEI');assert.equal(row.facebookEventLocationIsCityLevel,false);assert.equal(row.address,'149 Mount Edward Rd');const end=resolveFacebookEventEndDateTime(row,{date:'2026-10-24',time:'13:00'});assert.equal(end?.endTime,'15:30');assert.equal(end?.endDate,'2026-10-24');
});
for(const text of [description.replaceAll('October 24th','October 25th'),description.replace('3:30pm','3:30'),description.replace('149 Mount','150 Mount'),description.replace('event from','registration from')])test('matching-start end fallback holds conflicting/ambiguous source',()=>{
 const row={uniqueId:'28532408339730928',text:'',userName:'STEAM PEI',pageName:'',mediaUrls:[],facebookEventDescription:text,address:'149 Mount Edward Rd',timestamp:'2026-10-24T16:00:00Z',utcStartDate:'2026-10-24T16:00:00Z'} as RawRowData;assert.equal(resolveFacebookEventEndDateTime(row,{date:'2026-10-24',time:'13:00'}),null);
});
