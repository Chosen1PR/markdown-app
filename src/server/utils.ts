import {
  context,
  reddit,
  settings,
} from "@devvit/web/server";
import { PostOrCommentId, PostId, SubredditResource } from "./types";

import { Readable } from "node:stream";
import * as readline from "node:readline";

// Helper function to get filtered list of resources
export async function getAllResources() {
  // Get full list of Resources from the app settings
  const resourcesConfig = (await settings.get("resourceConfig")) as string;
  if (resourcesConfig == undefined || resourcesConfig.trim() == "") return [];
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
    else if (line.startsWith("title: ")) {
      resourceTitle = line.substring("title: ".length);
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
  const userIsMod = await isUserAMod(summonerUsername);
  if (userIsMod) {
    const anonymizeMods = (await settings.get("anonymizeMods")) as boolean;
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
  const posttext = `\n\n*I am a bot that has been summoned by u/${summonerUsername}. `
    + `If u/${summonerUsername} wishes to delete this comment, they can reply "!delete" (without quotes). `
    + `If this comment is inappropriate, please report it and the moderator(s) will review.*`;
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
  const lockComment = (await settings.get("lockReply")) as boolean;
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
export async function isUserAMod(username: string) {
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
  if (targetId != undefined && targetId.startsWith("t3_")) {
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