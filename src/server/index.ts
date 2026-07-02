import express from "express";

import {
  createServer,
  context,
  getServerPort,
  reddit,
  settings,
  Comment
} from "@devvit/web/server";

import type { CommentId, SubredditResource } from "./types";

import {
  getAllResources,
  isUserMod,
  commentResource,
  isUserBanned,
  preCommentError,
  getPostOrComment,
  getRequestBodyValue,
  isValidCommentBody,
  isValidUsername
} from "./utils";

import {
  cacheSummoner,
  getTargetIdFromSummonerCache,
  deleteSummonerCache
} from "./redis";

//import type { Request, Response } from 'express';
//import { UiResponse } from '@devvit/web/shared';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// Menu item for app settings
router.post("/internal/menu/app-settings", async (_req, res): Promise<void> => {
  res.json({
    navigateTo: `https://developers.reddit.com/r/${context.subredditName}/apps/${context.appSlug}`,
  });
});

// Menu item which launches Comment Resource form
router.post("/internal/menu/comment-resource", async (req, res) => {
  const summonerName = context.username!;
  const targetId = getRequestBodyValue(req.body, ['targetId']);
  const isPost = targetId.startsWith("t3_");
  if (await isUserBanned(summonerName)) {
    res.json({
      showToast: 'You are banned from this subreddit and cannot suggest resources.'
    });
    return;
  }
  let targetKind = '';
  if (targetId.startsWith('t3_')) targetKind = 'post';
  else if (targetId.startsWith('t1_')) targetKind = 'comment';
  else {
    res.json({
      showToast: `Error: Could not find target post/comment.`
    });
    return;
  }
  const targetPostOrComment = await getPostOrComment(targetId);
  if (!targetPostOrComment) {
    res.json({
      showToast: `Error: Could not find target ${targetKind}.`
    });
    return;
  }
  const targetAuthorIsMod = await isUserMod(targetPostOrComment.authorName);
  const summonerIsMod = await isUserMod(summonerName);
  if (targetPostOrComment.isLocked() && !summonerIsMod) {
    res.json({
      showToast: `This ${targetKind} is locked.`
    });
    return;
  }
  const allowRepliesToMods = await settings.get<boolean>('allowRepliesToMods'),
  allowOnModSubmissions = await settings.get<boolean>('allowOnModSubmissions');
  if (!allowRepliesToMods || !allowOnModSubmissions) {
    if (targetAuthorIsMod && !summonerIsMod) {
      res.json({
        showToast: `Resource replies to mods are not allowed.`
      });
      return;
    }
  }
  if (targetKind == 'comment') {
    const parentPost = await reddit.getPostById((targetPostOrComment as Comment).postId);
    if (!parentPost) {
      res.json({
        showToast: `Error: Could not find parent post.`
      });
      return;
    }
    if (parentPost.isLocked() && !summonerIsMod) {
      res.json({
        showToast: `This post is locked.`
      });
      return;
    }
    if (!allowOnModSubmissions) {
      const parentPostIsByMod = await isUserMod(parentPost.authorName);
      if (parentPostIsByMod && !summonerIsMod) {
        res.json({
          showToast: `Resource replies are not allowed on mod posts.`
        });
        return;
      }
    }
  }
  var pinSetting = await settings.get<boolean>("pinReply") ?? false;
  if (summonerIsMod)
    pinSetting = true; // Always enable option to pin for mods
  const resources = await getAllResources();
  if (resources.length == 0) {
    res.json({
      showToast: 'This community has not set up resources yet.'
    });
    return;
  }
  await cacheSummoner(summonerName, targetId);
  res.json({
    showForm: {
      name: 'commentResourceForm',
      form: {
        title: 'Reply with resource',
        fields: [
          {
            type: 'select',
            name: 'resource',
            label: 'Select a resource',
            options: resources.map((resources: SubredditResource) => ({
              label: resources.title,
              value: resources.body,
            })),
            required: true,
          },
          {
            type: 'boolean',
            name: 'pinReply',
            label: 'Pin reply',
            helpText: 'Only applicable when replying to a post. Setting may be disabled by mods.',
            defaultValue: false,
            disabled: (!pinSetting || !isPost)
          },
          {
            type: 'string',
            name: 'summonerName',
            label: 'Your username',
            helpText: 'This will be included in the comment to indicate who suggested the resource.',
            defaultValue: context.username!,
            required: true,
            disabled: true
          }/*,
          {
            type: 'string',
            name: 'targetId',
            label: 'Post/comment ID',
            helpText: 'This is the ID of the post or comment you are replying to.',
            defaultValue: targetId,
            required: true,
            disabled: true
          }*/
        ],
      },
      acceptLabel: 'Submit',
      cancelLabel: 'Cancel',
      data: {
        pinReply: pinSetting
      }
    },
  });
});

// Form submission handler which can launch second form for editing saved response comment
router.post("/internal/forms/comment-resource-submit", async (req, res) => {
  const { resource, pinReply, summonerName } = req.body;
  const targetId = await getTargetIdFromSummonerCache(summonerName);
  try {
    const preCommentErr = await preCommentError(targetId, pinReply);
    if (preCommentErr == "none") {
      await commentResource(resource, targetId, summonerName, pinReply);
      res.json({
        showToast: 'Resource submitted as comment'
      });
    }
    else {
      res.json({
        showToast: preCommentErr
      });
    }
    await deleteSummonerCache(summonerName);
  }
  catch (error) {
    res.json({
      showToast: 'Error: Could not submit comment.'
    });
    await deleteSummonerCache(summonerName);
    console.log(error);
  }
});

router.post('/internal/triggers/on-comment-create', async (req, _res) => {
  //console.log(`Full Comment JSON:\n${JSON.stringify(req.body, null, 2)}`);
  const commentId = getRequestBodyValue(req.body, ['comment', 'id']),
  //commentAuthorId = getRequestBodyValue(req.body, ['author', 'id']);
  parentId = getRequestBodyValue(req.body, ['comment', 'parentId']);
  if (parentId.startsWith('t3_')) return;
  let commentBody = getRequestBodyValue(req.body, ['comment', 'body']),
  commentAuthorName = getRequestBodyValue(req.body, ['author', 'name']);
  const validAuthorName = isValidUsername(commentAuthorName),
  validCommentBody = isValidCommentBody(commentBody);
  if (!validAuthorName || !validCommentBody) {
    const comment = await reddit.getCommentById(commentId as CommentId);
    if (comment) {
      if (!validAuthorName) commentAuthorName = comment.authorName;
      if (!validCommentBody) commentBody = comment.body;
    }
  }
  if (commentBody.trim().toLowerCase().startsWith('!delete')) {
    const parentComment = await reddit.getCommentById(parentId as CommentId);
    if (parentComment == undefined || parentComment == null) return;
    if (parentComment.authorName != context.appSlug) return;
    var summonerName = '';
    if (parentComment.body.startsWith('u/'))
      summonerName = parentComment.body.substring(2, parentComment.body.indexOf(' '));
    const userIsMod = await isUserMod(commentAuthorName);
    const userIsSummoner = (commentAuthorName == summonerName);
    if (userIsMod) {
      await parentComment.delete();
    }
    else if (userIsSummoner) {
      await parentComment.remove();
    }
  }
});

// Trigger handler for app upgrades
router.post('/internal/triggers/on-app-upgrade', async (_req, _res) => {
  //const installer = req.body.installer;
  //console.log('Installer:', JSON.stringify(installer, null, 2));
  //res.status(200).json({ status: 'ok' });
});

app.use(router);

const server = createServer(app);
server.on("error", (err) => console.error(`server error: ${err.stack}`));
server.listen(getServerPort());