export type ItemType =
  | "rules"
  | "skills"
  | "commands"
  | "agents"
  | "hooks"
  | "mcp"
  | "statusline";

export const ITEM_TYPES = [
  "rules",
  "skills",
  "commands",
  "agents",
  "hooks",
  "mcp",
  "statusline",
] as const satisfies readonly ItemType[];

export interface ItemFile {
  path: string;
  rootPath?: boolean;
  merge?: boolean;
  template?: boolean;
}

export interface ItemFileContent extends ItemFile {
  content: string;
}

export interface ItemFileUpload extends ItemFile {
  content: Buffer;
}

export interface ItemMetadata {
  name: string; // уникально по всему реестру, вне зависимости от type
  type: ItemType;
  version: string; // semver
  description: string;
  dependencies: string[]; // имена других items
  files: ItemFile[];
}

export interface ItemCreatePayload extends Omit<ItemMetadata, "files"> {
  files: ItemFileContent[];
}
