import assert from 'node:assert/strict';
import test from 'node:test';
import {rehydrateFamilyAudienceMetadata} from './finalFormatter.js';
import {ExtractedItem, FormattedEvent} from './types.js';
import {scoreFamilyFriendly} from '../utils/familyFriendlyScoring.js';
import {validFamilyAudienceEvidence} from '../services/familyAudienceEvidence.js';

const item = (name:string,description:string): ExtractedItem => ({name,description,date:'2026-10-17',startTime:'16:00',endTime:'17:00',venue:'Hall',price:'',recurringPattern:'none',extractionReason:'source'});
const formatted = (name:string): FormattedEvent => ({name,description:'Short refreshed description.',startDate:'2026-10-17',endDate:'2026-10-17',startTime:'16:00',endTime:'17:00',venue:'Hall',establishment:'Hall',address:'',category:'Workshops & Classes',isEvent:'Yes',isFoodSpecial:'No',ticketPrice:'',ticketLink:'',relevantImageIndex:0,additionalLocation:'',isRecurring:false,recurringPattern:'none'});

test('aligned original item retains child evidence omitted by the formatter', () => {
  const child=item('Kids Drawing','Ages 8–11.');
  const adult=item('Drawing for Adults','An adult course.');
  const result=rehydrateFamilyAudienceMetadata(formatted(child.name),child,[child,adult],'Separate cocktails class 19+.');
  assert(validFamilyAudienceEvidence(result));
  assert(scoreFamilyFriendly(result).familyFriendlyScore>=60);
  assert.equal(result.description,'Short refreshed description.');
  assert.equal(result.startTime,'16:00');
  assert(!JSON.stringify(result.familyAudienceEvidence).includes('Ages 8'));
});

test('adult item rejects model-supplied proof and does not borrow a child gallery age', () => {
  const adult=item('Drawing for Adults','An eight-week adult course.');
  const child=item('Kids Drawing','Ages 8–11.');
  const good=rehydrateFamilyAudienceMetadata(formatted(child.name),child,[child,adult],'');
  const injected={...formatted(adult.name),familyAudienceEvidence:good.familyAudienceEvidence};
  const result=rehydrateFamilyAudienceMetadata(injected,adult,[adult,child],'Kids Drawing\nAges 8–11.');
  assert.equal(scoreFamilyFriendly(result).familyFriendlyScore,0);
});
