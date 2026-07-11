import {redis} from "@devvit/web/server";

function getKeyForComment(username: string) {
  return `commenter:${username}`;
}

// Helper function to cache summoner and target ID.
export async function cacheNewComment(username: string, targetId: string) {
  try { await redis.hSet(getKeyForComment(username), { targetId: targetId }); }
  catch {}
}

// Helper function to get the cached target ID from the summoner's username.
export async function getTargetIdFromCommentCache(username: string) {
  try { return await redis.hGet(getKeyForComment(username), 'targetId') ?? ''; }
  catch { return ''; }
}

// Helper function to delete the cached summoner data after a successful reply.
export async function deleteCommentCache(username: string) {
  try { await redis.hDel(getKeyForComment(username), ['targetId']); }
  catch {}
}