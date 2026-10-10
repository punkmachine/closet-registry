// Типы для импорта .vue-файлов в тестах: ESLint (typescript-eslint) не знает расширение .vue,
// а vue-tsc резолвит реальные компоненты и эту заглушку не использует
declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent;
  export default component;
}
