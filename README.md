## Features

This app allows users to reply to a post or comment with a helpful resource that is saved at the subreddit level by moderators. The app account will reply with a saved resource similar to how AutoModerator can reply with a pre-defined comment when summoned by a specific keyword or command (e.g., "!summon"). With Resource Reply, however, you can leave out those clunky commands and simply use a menu item from a post or comment's context menu (a.k.a. the "..." menu). This also ensures that the app account replies directly to the original poster or commenter, and not the user who summoned it.

Additionally, mods can choose:

- whether to allow users to pin a resource comment to a post if they're replying directly to it.
- whether to lock replies to resource comments by default.
- whether to hide their username and simply share the resource as the app account.

To prevent abuse, the app account will still name the user who summoned it. Banned users will also be unable to summon the app.

---

## User Instructions

To summon the app and make it comment a resource on a post or comment:

1. Locate the context menu for the post or comment you want to reply to. The button for this typically looks like three dots ("...").
2. Scroll down to "Reply with resource."
3. Select a resource via its title in the drop-down.
4. Choose whether or not you want to pin the resource to the post. In some cases, this option may not be available.
5. Click OK. That's it!

If you wish to delete the comment (for example, if you accidentally selected the wrong resource), simply comment "!delete" (without quotes).

*Note: When mods delete comments this way, they are fully deleted from Reddit. When **users** delete comments this way, they simply remove them from public view, but mods can still see them.*

---

## Mod Instructions

After installation, you will be taken to the app settings screen. This screen can also be reached from the subreddit-level menu item. From this screen, most settings are self-explanatory, but to add or edit your resources, you'll want to look for the "Resource Configuration" field. You can expand this field for easier editing by dragging the lower right corner.

The only reserved keyword for the start of a line is `title: `, in lower case and with a trailing colon *and* single space. After `title: ` (which again, includes a space after the colon), you can declare your resource's title. This is what users will see when selecting a resource from the "Reply with resource" form. After the title has been declared, the next line onward contains the comment body, formatted in [Markdown](https://support.reddithelp.com/hc/en-us/articles/360043033952-Formatting-Guide#h_01HEK5SNJM44XVSJFH0BT5QS9X).

To separate resources, start a line with four dashes (`----`). This way, you can still use three dashes in your resource's Markdown to achieve a horizontal rule. Additionally, Resource Reply is "smart" enough to trim leading and trailing line breaks for comment bodies, so you can play around with line spacing to keep everything as neat as you'd like. For example, all of the resources in the example below are valid and will show up with no formatting errors.

    title: Test Title 1
    This is the first test comment body.
    ----
    title: Test Title 2
    
    This is the second comment body.
    
    Some more text here.
    
    ----
    
    title: Test Title 3
    
    This is the third comment body.

    Even more text down here.

Keep in mind, this flexible spacing **only** works with line breaks and **not** other space or space-like characters (e.g., ` `). To ensure proper app function, make sure there are no unnecessary indentations in your config.

Resources are **not** backed up anywhere, so if you need to uninstall and reinstall the app for whatever reason, back them up locally or on a wiki page in your subreddit. Either way, it'd be a good idea to have a wiki page or pinned post on your subreddit with full details on all resources, so that users may be able to more effectively use them, with or without the app.

---

## Changelog

### [0.2.4] Initial version (2026-05-20)

#### Features

- Allow users to reply with a helpful resource in the form of a pre-defined comment.
- Define resources by title and comment body.

#### Bug Fixes

None yet (initial version). Please send a private message to the developer (u/Chosen1PR) to report bugs.