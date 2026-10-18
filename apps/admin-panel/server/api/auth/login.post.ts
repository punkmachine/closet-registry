import type { LoginResponse, MeResponse } from "@closet/contract";

export default defineEventHandler(async (event): Promise<MeResponse> => {
  const body = await readJsonBody(event);

  const { data } = await registryFetchRaw<LoginResponse>(event, "/auth/login", {
    method: "POST",
    anonymous: true,
    forwardClient: true,
    ...jsonBody(body),
  });

  setSessionCookie(event, data.token);

  return { user: data.user };
});
