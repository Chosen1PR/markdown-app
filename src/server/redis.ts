import {redis} from "@devvit/web/server";

function getKeyForResources() {
  return `resources`;
}

function getKeyForSummoner(username: string) {
  return `summoner:${username}`;
}

// Helper function to cache the resources config to check for changes.
export async function cacheResources(resources: string) {
  try { await redis.set(getKeyForResources(), resources); }
  catch {}
}

// Helper function to get the cached resources config to check for updates.
export async function getCachedResources() {
  try { return await redis.get(getKeyForResources()) ?? ""; }
  catch { return ''; }
}

// Helper function to cache summoner and target ID.
export async function cacheSummoner(username: string, targetId: string) {
  try { await redis.hSet(getKeyForSummoner(username), { targetId: targetId }); }
  catch {}
}

// Helper function to get the cached target ID from the summoner's username.
export async function getTargetIdFromSummonerCache(username: string) {
  try { return await redis.hGet(getKeyForSummoner(username), 'targetId') ?? ''; }
  catch { return ''; }
}

// Helper function to delete the cached summoner data after a successful reply.
export async function deleteSummonerCache(username: string) {
  try { await redis.hDel(getKeyForSummoner(username), ['targetId']); }
  catch {}
}