/**
 * Нейтральный источник не разобран или не прошёл проверку; текст ошибки показывается пользователю как есть.
 */
export class SpecError extends Error {
  /**
   * @param message - причина, понятная автору spec
   */
  constructor(message: string) {
    super(message);
    this.name = "SpecError";
  }
}
