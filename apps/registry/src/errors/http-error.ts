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
