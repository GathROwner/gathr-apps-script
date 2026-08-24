import { setGlobalOptions } from 'firebase-functions/v2/options';

export function runtimeSecretNamesForProject(projectId?: string): string[] {
  // The production app/user project predates the collision-free secret names.
  // Keep its established Secret Manager bindings while the public parser project
  // uses the newer GATHR_* names. Values never cross projects in application code.
  return projectId === 'gathr-m1'
    ? ['OPENAI_API_KEY', 'APIFY_TOKEN']
    : ['GATHR_OPENAI_API_KEY', 'GATHR_APIFY_TOKEN'];
}

function activeProjectId(env: NodeJS.ProcessEnv): string {
  if (env.GCLOUD_PROJECT) return env.GCLOUD_PROJECT;
  if (env.GCP_PROJECT) return env.GCP_PROJECT;
  try {
    return String(JSON.parse(env.FIREBASE_CONFIG || '{}')?.projectId || '');
  } catch {
    return '';
  }
}

export const coreRuntimeSecrets = runtimeSecretNamesForProject(activeProjectId(process.env));

// Keep the rest of the application on its established environment interface.
// The alias happens inside each new function revision after Secret Manager has
// injected the new collision-free names.
export function applyRuntimeSecretAliases(env: NodeJS.ProcessEnv): void {
  if (!env.OPENAI_API_KEY && env.GATHR_OPENAI_API_KEY) {
    env.OPENAI_API_KEY = env.GATHR_OPENAI_API_KEY;
  }
  if (!env.APIFY_TOKEN && env.GATHR_APIFY_TOKEN) {
    env.APIFY_TOKEN = env.GATHR_APIFY_TOKEN;
  }
}

applyRuntimeSecretAliases(process.env);

/**
 * These credentials were historically injected from `.env` into every
 * function. Bind them globally through Secret Manager instead so existing
 * runtime access via process.env remains available without deploying plaintext
 * copies or colliding with function-specific secret declarations.
 */
setGlobalOptions({
  secrets: coreRuntimeSecrets,
});
