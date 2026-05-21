import express from "express";
import {
  createServer,
  context,
  getServerPort,
  reddit,
  settings,
} from "@devvit/web/server";

import type { CommentId, SubredditResource } from "./types";

import { getAllResources, isUserAMod, commentResource, isUserBanned, preCommentError } from "./utils";

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
  const targetId = req.body.targetId! as string;
  const isPost = targetId.startsWith("t3_");
  if (await isUserBanned(summonerName)) {
    res.json({
      showToast: 'You are banned from this subreddit and cannot suggest resources.'
    });
    return;
  }
  var pinSetting = (await settings.get("pinReply")) as boolean;
  if (await isUserAMod(summonerName))
    pinSetting = true; // Always enable option to pin for mods
  const resources = await getAllResources();
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
          },
          {
            type: 'string',
            name: 'targetId',
            label: 'Post/comment ID',
            helpText: 'This is the ID of the post or comment you are replying to.',
            defaultValue: targetId,
            required: true,
            disabled: true
          },
          /*{
            type: 'string',
            name: 'id',
            label: 'ID',
            disabled: true,
            defaultValue: targetId
          },
          {
            type: 'string',
            name: 'username',
            label: 'Username',
            disabled: true,
            defaultValue: username
          },*/
        ],
      },
      acceptLabel: 'Submit',
      cancelLabel: 'Cancel',
      data: {
        pinReply: pinSetting,
        
      }
    },
  });
});

// Form submission handler which can launch second form for editing saved response comment
router.post("/internal/forms/comment-resource-submit", async (req, res) => {
  const { resource, pinReply, summonerName, targetId } = req.body;
  //const id = await redis.hGet(modUsername, 'id') as string;
  try {
    const preCommentErr = await preCommentError(targetId, pinReply);
    if (preCommentErr == "none") {
      await commentResource(resource, targetId, summonerName, pinReply);
      res.json({
        showToast: 'Resource submitted as comment!'
      });
    }
    else {
      res.json({
        showToast: preCommentErr
      });
    }
  }
  catch (error) {
    res.json({
      showToast: 'Error: Could not submit comment.'
    });
    console.log(error);
  }
});

router.post('/internal/triggers/on-comment-create', async (req, _res) => {
  //console.log(`Full Comment JSON:\n${JSON.stringify(req.body, null, 2)}`);
  //const commentId = req.body.comment.id as CommentId;
  const commentBody = req.body.comment.body as string;
  const commentAuthorName = req.body.author.name as string;
  //const commentAuthorId = req.body.author.id as string;
  const parentId = req.body.comment.parentId as string;
  if (parentId.startsWith('t3_')) return;
  if (commentBody != undefined && commentBody.trim().toLowerCase().startsWith('!delete')) {
    const parentComment = await reddit.getCommentById(parentId as CommentId);
    if (parentComment == undefined || parentComment == null) return;
    if (parentComment.authorName != context.appSlug) return;
    var summonerName = "";
    if (parentComment.body.startsWith('u/'))
      summonerName = parentComment.body.substring(2, parentComment.body.indexOf(' '));
    const userIsMod = await isUserAMod(commentAuthorName);
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