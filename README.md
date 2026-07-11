## Features

Around mid-2026, Reddit started phasing out the ability to create posts and comments in the mobile app (on both iOS and Android) using Markdown. Mobile Markdown brings this functionality back, with some minor limitations.

On private or restricted subreddits, only approved users will be allowed to post. Banned users on any subreddit will be locked out of the app entirely. Furthermore, mods can choose whether or not to require post flair for posts by users (mod posts will never require flair).

The app also respects subreddit settings, such as allowed post types. If text posts are not allowed on your subreddit, only mods will be able to submit text posts. As expected, only mods will be able to comment on locked posts/comments.

## Usage Instructions

To create a new post in Markdown, visit a subreddit on the mobile app and tap the three dots ("...") at the upper right corner of the screen. Then, select "Create post in Markdown."

To create a new comment or reply, tap the three dots ("...") on the post or comment you want to reply to and select "Comment/reply in Markdown."

## Known issues/limitations

- Only the creation of new posts/comments is supported. Unfortunately, the Developer Platform does not currently support editing *existing* posts/comments.
- The app cannot automatically see whether or not post flair is required in your subreddit, but there *is* a separate app setting for this. Please ensure the app's setting matches your subreddit's setting.

---

## Changelog

### [0.0.5] Initial version (2026-07-11)

#### Features

- Create a new post or comment using Markdown, even on the Reddit mobile app.
- Choose whether or not to require post flair for posts by users.
- Configure the default line height for post/comment body fields (independently from each other).

#### Bug Fixes

None yet (initial version). Please send a private message to the developer (u/Chosen1PR) to report bugs.