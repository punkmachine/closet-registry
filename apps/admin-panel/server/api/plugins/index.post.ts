export default defineEventHandler(async (event) => {
  return await proxyMultipart(event, "/admin/plugins", "POST");
});
