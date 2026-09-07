import { Link } from "react-router-dom";
import { MessageSquare, Reply, UserRoundCheck, Check } from "lucide-react";
import type { ActivityItem } from "./model";
const icons = { message: MessageSquare, reply: Reply, contact: UserRoundCheck };
export function ActivityList({
  items,
  pending,
  onRead
}: {
  items: ActivityItem[];
  pending: boolean;
  onRead(ids: string[]): void;
}) {
  const groups = [
    {
      title: "Today",
      items: items.filter(
        (item) => new Date(item.createdAt).toDateString() === new Date().toDateString()
      )
    },
    {
      title: "Earlier",
      items: items.filter(
        (item) => new Date(item.createdAt).toDateString() !== new Date().toDateString()
      )
    }
  ];
  return (
    <>
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section className="activity-group" key={group.title} aria-label={group.title}>
            <h2>{group.title}</h2>
            <ol>
              {group.items.map((item) => {
                const Icon = icons[item.kind];
                return (
                  <li key={item.id} data-unread={item.unread}>
                    <span className="activity-icon" aria-hidden="true">
                      <Icon size={19} />
                    </span>
                    <Link className="activity-destination" to={item.route}>
                      <p>
                        <strong>{item.name}</strong> {item.description}
                      </p>
                      <span className="activity-preview">{item.preview}</span>
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </time>
                    </Link>
                    {item.unread && (
                      <button
                        className="icon-button"
                        disabled={pending}
                        aria-label={`Mark activity from ${item.name} read`}
                        title="Mark read"
                        onClick={() => onRead([item.id])}
                      >
                        <Check size={17} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
    </>
  );
}
