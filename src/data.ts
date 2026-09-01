import {
  App,
  Collection,
  Document,
  Field,
  Read,
  Schema,
} from "jolt-sdk/data";

import type { SpokeAttachment } from "./media";

@Schema({ version: 1 })
export class ImageAttachment {
  @Field.string()
  id!: string;

  @Field.string()
  kind!: "image";

  @Field.string()
  contentId!: string;

  // Card 117 will normalise legacy `null` addresses to an absent field.
  @Field.string({ optional: true })
  address?: string;

  @Field.string()
  mimeType!: string;

  @Field.number()
  size!: number;

  @Field.number({ optional: true })
  width?: number;

  @Field.number({ optional: true })
  height?: number;

  @Field.string({ optional: true })
  alt?: string;
}

export function toDataImageAttachment(attachment: SpokeAttachment): ImageAttachment {
  const { address, ...fields } = attachment;
  return address ? { ...fields, address } : fields;
}

@Schema({ version: 1 })
export class ProfileLink {
  @Field.string()
  label!: string;

  @Field.string()
  url!: string;
}

@Schema({ version: 1 })
export class Profile {
  @Field.identity()
  identity!: string;

  @Field.string()
  displayName!: string;

  @Field.string()
  bio!: string;

  @Field.schema(ImageAttachment, { optional: true })
  avatar?: ImageAttachment;

  @Field.array(Field.schema(ProfileLink), { optional: true })
  links?: ProfileLink[];

  @Field.string({ optional: true })
  location?: string;

  @Field.string({ optional: true })
  pronouns?: string;

  @Field.dateTime()
  updatedAt!: Date;
}

@Schema({ version: 1 })
export class Post {
  @Field.identity()
  author!: string;

  @Field.string({ optional: true })
  displayName?: string;

  @Field.string()
  title!: string;

  @Field.string()
  body!: string;

  @Field.dateTime()
  createdAt!: Date;

  @Field.string({ optional: true })
  threadPath?: string;

  @Field.array(Field.schema(ImageAttachment), { optional: true })
  attachments?: ImageAttachment[];
}

const ProfileDocument = Document.create(Profile, {
  access: {
    read: Read.AnyIdentity,
    create: true,
    update: true,
  },
});

const Posts = Collection.create(Post, {
  access: {
    read: Read.AnyIdentity,
    create: true,
    update: true,
    delete: true,
    restore: true,
  },
});

// Spoke's typed application surface. React connects once, then works through
// these domain-named resources rather than raw Jolt operations.
export const SpokeData = App.create({
  id: "spoke.local",
  name: "Spoke",
  namespace: "spoke",
  data: {
    profile: ProfileDocument,
    posts: Posts,
  },
});

export type SpokeApp = Awaited<ReturnType<typeof SpokeData.connect>>;
