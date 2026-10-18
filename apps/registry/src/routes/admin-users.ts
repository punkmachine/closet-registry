import {
  auditListResponseSchema,
  auditQuerySchema,
  errorResponseSchema,
  newUserBodySchema,
  patchUserBodySchema,
  resetPasswordBodySchema,
  userIdParamsSchema,
  userListResponseSchema,
  userResponseSchema,
} from "@closet/contract";
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { requirePermission } from "../auth/guards.js";
import { createListAuditController } from "../controllers/admin-audit/list-audit.controller.js";
import { createCreateUserController } from "../controllers/admin-users/create-user.controller.js";
import { createDeleteUserController } from "../controllers/admin-users/delete-user.controller.js";
import { createListUsersController } from "../controllers/admin-users/list-users.controller.js";
import { createPatchUserController } from "../controllers/admin-users/patch-user.controller.js";
import { createResetPasswordController } from "../controllers/admin-users/reset-password.controller.js";
import { createAdminUsersService } from "../services/admin-users.service.js";

const readGuard = requirePermission("users", "read");
const writeGuard = requirePermission("users", "write");
const updateGuard = requirePermission("users", "update");
const deleteGuard = requirePermission("users", "delete");
const adminRateLimitConfig = { rateLimit: { max: 300, timeWindow: "1 minute" } };

/**
 * `/v1/admin/users*` и `/v1/admin/audit` — только admin (права из `ROLE_PERMISSIONS`).
 */
const adminUsersRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const service = createAdminUsersService(fastify.orm);

  fastify.get(
    "/users",
    { schema: { response: { 200: userListResponseSchema } }, onRequest: readGuard },
    createListUsersController(fastify.orm),
  );

  fastify.post(
    "/users",
    {
      schema: {
        body: newUserBodySchema,
        response: { 201: userResponseSchema, 409: errorResponseSchema },
      },
      onRequest: writeGuard,
      config: adminRateLimitConfig,
    },
    createCreateUserController(fastify.orm, service),
  );

  fastify.patch(
    "/users/:id",
    {
      schema: {
        params: userIdParamsSchema,
        body: patchUserBodySchema,
        response: {
          200: userResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
      onRequest: updateGuard,
      config: adminRateLimitConfig,
    },
    createPatchUserController(fastify.orm, service),
  );

  fastify.post(
    "/users/:id/reset-password",
    {
      schema: {
        params: userIdParamsSchema,
        body: resetPasswordBodySchema,
        response: { 204: z.void(), 404: errorResponseSchema },
      },
      onRequest: updateGuard,
      config: adminRateLimitConfig,
    },
    createResetPasswordController(fastify.orm, service),
  );

  fastify.delete(
    "/users/:id",
    {
      schema: {
        params: userIdParamsSchema,
        response: { 204: z.void(), 404: errorResponseSchema, 409: errorResponseSchema },
      },
      onRequest: deleteGuard,
      config: adminRateLimitConfig,
    },
    createDeleteUserController(fastify.orm, service),
  );

  fastify.get(
    "/audit",
    {
      schema: { querystring: auditQuerySchema, response: { 200: auditListResponseSchema } },
      onRequest: readGuard,
    },
    createListAuditController(fastify.orm),
  );
};

export default adminUsersRoutes;
