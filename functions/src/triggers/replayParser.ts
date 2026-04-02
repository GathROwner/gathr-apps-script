import { onRequest } from 'firebase-functions/v2/https';
import {
  GptUsageRecord,
  ParsePostInput,
  ParseStageArtifactsSnapshot,
  ParsingConfig,
  Stage45ReplayArtifacts,
} from '../parsing/types.js';
import { replayPostDataFromArtifacts } from '../parsing/postParser.js';
import * as firestoreService from '../services/firestoreService.js';
import { logger } from '../utils/logger.js';

type ReplaySource = 'auto' | 'stage3' | 'stage4';

interface ReplayStage45RequestBody {
  snapshotDocId?: string;
  replayFrom?: ReplaySource;
  stage4Model?: string;
  stage5Model?: string;
  saveReplaySnapshot?: boolean;
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeStageArtifactsSnapshot(
  base: ParseStageArtifactsSnapshot | undefined,
  incoming: ParseStageArtifactsSnapshot
): ParseStageArtifactsSnapshot {
  const stage3Items = Array.isArray(incoming.stage3Items)
    ? deepCloneJson(incoming.stage3Items)
    : base?.stage3Items;
  const stage4Items = Array.isArray(incoming.stage4Items)
    ? deepCloneJson(incoming.stage4Items)
    : base?.stage4Items;
  return {
    source: incoming.source || base?.source || 'replay',
    contentType: incoming.contentType || base?.contentType,
    stage37TicketUrl: incoming.stage37TicketUrl || base?.stage37TicketUrl,
    stage3Items,
    stage4Items,
  };
}

function summarizeGptUsageRecords(records: GptUsageRecord[]): Record<string, unknown> {
  type UsageBucket = {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
  };
  const createBucket = (): UsageBucket => ({
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
  });
  const summary = {
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCachedInputTokens: 0,
    byModel: {} as Record<string, UsageBucket>,
    byStage: {} as Record<string, UsageBucket>,
    byComponent: {} as Record<string, UsageBucket>,
  };

  for (const record of records) {
    const model = asString(record.model);
    if (!model) continue;

    const inputTokens = Number(record.inputTokens || 0);
    const outputTokens = Number(record.outputTokens || 0);
    const totalTokens = Number(record.totalTokens || inputTokens + outputTokens);
    const cachedInputTokens = Number(record.cachedInputTokens || 0);

    summary.totalCalls += 1;
    summary.totalInputTokens += inputTokens;
    summary.totalOutputTokens += outputTokens;
    summary.totalTokens += totalTokens;
    summary.totalCachedInputTokens += cachedInputTokens;

    const stage = asString(record.stage) || 'unknown';
    const component = asString(record.component) || 'unknown';

    if (!summary.byModel[model]) summary.byModel[model] = createBucket();
    if (!summary.byStage[stage]) summary.byStage[stage] = createBucket();
    if (!summary.byComponent[component]) summary.byComponent[component] = createBucket();

    const byModel = summary.byModel[model];
    byModel.calls += 1;
    byModel.inputTokens += inputTokens;
    byModel.outputTokens += outputTokens;
    byModel.totalTokens += totalTokens;
    byModel.cachedInputTokens += cachedInputTokens;

    const byStage = summary.byStage[stage];
    byStage.calls += 1;
    byStage.inputTokens += inputTokens;
    byStage.outputTokens += outputTokens;
    byStage.totalTokens += totalTokens;
    byStage.cachedInputTokens += cachedInputTokens;

    const byComponent = summary.byComponent[component];
    byComponent.calls += 1;
    byComponent.inputTokens += inputTokens;
    byComponent.outputTokens += outputTokens;
    byComponent.totalTokens += totalTokens;
    byComponent.cachedInputTokens += cachedInputTokens;
  }

  return summary;
}

function extractStoredStageArtifacts(snapshot: Record<string, unknown>): Stage45ReplayArtifacts | null {
  const stages = Array.isArray(snapshot.stages) ? snapshot.stages : [];
  const formatStage = stages.find(
    (stage) => stage && typeof stage === 'object' && asString((stage as Record<string, unknown>).stage) === 'format'
  ) as Record<string, unknown> | undefined;
  const output =
    formatStage && typeof formatStage.output === 'object' && formatStage.output
      ? (formatStage.output as Record<string, unknown>)
      : undefined;
  const stageArtifacts =
    output && typeof output.stageArtifacts === 'object' && output.stageArtifacts
      ? (output.stageArtifacts as Record<string, unknown>)
      : undefined;
  if (!stageArtifacts) return null;

  const stage3Items = Array.isArray(stageArtifacts.stage3Items)
    ? (stageArtifacts.stage3Items as Stage45ReplayArtifacts['stage3Items'])
    : undefined;
  const stage4Items = Array.isArray(stageArtifacts.stage4Items)
    ? (stageArtifacts.stage4Items as Stage45ReplayArtifacts['stage4Items'])
    : undefined;

  if ((!stage3Items || stage3Items.length === 0) && (!stage4Items || stage4Items.length === 0)) {
    return null;
  }

  return {
    stage3Items,
    stage4Items,
    stage37TicketUrl: asString(stageArtifacts.stage37TicketUrl) || undefined,
    contentType: asString(stageArtifacts.contentType) as Stage45ReplayArtifacts['contentType'],
  };
}

function selectReplayArtifacts(
  artifacts: Stage45ReplayArtifacts,
  replayFrom: ReplaySource
): Stage45ReplayArtifacts | null {
  const hasStage3 = Array.isArray(artifacts.stage3Items) && artifacts.stage3Items.length > 0;
  const hasStage4 = Array.isArray(artifacts.stage4Items) && artifacts.stage4Items.length > 0;
  if (!hasStage3 && !hasStage4) return null;

  if (replayFrom === 'stage4') {
    if (!hasStage4) return null;
    return {
      stage4Items: deepCloneJson(artifacts.stage4Items || []),
      stage3Items: hasStage3 ? deepCloneJson(artifacts.stage3Items || []) : undefined,
      stage37TicketUrl: artifacts.stage37TicketUrl,
      contentType: artifacts.contentType,
    };
  }

  if (replayFrom === 'stage3') {
    if (!hasStage3) return null;
    return {
      stage3Items: deepCloneJson(artifacts.stage3Items || []),
      stage37TicketUrl: artifacts.stage37TicketUrl,
      contentType: artifacts.contentType,
    };
  }

  if (hasStage3) {
    return {
      stage3Items: deepCloneJson(artifacts.stage3Items || []),
      stage37TicketUrl: artifacts.stage37TicketUrl,
      contentType: artifacts.contentType,
    };
  }

  return {
    stage4Items: deepCloneJson(artifacts.stage4Items || []),
    stage37TicketUrl: artifacts.stage37TicketUrl,
    contentType: artifacts.contentType,
  };
}

function buildReplayParseInput(snapshot: Record<string, unknown>): ParsePostInput {
  const rowMeta =
    snapshot.rowMeta && typeof snapshot.rowMeta === 'object'
      ? (snapshot.rowMeta as Record<string, unknown>)
      : {};

  const userName = asString(rowMeta.userName) || asString(snapshot.establishment);
  const pageName = asString(rowMeta.pageName) || userName;
  const timestamp = asString(rowMeta.timestamp) || new Date().toISOString();
  const uniqueId = asString(snapshot.uniqueId);

  return {
    combinedText: asString(snapshot.inputText),
    mediaUrls: asStringArray(rowMeta.mediaUrls),
    sharedPostThumbnails: asStringArray(rowMeta.sharedPostThumbnails),
    userName,
    pageName,
    timestamp,
    facebookUrl: asString(snapshot.facebookUrl),
    profilePicUrl: asString(rowMeta.profilePicUrl),
    extractedData: {
      id: uniqueId,
      postId: uniqueId,
      utcStartDate: asString(rowMeta.utcStartDate),
    },
  };
}

export const replayStage45FromSnapshot = onRequest(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'northamerica-northeast2',
    cors: true,
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const body = (request.body || {}) as ReplayStage45RequestBody;
    const snapshotDocId = asString(body.snapshotDocId);
    const replayFromRaw = asString(body.replayFrom).toLowerCase();
    const replayFrom: ReplaySource =
      replayFromRaw === 'stage3' || replayFromRaw === 'stage4' ? replayFromRaw : 'auto';
    const saveReplaySnapshot = body.saveReplaySnapshot !== false;
    const stage4Model = asString(body.stage4Model);
    const stage5Model = asString(body.stage5Model);

    if (!snapshotDocId) {
      response.status(400).json({ error: 'snapshotDocId is required' });
      return;
    }

    logger.setContext({
      functionName: 'replayStage45FromSnapshot',
      snapshotDocId,
    });

    try {
      const snapshot = await firestoreService.getParseSnapshotById(snapshotDocId);
      if (!snapshot) {
        response.status(404).json({ error: `Snapshot not found: ${snapshotDocId}` });
        return;
      }

      const stageArtifacts = extractStoredStageArtifacts(snapshot as unknown as Record<string, unknown>);
      if (!stageArtifacts) {
        response.status(400).json({
          error: 'Snapshot does not contain persisted stageArtifacts. Enable ENABLE_PARSE_SNAPSHOT_STAGE_ARTIFACTS=true for future runs.',
        });
        return;
      }

      const selectedArtifacts = selectReplayArtifacts(stageArtifacts, replayFrom);
      if (!selectedArtifacts) {
        response.status(400).json({
          error: `Requested replay source "${replayFrom}" is unavailable in snapshot artifacts.`,
        });
        return;
      }

      const parseInput = buildReplayParseInput(snapshot as unknown as Record<string, unknown>);
      const establishmentMap: Record<string, { address?: string; category?: string; facebookUrl?: string; name?: string }> = {};

      const snapshotVenueId = asString((snapshot as unknown as Record<string, unknown>).venueId);
      if (parseInput.facebookUrl && snapshotVenueId) {
        const venue = await firestoreService.getVenue(snapshotVenueId);
        if (venue) {
          establishmentMap[parseInput.facebookUrl] = {
            address: asString((venue as unknown as Record<string, unknown>).address),
            category: asString((venue as unknown as Record<string, unknown>).category),
            facebookUrl: parseInput.facebookUrl,
            name: asString((venue as unknown as Record<string, unknown>).name),
          };
        }
      }

      const gptUsageRecords: GptUsageRecord[] = [];
      let replayArtifactsSnapshot: ParseStageArtifactsSnapshot | undefined;
      const parserConfig: Partial<ParsingConfig> = {
        gptUsageHandler: (usage: GptUsageRecord) => {
          gptUsageRecords.push(usage);
        },
        stageArtifactsHandler: (artifactsSnapshot: ParseStageArtifactsSnapshot) => {
          replayArtifactsSnapshot = mergeStageArtifactsSnapshot(
            replayArtifactsSnapshot,
            artifactsSnapshot
          );
        },
      };
      if (stage4Model) parserConfig.stage4ModelOverride = stage4Model;
      if (stage5Model) parserConfig.stage5ModelOverride = stage5Model;

      const replayStart = Date.now();
      const replayEvents = await replayPostDataFromArtifacts(
        parseInput,
        establishmentMap,
        selectedArtifacts,
        parserConfig
      );
      const replayDurationMs = Date.now() - replayStart;
      const gptUsageSummary = summarizeGptUsageRecords(gptUsageRecords);

      let replaySnapshotDocId: string | undefined;
      if (saveReplaySnapshot) {
        replaySnapshotDocId = await firestoreService.saveParseSnapshot({
          fileId: asString((snapshot as unknown as Record<string, unknown>).fileId),
          fileName: asString((snapshot as unknown as Record<string, unknown>).fileName),
          batchNumber: Number((snapshot as unknown as Record<string, unknown>).batchNumber || 0) || 0,
          rowIndex: Number((snapshot as unknown as Record<string, unknown>).rowIndex || 0) || 0,
          uniqueId: asString((snapshot as unknown as Record<string, unknown>).uniqueId),
          venueId: asString((snapshot as unknown as Record<string, unknown>).venueId),
          establishment: asString((snapshot as unknown as Record<string, unknown>).establishment),
          facebookUrl: parseInput.facebookUrl,
          inputText: parseInput.combinedText,
          rowMeta: {
            pageName: parseInput.pageName,
            userName: parseInput.userName,
            timestamp: parseInput.timestamp,
            utcStartDate: asString(parseInput.extractedData?.utcStartDate),
            mediaUrls: parseInput.mediaUrls,
            sharedPostThumbnails: parseInput.sharedPostThumbnails,
            parserMode: 'stage45_replay',
            replaySource: replayFrom,
            sourceSnapshotDocId: snapshotDocId,
            stage4ModelOverride: stage4Model || null,
            stage5ModelOverride: stage5Model || null,
          },
          stages: [
            {
              stage: 'format',
              success: true,
              output: {
                parserMode: 'stage45_replay',
                eventCount: replayEvents.length,
                events: replayEvents,
                gptUsageSummary,
                stageArtifacts: replayArtifactsSnapshot,
              },
            },
          ],
        });
      }

      response.json({
        success: true,
        snapshotDocId,
        replaySnapshotDocId,
        replaySource: replayFrom,
        eventCount: replayEvents.length,
        replayDurationMs,
        gptUsageSummary,
      });
    } catch (error) {
      logger.error('replayStage45FromSnapshot failed', error);
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      logger.clearContext('functionName', 'snapshotDocId');
    }
  }
);
