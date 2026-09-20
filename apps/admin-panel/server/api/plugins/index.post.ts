export default defineEventHandler(async (event) => {
  return proxyMultipart(event, "/admin/plugins", "POST");
});
