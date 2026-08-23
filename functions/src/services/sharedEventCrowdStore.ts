import * as admin from 'firebase-admin';
import {
  ParsedSharedEvent,
  PublicSharedEventCandidateRecord,
  PublicSharedEventCandidateStatus,
  SharedEventCrowdEventStatus,
} from '../types/sharedEvent.js';
import { logger } from '../utils/logger.js';
import { getSharedEventSourceDb } from './sharedEventCandidateStore.js';
import {
  buildCrowdConsensus,
  buildCrowdContribution,
  crowdAggregateId,
  crowdContributionMatchesAggregate,
  crowdStatusSummary,
  crowdTitleSimilarity,
  getCrowdEligibility,
  SHARED_EVENT_CROWD_DAILY_LIMIT,
  SHARED_EVENT_CROWD_THRESHOLD,
  SharedEventCrowdAggregateRecord,
  SharedEventCrowdContribution,
} from './sharedEventCrowdConsensus.js';

const CROWD_COLLECTION = 'crowdsourced_shared_event_candidates';
const PUBLIC_CANDIDATE_COLLECTION = 'public_shared_event_candidates';
const TERMINAL_CROWD_STATUSES = new Set<SharedEventCrowdAggregateRecord['status']>([
  'candidate_pending',
  'promoted',
  'duplicate_existing',
  'needs_review',
  'failed',
]);

function db(): admin.firestore.Firestore {
  return getSharedEventSourceDb();
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function candidateIdForAggregate(aggregateId: string): string {
  return `crowd_${aggregateId}`;
}

function contributionRefs(contributions: SharedEventCrowdContribution[]) {
  return contributions.map((contribution) => ({
    ownerUid: contribution.ownerUid,
    ingestId: contribution.ingestId,
    privateEventId: contribution.privateEventId,
  }));
}

function publicStatusForCrowdStatus(
  status: SharedEventCrowdEventStatus['status']
): PublicSharedEventCandidateStatus | undefined {
  if (status === 'candidate_pending') return 'pending_validation';
  if (status === 'promoted') return 'promoted';
  if (status === 'duplicate_existing') return 'duplicate_existing';
  if (status === 'needs_review') return 'needs_user_review';
  if (status === 'failed') return 'failed';
  return undefined;
}

async function updateContributorCrowdStatus(params: {
  contribution: Pick<SharedEventCrowdContribution, 'ownerUid' | 'ingestId' | 'privateEventId'>;
  status: SharedEventCrowdEventStatus;
}): Promise<void> {
  const firestore = db();
  const contribution = params.contribution;
  const status = {
    ...params.status,
    privateEventId: contribution.privateEventId,
  };
  const publicPromotionStatus = publicStatusForCrowdStatus(status.status);
  const privateRef = firestore
    .collection('users')
    .doc(contribution.ownerUid)
    .collection('privateSharedEvents')
    .doc(contribution.privateEventId);
  const ingestRef = firestore
    .collection('users')
    .doc(contribution.ownerUid)
    .collection('sharedEventIngests')
    .doc(contribution.ingestId);

  await firestore.runTransaction(async (tx) => {
    const ingestSnapshot = await tx.get(ingestRef);
    const existingEvents = Array.isArray(ingestSnapshot.data()?.crowdPromotion?.events)
      ? ingestSnapshot.data()!.crowdPromotion.events as SharedEventCrowdEventStatus[]
      : [];
    const mergedEvents = existingEvents.some((event) => event.privateEventId === status.privateEventId)
      ? existingEvents.map((event) => event.privateEventId === status.privateEventId ? status : event)
      : [...existingEvents, status];
    tx.set(privateRef, {
      ...(status.publicCandidateId ? {
        publicCandidateId: status.publicCandidateId,
        ...(publicPromotionStatus ? { publicPromotionStatus } : {}),
      } : {}),
      crowdPromotion: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(ingestRef, {
      crowdPromotion: crowdStatusSummary(mergedEvents),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function syncCrowdStatusToContributors(params: {
  contributions: Array<Pick<SharedEventCrowdContribution, 'ownerUid' | 'ingestId' | 'privateEventId'>>;
  status: Omit<SharedEventCrowdEventStatus, 'privateEventId'>;
}): Promise<void> {
  const uniqueTargets = new Map<string, typeof params.contributions[number]>();
  for (const contribution of params.contributions) {
    uniqueTargets.set(`${contribution.ownerUid}|${contribution.privateEventId}`, contribution);
  }
  await Promise.all([...uniqueTargets.values()].map((contribution) => updateContributorCrowdStatus({
    contribution,
    status: {
      ...params.status,
      privateEventId: contribution.privateEventId,
    },
  })));
}

async function ensureCrowdPublicCandidate(
  aggregateId: string,
  aggregate: SharedEventCrowdAggregateRecord
): Promise<string> {
  const consensus = buildCrowdConsensus(aggregate.contributions, aggregate.threshold);
  if (!consensus.ready || !consensus.fields) {
    throw new Error(consensus.reason || 'Crowd consensus was not ready.');
  }

  const publicCandidateId = candidateIdForAggregate(aggregateId);
  const candidateRef = db().collection(PUBLIC_CANDIDATE_COLLECTION).doc(publicCandidateId);
  const primary = aggregate.contributions[0];
  const nowIso = new Date().toISOString();
  const record: PublicSharedEventCandidateRecord = {
    ownerUid: primary.ownerUid,
    ingestId: primary.ingestId,
    privateEventId: primary.privateEventId,
    sourcePlatform: 'unknown',
    sourceVisibility: 'user_private',
    promotionBasis: 'crowd_consensus',
    visibilityEvidence: {
      method: 'no_url',
      checkedAt: nowIso,
      reason: 'independently_corroborated_private_photo_submissions',
    },
    title: consensus.fields.title,
    startDate: consensus.fields.startDate,
    endDate: consensus.fields.endDate,
    startTime: consensus.fields.startTime,
    endTime: consensus.fields.endTime,
    locationName: consensus.fields.locationName,
    address: consensus.fields.address,
    contentKind: consensus.fields.contentKind,
    price: consensus.fields.price,
    relationshipType: consensus.fields.relationshipType,
    parentEventTitle: consensus.fields.parentEventTitle,
    recurringPattern: consensus.fields.recurringPattern,
    recurringDaysOfWeek: consensus.fields.recurringDaysOfWeek,
    recurrenceUntilDate: consensus.fields.recurrenceUntilDate,
    mediaUrls: [],
    timezone: consensus.fields.timezone,
    sourceContentSignature: `crowd:${aggregateId}`,
    fieldSources: {
      title: 'crowd_consensus',
      startDate: 'crowd_consensus',
      endDate: 'crowd_consensus',
      startTime: consensus.fields.startTime ? 'crowd_consensus' : undefined,
      endTime: consensus.fields.endTime ? 'crowd_consensus' : undefined,
      locationName: consensus.fields.locationName ? 'crowd_consensus' : undefined,
      address: consensus.fields.address ? 'crowd_consensus' : undefined,
      mediaUrls: 'crowd_consensus',
    },
    crowdConsensus: {
      aggregateId,
      contributorCount: aggregate.contributorCount,
      threshold: aggregate.threshold,
      contributorRefs: contributionRefs(aggregate.contributions),
    },
    status: 'pending_validation',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db().runTransaction(async (tx) => {
    const snapshot = await tx.get(candidateRef);
    if (!snapshot.exists) {
      tx.create(candidateRef, record);
    } else {
      tx.set(candidateRef, {
        crowdConsensus: record.crowdConsensus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  await db().collection(CROWD_COLLECTION).doc(aggregateId).set({
    publicCandidateId,
    status: 'candidate_pending',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return publicCandidateId;
}

export async function contributeSharedEventPhoto(params: {
  ownerUid: string;
  ingestId: string;
  privateEventId: string;
  event: ParsedSharedEvent;
  contributorEligible: boolean;
  hasUserPhoto: boolean;
}): Promise<SharedEventCrowdEventStatus> {
  const eligibility = getCrowdEligibility(params.event, { hasUserPhoto: params.hasUserPhoto });
  if (!params.contributorEligible || !eligibility.eligible) {
    return {
      privateEventId: params.privateEventId,
      contributorCount: 0,
      threshold: SHARED_EVENT_CROWD_THRESHOLD,
      status: 'ineligible',
      reason: params.contributorEligible ? eligibility.reason : 'account_not_eligible',
    };
  }

  const firestore = db();
  const contribution = buildCrowdContribution(params);
  const possible = await firestore
    .collection(CROWD_COLLECTION)
    .where('dateLocationKey', '==', contribution.dateLocationKey)
    .limit(20)
    .get();
  const matched = possible.docs
    .map((snapshot) => ({
      id: snapshot.id,
      ...(snapshot.data() as SharedEventCrowdAggregateRecord),
    }))
    .filter((aggregate) => crowdContributionMatchesAggregate(contribution, aggregate))
    .sort((left, right) => (
      crowdTitleSimilarity(contribution.title, right.title) -
      crowdTitleSimilarity(contribution.title, left.title)
    ))[0];
  const aggregateId = matched?.id || crowdAggregateId(contribution);
  const aggregateRef = firestore.collection(CROWD_COLLECTION).doc(aggregateId);
  const quotaRef = firestore
    .collection('users')
    .doc(params.ownerUid)
    .collection('crowdContributionDays')
    .doc(dayKey());

  const transactionResult = await firestore.runTransaction(async (tx) => {
    const [aggregateSnapshot, quotaSnapshot] = await Promise.all([
      tx.get(aggregateRef),
      tx.get(quotaRef),
    ]);
    const existing = aggregateSnapshot.exists
      ? aggregateSnapshot.data() as SharedEventCrowdAggregateRecord
      : undefined;
    if (existing && TERMINAL_CROWD_STATUSES.has(existing.status)) {
      return {
        rateLimited: false as const,
        aggregate: existing,
        consensusReady: false,
      };
    }
    const existingContributions = Array.isArray(existing?.contributions)
      ? existing!.contributions
      : [];
    const existingIndex = existingContributions.findIndex((entry) => entry.ownerUid === params.ownerUid);
    const currentDailyCount = Number(quotaSnapshot.data()?.count || 0);
    if (existingIndex < 0 && currentDailyCount >= SHARED_EVENT_CROWD_DAILY_LIMIT) {
      return { rateLimited: true as const };
    }

    const contributions = [...existingContributions];
    const stampedContribution = {
      ...contribution,
      contributedAt: admin.firestore.Timestamp.now(),
    };
    if (existingIndex >= 0) {
      contributions[existingIndex] = {
        ...stampedContribution,
        ingestId: existingContributions[existingIndex].ingestId,
        privateEventId: existingContributions[existingIndex].privateEventId,
      };
    }
    else contributions.push(stampedContribution);

    const consensus = buildCrowdConsensus(contributions, SHARED_EVENT_CROWD_THRESHOLD);
    const fields = consensus.fields || {
      title: existing?.title || contribution.title,
      startDate: contribution.startDate,
      endDate: existing?.endDate || contribution.endDate,
      startTime: existing?.startTime || contribution.startTime,
      endTime: existing?.endTime || contribution.endTime,
      locationName: existing?.locationName || contribution.locationName,
      address: existing?.address || contribution.address,
      contentKind: existing?.contentKind || contribution.contentKind,
      price: existing?.price || contribution.price,
      relationshipType: existing?.relationshipType || contribution.relationshipType,
      parentEventTitle: existing?.parentEventTitle || contribution.parentEventTitle,
      recurringPattern: existing?.recurringPattern || contribution.recurringPattern,
      recurringDaysOfWeek: existing?.recurringDaysOfWeek || contribution.recurringDaysOfWeek,
      recurrenceUntilDate: existing?.recurrenceUntilDate || contribution.recurrenceUntilDate,
      timezone: existing?.timezone || contribution.timezone,
    };
    const status = existing && TERMINAL_CROWD_STATUSES.has(existing.status)
      ? existing.status
      : consensus.ready
        ? 'candidate_pending'
        : 'collecting';
    const aggregate: SharedEventCrowdAggregateRecord = {
      ...fields,
      titleKey: contribution.titleKey,
      locationKey: contribution.locationKey,
      dateLocationKey: contribution.dateLocationKey,
      contributorCount: contributions.length,
      threshold: SHARED_EVENT_CROWD_THRESHOLD,
      contributions,
      status,
      ...(existing?.publicCandidateId ? { publicCandidateId: existing.publicCandidateId } : {}),
    };
    tx.set(aggregateRef, {
      ...aggregate,
      ...(aggregateSnapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (existingIndex < 0) {
      tx.set(quotaRef, {
        count: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { rateLimited: false as const, aggregate, consensusReady: consensus.ready };
  });

  if (transactionResult.rateLimited) {
    return {
      privateEventId: params.privateEventId,
      aggregateId,
      contributorCount: 0,
      threshold: SHARED_EVENT_CROWD_THRESHOLD,
      status: 'ineligible',
      reason: 'daily_contribution_limit_reached',
    };
  }

  let publicCandidateId = transactionResult.aggregate.publicCandidateId;
  if (transactionResult.consensusReady && transactionResult.aggregate.status === 'candidate_pending') {
    publicCandidateId = await ensureCrowdPublicCandidate(aggregateId, transactionResult.aggregate);
  }
  const resultStatus: SharedEventCrowdEventStatus['status'] = transactionResult.aggregate.status === 'collecting'
    ? 'collecting'
    : transactionResult.aggregate.status;
  const result: SharedEventCrowdEventStatus = {
    privateEventId: params.privateEventId,
    aggregateId,
    publicCandidateId,
    contributorCount: transactionResult.aggregate.contributorCount,
    threshold: transactionResult.aggregate.threshold,
    status: resultStatus,
  };

  await syncCrowdStatusToContributors({
    contributions: [
      ...transactionResult.aggregate.contributions,
      {
        ownerUid: params.ownerUid,
        ingestId: params.ingestId,
        privateEventId: params.privateEventId,
      },
    ],
    status: {
      aggregateId,
      publicCandidateId,
      contributorCount: result.contributorCount,
      threshold: result.threshold,
      status: result.status,
    },
  });

  logger.info('Recorded shared photo crowd contribution', {
    ownerUid: params.ownerUid,
    ingestId: params.ingestId,
    privateEventId: params.privateEventId,
    aggregateId,
    contributorCount: result.contributorCount,
    threshold: result.threshold,
    status: result.status,
  });
  return result;
}

export async function findExistingOwnerCrowdContribution(params: {
  ownerUid: string;
  event: ParsedSharedEvent;
}): Promise<SharedEventCrowdContribution | undefined> {
  const probe = buildCrowdContribution({
    ownerUid: params.ownerUid,
    ingestId: 'dedupe-probe',
    privateEventId: 'dedupe-probe',
    event: params.event,
  });
  const possible = await db()
    .collection(CROWD_COLLECTION)
    .where('dateLocationKey', '==', probe.dateLocationKey)
    .limit(20)
    .get();
  const matched = possible.docs
    .map((snapshot) => snapshot.data() as SharedEventCrowdAggregateRecord)
    .filter((aggregate) => crowdContributionMatchesAggregate(probe, aggregate))
    .sort((left, right) => (
      crowdTitleSimilarity(probe.title, right.title) -
      crowdTitleSimilarity(probe.title, left.title)
    ))[0];
  return matched?.contributions?.find((entry) => entry.ownerUid === params.ownerUid);
}

export async function markCrowdCandidateOutcome(params: {
  candidate: PublicSharedEventCandidateRecord;
  status: PublicSharedEventCandidateStatus;
  publicEventId?: string;
  publicEventPath?: string;
}): Promise<void> {
  const crowd = params.candidate.crowdConsensus;
  if (params.candidate.promotionBasis !== 'crowd_consensus' || !crowd?.aggregateId) return;
  const crowdStatus: SharedEventCrowdEventStatus['status'] = params.status === 'promoted'
    ? 'promoted'
    : params.status === 'duplicate_existing'
      ? 'duplicate_existing'
      : params.status === 'failed'
        ? 'failed'
        : 'needs_review';
  const firestore = db();
  await firestore.collection(CROWD_COLLECTION).doc(crowd.aggregateId).set({
    status: crowdStatus,
    ...(params.publicEventId ? { publicEventId: params.publicEventId } : {}),
    ...(params.publicEventPath ? { publicEventPath: params.publicEventPath } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await syncCrowdStatusToContributors({
    contributions: crowd.contributorRefs,
    status: {
      aggregateId: crowd.aggregateId,
      publicCandidateId: params.candidate.id,
      contributorCount: crowd.contributorCount,
      threshold: crowd.threshold,
      status: crowdStatus,
    },
  });
}
