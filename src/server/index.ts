import express from "express";

import {
  createServer,
  context,
  getServerPort,
  reddit,
  settings,
  Comment,
  FlairTemplate
} from "@devvit/web/server";

import type { PostOrCommentId } from "./types";

import {
  isUserMod,
  isUserBanned,
  preCommentError,
  getPostOrComment,
  getRequestBodyValue,
  arePostFlairsAllowed,
  areTextPostsAllowed,
  isUnbannedUserAllowedToComment,
  isUnbannedUserAllowedToPost,
  filterPostFlairsForNonMods
} from "./utils";

import {
  cacheNewComment,
  getTargetIdFromCommentCache,
  deleteCommentCache
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

// Menu item which launches Create Post form
router.post("/internal/menu/create-post", async (_req, res) => {
  const username = context.username!;
  const subredditName = context.subredditName!;
  if (await isUserBanned(username)) {
    res.json({
      showToast: `You are banned from r/${subredditName}.`
    });
    return;
  }
  const subreddit = await reddit.getSubredditInfoByName(subredditName);
  const userIsMod = await isUserMod(username);
  if (!userIsMod) {
    const textPostsAllowed = areTextPostsAllowed(subreddit);
    if (!textPostsAllowed) {
      res.json({
        showToast: `Text posts are not allowed in r/${subredditName}.`
      });
      return;
    }
    const allowedToPost = await isUnbannedUserAllowedToPost(username, subreddit);
    if (!allowedToPost) {
      res.json({
        showToast: `You are not allowed to post in r/${subredditName}.`
      });
      return;
    }
  }
  const flairsAllowed = arePostFlairsAllowed(subreddit);
  let flairTemplates = await reddit.getPostFlairTemplates(subredditName);
  if (flairTemplates) {
    if (!userIsMod) flairTemplates = filterPostFlairsForNonMods(flairTemplates);
  }
  else flairTemplates = [];
  const flairRequired = await settings.get<boolean>('requirePostFlair') ?? false;
  const postBodyHeight = await settings.get<number>('postBodyHeight') ?? 10;
  res.json({
    showForm: {
      name: 'createPost',
      form: {
        title: 'Create post',
        fields: [
          {
            type: 'string',
            name: 'postTitle',
            label: 'Post title',
            required: true,
          },
          {
            type: 'select',
            name: 'postFlair',
            label: 'Post flair',
            options: flairTemplates.map((templates: FlairTemplate) => ({
              label: templates.text,
              value: templates.id,
            })),
            required: (flairRequired && !userIsMod),
            disabled: (!flairsAllowed || flairTemplates.length == 0)
          },
          {
            type: 'paragraph',
            name: 'postBody',
            label: 'Post body',
            helpText: 'Write your post text in Markdown.',
            lineHeight: postBodyHeight,
            required: true,
          }
        ],
      },
      acceptLabel: 'Submit',
      cancelLabel: 'Cancel'
    },
  });
});

// Form submission handler which creates a new post
router.post("/internal/forms/create-post-submit", async (req, res) => {
  let { postTitle, postBody, postFlair } = req.body;
  const username = context.username!;
  const subredditName = context.subredditName!;
  let permalink = '';
  const replaceEmDash = await settings.get<boolean>('replaceEmDash');
  if (replaceEmDash)
    postBody = (postBody as string).replace(/—-/g, '---');
  try {
    if (postFlair != undefined && String(postFlair) != '') {
      const post = await reddit.submitPost({
        runAs: 'USER',
        subredditName: subredditName,
        title: postTitle as string,
        text: postBody as string,
        flairId: String(postFlair)
      });
      permalink = post.permalink;
    }
    else { // no flair
      const post = await reddit.submitPost({
        runAs: 'USER',
        subredditName: subredditName,
        title: postTitle as string,
        text: postBody as string
      });
      permalink = post.permalink;
    }
    res.json({
      navigateTo: `https://www.reddit.com${permalink}`
    });
    await deleteCommentCache(username);
  }
  catch (error) {
    res.json({
      showToast: 'Error: Could not submit post.'
    });
    await deleteCommentCache(username);
    console.log(error);
  }
});

// Menu item which launches Create Comment form
router.post("/internal/menu/create-comment", async (req, res) => {
  const username = context.username!;
  const subredditName = context.subredditName!;
  const targetId = getRequestBodyValue(req.body, ['targetId']);
  if (await isUserBanned(username)) {
    res.json({
      showToast: `You are banned from r/${subredditName}.`
    });
    return;
  }
  const subreddit = await reddit.getSubredditInfoByName(subredditName);
  const userIsMod = await isUserMod(username);
  if (!userIsMod) {
    const allowedToComment = await isUnbannedUserAllowedToComment(username, subreddit);
    if (!allowedToComment) {
      res.json({
        showToast: `You are not allowed to comment in r/${subredditName}.`
      });
      return;
    }
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
  if (targetPostOrComment.isLocked() && !userIsMod) {
    res.json({
      showToast: `This ${targetKind} is locked.`
    });
    return;
  }
  if (targetKind == 'comment') {
    const parentPost = await reddit.getPostById((targetPostOrComment as Comment).postId);
    if (!parentPost) {
      res.json({
        showToast: `Error: Could not find parent post.`
      });
      return;
    }
    if (parentPost.isLocked() && !userIsMod) {
      res.json({
        showToast: `This post is locked.`
      });
      return;
    }
  }
  await cacheNewComment(username, targetId);
  const commentBodyHeight = await settings.get<number>('commentBodyHeight') ?? 6;
  res.json({
    showForm: {
      name: 'createComment',
      form: {
        title: 'Create comment',
        fields: [
          {
            type: 'paragraph',
            name: 'commentBody',
            label: 'Comment body',
            helpText: 'Write your comment body in Markdown.',
            lineHeight: commentBodyHeight,
            required: true
          }
        ],
      },
      acceptLabel: 'Submit',
      cancelLabel: 'Cancel'
    },
  });
});

// Form submission handler which creates a new comment
router.post("/internal/forms/create-comment-submit", async (req, res) => {
  let commentBody = req.body.commentBody as string;
  const username = context.username!;
  const targetId = await getTargetIdFromCommentCache(username);
  const replaceEmDash = await settings.get<boolean>('replaceEmDash');
  if (replaceEmDash)
    commentBody = commentBody.replace(/—-/g, '---');
  try {
    const preCommentErr = await preCommentError(targetId);
    if (preCommentErr == "none") {
      await reddit.submitComment({
        id: targetId as PostOrCommentId,
        runAs: 'USER',
        text: commentBody
      });
      res.json({
        showToast: 'Comment submitted'
      });
    }
    else {
      res.json({
        showToast: preCommentErr
      });
    }
    await deleteCommentCache(username);
  }
  catch (error) {
    res.json({
      showToast: 'Error: Could not submit comment.'
    });
    await deleteCommentCache(username);
    console.log(error);
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