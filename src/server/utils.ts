import {
  context,
  reddit,
  settings,
  Post,
  Comment
} from "@devvit/web/server";

import { cacheResources, getCachedResources } from "./redis";

import { PostOrCommentId, PostId, CommentId, SubredditResource } from "./types";

import { Readable } from "node:stream";
import * as readline from "node:readline";

// Helper function to get filtered list of resources
export async function getAllResources() {
  // Get full list of Resources from the app settings
  const resourcesConfig = await settings.get<string>("resourceConfig");
  if (resourcesConfig == undefined || resourcesConfig.trim() == "") return [];
  const backupToWiki = await settings.get<boolean>('backupToWiki');
  if (backupToWiki) await backupResourcesToWikiIfUpdated(resourcesConfig);
  const allResources: SubredditResource[] = [];
  const stream = Readable.from(resourcesConfig);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  var resourceTitle = "";
  var resourceBody = "";
  for await (const line of rl) {
    if (line.startsWith("----")) {
      if (resourceTitle.trim() != "" && resourceBody.trim() != "") {
        allResources.push({title: resourceTitle, body: trimNewlines(resourceBody)});
        resourceTitle = "";
        resourceBody = "";
      }
    }
    else if (isResourceTitle(line)) {
      resourceTitle = extractTitleFromLine(line);
      resourceBody = "";
    }
    else {
      resourceBody += line + "\n";
    }
  }
  // Add final resource if config doesn't end with "---"
  if (resourceTitle.trim() != "" && resourceBody.trim() != "") {
    allResources.push({title: resourceTitle, body: trimNewlines(resourceBody)});
  }
  // Return constructed list of resources
  return allResources;
}

// Helper function to build the comment body for a resource suggestion
export async function buildResourceComment(resourceText: string, summonerUsername: string) {
  const userIsMod = await isUserMod(summonerUsername);
  if (userIsMod) {
    const anonymizeMods = await settings.get<boolean>("anonymizeMods");
    if (anonymizeMods) {
      return resourceText.toString();
    }
    else {
      return buildResourceCommentAsUser(resourceText, summonerUsername);
    }
  }
  else return buildResourceCommentAsUser(resourceText, summonerUsername);
}

// Helper function to build comment body when the summoner is not a mod (or mods are not anonymized)
function buildResourceCommentAsUser(resourceText: string, summonerUsername: string) {
  const pretext = `u/${summonerUsername} has suggested the following resource:\n\n`;
  var posttext = `\n\n^*I am a bot that was summoned by user ${summonerUsername}. `
    + `If ${summonerUsername} wishes to delete this comment, they can reply "!delete" \\(without quotes or spaces). `
    + `If this comment is inappropriate, please report it and the moderator(s) will review.*`;
  posttext = posttext.replace(/ /g, `&nbsp;`);
  //posttext = posttext.replace(/ /g, ` ^`);
  return pretext + resourceText + posttext;
}

// Helper function to submit the resource comment and handle pinning/locking
export async function commentResource(resourceText: string, targetId: string, summonerUsername: string, pinComment: boolean) {
  const commentBody = await buildResourceComment(resourceText, summonerUsername);
  const newComment = await reddit.submitComment({
    id: targetId as PostOrCommentId,
    text: commentBody,
    runAs: 'APP'
  });
  await newComment.distinguish(pinComment); // Always distinguish as mod; optionally pin.
  const lockComment = await settings.get<boolean>("lockReply");
  if (lockComment)
    await newComment.lock();
  return newComment;
}

// Helper function to trim newlines from the start and end of a string
export function trimNewlines(text: string) {
  var trimmedText = text;
  while (trimmedText.startsWith("\n")) {
    trimmedText = trimmedText.substring(1);
  }
  while (trimmedText.endsWith("\n")) {
    trimmedText = trimmedText.substring(0, trimmedText.length - 1);
  }
  return trimmedText;
}

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

// Helper function to check for conditions that would prevent a resource comment from being posted,
// and return an appropriate error message if any are found.
// Currently only checks for an existing pinned comment, but this could be expanded in the future.
export async function preCommentError(targetId: string, pinComment: boolean) {
  if (targetId == undefined || targetId == '') {
    return "Error: Could not find the post/comment to reply to.";
  }
  else if (targetId.startsWith("t3_")) {
    const post = await reddit.getPostById(targetId as PostId);
    const comments = await post.comments.all();
    for (const comment of comments) {
      if (pinComment) {
        if (comment.isStickied()) {
          return "There is already a pinned comment on this post.";
        }
      }
    }
  }
  return "none";
}

// Helper function to determine if a config line contains a resource title.
function isResourceTitle(line: string) {
  // Regex breakdown:
  // ^#{0,6}  - Matches 0 to 6 leading '#' symbols at the start of the line
  // title:\s - Matches the literal 'title:' followed by a single space
  // .+       - Captures everything else
  const titleRegex = /^#{0,6}title:\s.+/;
  return titleRegex.test(line);
}

// Helper function to extract a resource title from a config line.
function extractTitleFromLine(line: string): string {
  // Regex breakdown:
  // ^#{0,6}   - Matches 0 to 6 leading '#' symbols at the start of the line
  // title:\s* - Matches the literal 'title:' followed by any optional spaces
  // (.*)$     - Captures everything else until the end of the line
  const titleRegex = /^#{0,6}title:\s+(.*)$/;
  const match = line.match(titleRegex);
  if (match != null && match[1] != null && match[1] != undefined) {
    return match[1].trim();
  }
  else return "";
}

// Helper function to backup resources to a wiki page if they've been updated.
async function backupResourcesToWikiIfUpdated(resourcesConfig: string) {
  const cachedResources = (await getCachedResources()) ?? "";
  if (cachedResources != resourcesConfig) {
    await cacheResources(resourcesConfig);
    try {
      await reddit.updateWikiPage({
        subredditName: context.subredditName,
        page: 'resource-reply',
        content: resourcesConfig,
        reason: 'Automatic backup'
      });
      return true;
    }
    catch (error) {
      console.log("Error: Could not back up to wiki page.");
      return false;
    }
  }
  else return false;
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
export function isValidCommentBody(commentBody: string) {
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