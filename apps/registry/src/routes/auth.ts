import {
  apiTokenIssuedSchema,
  apiTokenResponseSchema,
  changePasswordBodySchema,
  errorResponseSchema,
  loginBodySchema,
  loginResponseSchema,
  meResponseSchema,
} from "@closet/contract";
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { createChangePasswordController } from "../controllers/auth/change-password.controller.js";
import { createLoginController } from "../controllers/auth/login.controller.js";
import { createLogoutController } from "../controllers/auth/logout.controller.js";
import { createMeController } from "../controllers/auth/me.controller.js";
import {
  createGetTokenController,
  createIssueTokenController,
  createRevokeTokenController,
} from "../controllers/auth/token.controller.js";
import { createAuthService } from "../services/auth.service.js";

const loginRateLimitConfig = { rateLimit: { max: 10, timeWindow: "10 minutes" } };
const writeRateLimitConfig = { rateLimit: { max: 30, timeWindow: "10 minutes" } };

/**
 * `/v1/auth/*`. Публичен только `login`; остальное доступно любой роли, а до смены пароля
 * (`must_change_password`) — только `me`, `change-password` и `logout` (`allowPasswordChange`).
 */
const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const orm = fastify.orm;
  const service = createAuthService(orm);

  fastify.post(
    "/auth/login",
    {
      schema: {
        body: loginBodySchema,
        response: { 200: loginResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
      config: { public: true, ...loginRateLimitConfig },
    },
    createLoginController(orm, service),
  );

  fastify.get(
    "/auth/me",
    { schema: { response: { 200: meResponseSchema } }, config: { allowPasswordChange: true } },
    createMeController(),
  );

  fastify.post(
    "/auth/logout",
    { schema: { response: { 204: z.void() } }, config: { allowPasswordChange: true } },
    createLogoutController(orm),
  );

  fastify.post(
    "/auth/change-password",
    {
      schema: {
        body: changePasswordBodySchema,
        response: { 204: z.void(), 400: errorResponseSchema },
      },
      config: { allowPasswordChange: true, ...writeRateLimitConfig },
    },
    createChangePasswordController(orm, service),
  );

  fastify.get("/auth/token", { schema: { response: { 200: apiTokenResponseSchema } } }, createGetTokenController(orm));

  fastify.post(
    "/auth/token",
    { schema: { response: { 201: apiTokenIssuedSchema } }, config: writeRateLimitConfig },
    createIssueTokenController(orm),
  );

  fastify.delete(
    "/auth/token",
    { schema: { response: { 204: z.void() } }, config: writeRateLimitConfig },
    createRevokeTokenController(orm),
  );
};

export default authRoutes;
