import type { User } from "../db/entities/index.js";
import type { TokenKind } from "./tokens.js";

export interface AuthContext {
  user: User;
  kind: TokenKind;
  credentialId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }

  interface FastifyContextConfig {
    public?: boolean;
    allowPasswordChange?: boolean;
  }
}
