import {onSchedule} from 'firebase-functions/v2/scheduler';import * as admin from 'firebase-admin';
import {runFestivalLinkWorker} from '../services/festivalLinkWorker.js';import {logger} from '../utils/logger.js';
if(!admin.apps.length)admin.initializeApp();
/** Separate post-parse function: never changes any parser's model, queue or prompts. */
export const scheduledFestivalLinker=onSchedule({schedule:'every 5 minutes',timeZone:'America/Halifax',region:'northamerica-northeast1',timeoutSeconds:540,memory:'512MiB',maxInstances:1},async()=>{
 const mode=process.env.FESTIVAL_LINKER_MODE||'off';if(mode!=='shadow'&&mode!=='publish'){logger.info('Festival linker disabled');return;}
 const result=await runFestivalLinkWorker(admin.firestore(),{mode,apiKey:process.env.OPENAI_API_KEY||process.env.GATHR_OPENAI_API_KEY});
 logger.info('Festival linker result',{mode:result.mode,status:result.status,fileId:result.fileId||null,eventWrites:result.eventWrites,paidSources:result.paidSources||0});
});
