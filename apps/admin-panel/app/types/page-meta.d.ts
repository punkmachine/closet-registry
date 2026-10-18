import type { PagePermission } from "~/utils/permissions";

declare module "#app" {
  interface PageMeta {
    public?: boolean;
    permission?: PagePermission;
  }
}

export {};
