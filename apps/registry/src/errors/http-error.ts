export const ACCOUNT_LOCKED_CODE = "account_locked";
export const ACCOUNT_DISABLED_CODE = "account_disabled";

/**
 * Базовая типизированная HTTP-ошибка: глобальный `setErrorHandler` отдаёт `statusCode` и `message` клиенту как есть.
 */
export class HttpError extends Error {
  /**
   *
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
   *
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
   *
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
   *
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
   *
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
   *
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
   *
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
   *
   */
  constructor() {
    super(403, "Account is disabled", ACCOUNT_DISABLED_CODE);
  }
}
