export default defineNuxtRouteMiddleware(async (to) => {
  const { user, loaded, fetchUser } = useAuth();

  if (!loaded.value) {
    await fetchUser();
  }

  const target = resolveAuthRedirect({
    user: user.value,
    path: to.path,
    isPublic: to.meta.public === true,
    permission: to.meta.permission,
  });

  if (target && target !== to.path) {
    return await navigateTo(target);
  }
});
