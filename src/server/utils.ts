import {
  context,
  reddit,
  Post,
  Comment,
  FlairTemplate,
  SubredditInfo
} from "@devvit/web/server";

import { PostId, CommentId } from "./types";

// Helper function to check if a user is a mod of the subreddit
export async function isUserMod(username: string) {
  const user = await reddit.getUserByUsername(username);
  if (user == undefined || user == null) return false;
  const perms = await user.getModPermissionsForSubreddit(context.subredditName);
  return (perms != undefined && perms != null && perms.length > 0);
}

// Helper function to check if a user is banned from the subreddit
export async function isUserBanned(username: string) {
  const bannedUser = await reddit.getBannedUsers({ subredditName: context.subredditName, username: username }).all();
  return (bannedUser.length > 0);
}

// Helper function to check if a user is banned from the subreddit
export async function isUserApproved(username: string) {
  const approvedUser = await reddit.getApprovedUsers({ subredditName: context.subredditName, username: username }).all();
  return (approvedUser.length > 0);
}

// Helper function to check for conditions that would prevent a resource comment from being posted,
// and return an appropriate error message if any are found.
// Currently only checks for an existing pinned comment, but this could be expanded in the future.
export async function preCommentError(targetId: string) {
  if (targetId == undefined || targetId == '') {
    return "Error: Could not find the post/comment to reply to.";
  }
  return "none";
}

// Helper function to get the specific fields of a request.
// Returns empty string if value is not found.
export function getRequestBodyValue(body: any, ...paths: Array<string[]>) {
  for (const path of paths) {
    let current: any = body;
    let found = true;
    for (const key of path) {
      if (current == null || typeof current !== 'object' || !(key in current)) {
        found = false;
        break;
      }
      current = current[key];
    }
    if (found && current != null && current !== '') {
      return String(current);
    }
  }
  return '';
}

// Helper function for when Devvit is borked and shows an invalid username.
export function isValidUsername(username: string) {
  const name = username.toLowerCase();
  return (
    name != '[redacted]' &&
    name != '[deleted]' &&
    name != ''
  );
}

// Helper function for when Devvit is borked and shows an invalid user ID.
export function isValidUserId(userId: string) {
  return (userId != 't2_0' && userId != '');
}

// Helper function for when Devvit is borked and shows an invalid post or comment body.
export function isValidBody(commentBody: string) {
  const body = commentBody.toLowerCase();
  return (
    body != '[removed by reddit]' &&
    body != '[removed by moderator]' &&
    body != '[removed]' &&
    body != '[deleted]' &&
    body != ''
  );
}

// Helper function to get a post or comment object based on its ID.
export async function getPostOrComment(id: string): Promise<Post | Comment | undefined> {
  if (id.startsWith('t3_'))
    return await reddit.getPostById(id as PostId);
  else if (id.startsWith('t1_'))
    return await reddit.getCommentById(id as CommentId);
  else return;
}

// Helper function to determine if post flairs are both enabled and self-assignable in a subreddit.
export function arePostFlairsAllowed(subreddit: SubredditInfo) {
  const flairSettings = subreddit.postFlairSettings;
  // Fall back to true, in case there is any issue with Devvit not having the information we need
  // (e.g., undefined properties).
  let flairsAllowed = true;
  if (flairSettings) {
    const isEnabled = flairSettings.isEnabled ?? true;
    const isSelfAssignable = flairSettings.isSelfAssignabled ?? true;
    flairsAllowed = (isEnabled && isSelfAssignable);
  }
  return flairsAllowed;
}

// Helper function to determine if a subreddit allows text posts.
export function areTextPostsAllowed(subreddit: SubredditInfo) {
  const postTypes = subreddit.allAllowedPostTypes;
  if (!postTypes) return false;
  for (const type of postTypes) {
    if (type.toLowerCase() == 'text') return true;
  }
  return false;
}

// Helper function to determine if an unbanned user is allowed to post.
// Should not be called on banned users or mods.
export async function isUnbannedUserAllowedToPost(username: string, subreddit: SubredditInfo) {
  const subType = subreddit.type ?? 'public';
  if (subType.toLowerCase() == 'public') return true;
  const postingIsRestricted = subreddit.isPostingRestricted ?? false;
  if (postingIsRestricted) {
    return await isUserApproved(username);
  }
  else return true;
}

// Helper function to determine if an unbanned user is allowed to comment.
// Should not be called on banned users or mods.
export async function isUnbannedUserAllowedToComment(username: string, subreddit: SubredditInfo) {
  const subType = subreddit.type ?? 'public';
  if (subType.toLowerCase() == 'public') return true;
  const commentingIsRestricted = subreddit.isCommentingRestricted ?? false;
  if (commentingIsRestricted) {
    return await isUserApproved(username);
  }
  else return true;
}

// Helper function to filter out mod-only post flairs for user posts.
export function filterPostFlairsForNonMods(flairTemplates: FlairTemplate[]) {
  let templates: FlairTemplate[] = [];
  for (const template of flairTemplates) {
    if (!template.modOnly) templates.push(template);
  }
  return templates;
}