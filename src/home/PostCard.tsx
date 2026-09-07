import { Link } from "react-router-dom";
import { displayNameForFeedItem, type FeedItem } from "../feed/model";
import { PublicImage } from "../media/PublicImage";
import type { PublicImages } from "../media/public";
export function postRoute(item: FeedItem) {
  return `/post/${encodeURIComponent(item.post.author)}/${encodeURIComponent(item.post.id)}`;
}
function safeWebsite(url: string) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
export function PostCard({
  item,
  images,
  showLink = true
}: {
  item: FeedItem;
  images: PublicImages;
  showLink?: boolean;
}) {
  const { post } = item;
  const name = displayNameForFeedItem(item);
  return (
    <article className="post-card" aria-label={`Post by ${name}`}>
      <header>
        <span className="person-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <Link to={`/profile/${encodeURIComponent(post.author)}`}>{name}</Link>
          <p>
            <time dateTime={post.createdAt}>
              {new Date(post.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
              })}
            </time>
            <span> · Public</span>
          </p>
        </div>
      </header>
      {post.title && <h2>{post.title}</h2>}
      {post.body && <p className="post-body">{post.body}</p>}
      {(post.attachments?.length || 0) > 0 && (
        <div className="post-gallery">
          {post.attachments?.map((attachment) => (
            <PublicImage expandable key={attachment.id} attachment={attachment} images={images} />
          ))}
        </div>
      )}
      {post.link && safeWebsite(post.link.url) && (
        <a className="post-link-card" href={post.link.url} target="_blank" rel="noreferrer">
          <strong>{post.link.title}</strong>
          <span>{new URL(post.link.url).hostname}</span>
        </a>
      )}
      {showLink && (
        <footer>
          <Link className="text-action" to={postRoute(item)}>
            View conversation
          </Link>
        </footer>
      )}
    </article>
  );
}
