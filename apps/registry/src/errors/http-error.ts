export const ACCOUNT_LOCKED_CODE = "account_locked";
export const ACCOUNT_DISABLED_CODE = "account_disabled";

/**
 * Базовая типизированная HTTP-ошибка: глобальный `setErrorHandler` отдаёт `statusCode` и `message` клиенту как есть.
 */
export class HttpError extends Error {
  /**
   * Создаёт ошибку с HTTP-статусом, необязательным кодом и заголовками ответа.
   */
  constructor(
    readonly statusCode: number,
    message: string,
    readonly errorCode?: string,
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 *
 */
export class BadRequestError extends HttpError {
  /**
   * Создаёт ошибку 400 Bad Request.
   */
  constructor(message: string) {
    super(400, message);
  }
}

/**
 *
 */
export class NotFoundError extends HttpError {
  /**
   * Создаёт ошибку 404 Not Found.
   */
  constructor(message: string) {
    super(404, message);
  }
}

/**
 *
 */
export class ConflictError extends HttpError {
  /**
   * Создаёт ошибку 409 Conflict.
   */
  constructor(message: string) {
    super(409, message);
  }
}

/**
 *
 */
export class UnauthorizedError extends HttpError {
  /**
   * Создаёт ошибку 401 Unauthorized.
   */
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

/**
 *
 */
export class ForbiddenError extends HttpError {
  /**
   * Создаёт ошибку 403 Forbidden с необязательным кодом.
   */
  constructor(message: string, code?: string) {
    super(403, message, code);
  }
}

/**
 * Аккаунт временно заблокирован после серии неудачных входов. `Retry-After` — секунды до снятия блокировки.
 */
export class AccountLockedError extends HttpError {
  /**
   * Создаёт ошибку 403 для временно заблокированной учётной записи с заголовком Retry-After.
   */
  constructor(retryAfterSeconds: number) {
    super(403, "Account is temporarily locked", ACCOUNT_LOCKED_CODE, { "retry-after": String(retryAfterSeconds) });
  }
}

/**
 * Аккаунт отключён администратором.
 */
export class AccountDisabledError extends HttpError {
  /**
   * Создаёт ошибку 403 для отключённой учётной записи.
   */
  constructor() {
    super(403, "Account is disabled", ACCOUNT_DISABLED_CODE);
  }
}
