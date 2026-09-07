import { useState } from "react";
import { Link } from "react-router-dom";
import { UsersRound } from "lucide-react";
import { Screen } from "../shared/Screen";
import type { Contact } from "../follow";
import { conversationIdForParticipants } from "../message/model";
import type { ProfileRepository } from "../profile/editor";
import type { ContactInput, ContactRequest } from "./contracts";
import { ContactRequestCard } from "./ContactRequestCard";
import { FindPerson } from "./FindPerson";

export type PeoplePageProps = {
  identity: string;
  contacts: Contact[];
  requests: ContactRequest[];
  error: string;
  loading: boolean;
  profiles: ProfileRepository;
  onRefresh(): void;
  onRequest(input: ContactInput): Promise<void>;
  onDecide(id: string, decision: "accepted" | "rejected"): Promise<void>;
};
export function PeoplePage(props: PeoplePageProps) {
  const [search, setSearch] = useState("");
  const [finding, setFinding] = useState(false);
  const matches = (contact: Contact) =>
    `${contact.displayName} ${contact.identity}`.toLowerCase().includes(search.toLowerCase());
  const contacts = props.contacts.filter(
    (person) => person.relationship !== "requested" && matches(person)
  );
  const requested = props.contacts.filter(
    (person) => person.relationship === "requested" && matches(person)
  );
  return (
    <Screen
      title="People"
      description="Your contacts, requests and introductions."
      actions={
        <button className="primary-button" onClick={() => setFinding(true)}>
          Find someone
        </button>
      }
    >
      {finding && (
        <FindPerson
          identity={props.identity}
          profiles={props.profiles}
          onRequest={props.onRequest}
          onClose={() => setFinding(false)}
        />
      )}
      {props.error && (
        <div className="page-notice" role="status">
          {props.error}
          <button onClick={props.onRefresh}>Retry</button>
        </div>
      )}
      <label className="field">
        <span className="sr-only">Find a person</span>
        <input
          type="search"
          placeholder="Find a person by name or identity"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {props.requests.length > 0 && (
        <section className="people-section">
          <h2>Incoming requests</h2>
          {props.requests.map((item) => (
            <ContactRequestCard key={item.ingressId} item={item} onDecide={props.onDecide} />
          ))}
        </section>
      )}
      {requested.length > 0 && (
        <section className="people-section">
          <h2>Sent requests</h2>
          <div className="people-list">
            {requested.map((person) => (
              <PersonRow key={person.identity} person={person} owner={props.identity} />
            ))}
          </div>
        </section>
      )}
      <section className="people-section">
        <h2>
          Contacts <span>{contacts.length}</span>
        </h2>
        {props.loading && <p role="status">Loading people…</p>}
        {!props.loading && contacts.length === 0 && (
          <div className="feature-empty">
            <UsersRound size={32} />
            <h3>{search ? "No matching people" : "Start with someone you know."}</h3>
            <p>Find someone using the Jolt identity they shared with you.</p>
          </div>
        )}
        <div className="people-list">
          {contacts.map((person) => (
            <PersonRow key={person.identity} person={person} owner={props.identity} />
          ))}
        </div>
      </section>
    </Screen>
  );
}
function PersonRow({ person, owner }: { person: Contact; owner: string }) {
  const name = person.displayName || person.identity;
  return (
    <article className="person-row">
      <span className="person-avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="person-detail">
        <Link to={`/profile/${encodeURIComponent(person.identity)}`}>{name}</Link>
        <small>{person.identity}</small>
      </div>
      {person.relationship === "accepted" && (
        <Link
          className="text-action"
          aria-label={`Message ${name}`}
          to={`/messages/${conversationIdForParticipants([owner, person.identity])}`}
        >
          Message
        </Link>
      )}
      {person.relationship === "requested" && (
        <span className="status-label">Awaiting response</span>
      )}
      {person.relationship === "local" && <span className="status-label">Saved identity</span>}
    </article>
  );
}
