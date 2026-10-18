import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { authenticateToken, parseBearerToken } from "../auth/authenticate.js";
import { enforcePasswordChange } from "../auth/guards.js";
import { UnauthorizedError } from "../errors/http-error.js";

const authPluginImpl: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("auth", null);

  fastify.addHook("onRequest", async (request) => {
    if (request.routeOptions.config.public === true) {
      return;
    }

    const token = parseBearerToken(request.headers.authorization);

    // eslint-disable-next-line security/detect-possible-timing-attacks -- проверка наличия токена, а не сравнение секретов
    if (token === undefined) {
      throw new UnauthorizedError();
    }

    const auth = await authenticateToken(fastify.orm, token);

    if (!auth) {
      throw new UnauthorizedError();
    }

    request.auth = auth;

    enforcePasswordChange(request);
  });
};

export default fp(authPluginImpl);
