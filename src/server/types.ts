// Type setting for post or comment
export type PostId = `t3_${string}`;
export type CommentId = `t1_${string}`;
export type PostOrCommentId = PostId | CommentId;