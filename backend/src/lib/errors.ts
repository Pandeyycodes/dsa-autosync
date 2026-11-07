export interface AppErrorOptions {
  retryable?: boolean;
  retryAfterSeconds?: number;
}

/** An error whose code and message are safe to return to clients. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly options: AppErrorOptions = {},
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.options.retryable !== undefined && { retryable: this.options.retryable }),
        ...(this.options.retryAfterSeconds !== undefined && { retryAfterSeconds: this.options.retryAfterSeconds }),
      },
    };
  }
}

export const Errors = {
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', 'Authentication required.'),
  reauth: () => new AppError(401, 'GITHUB_REAUTH_REQUIRED', 'GitHub authorization expired or was revoked. Reconnect GitHub.'),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`),
  badRequest: (message: string, code = 'BAD_REQUEST') => new AppError(400, code, message),
};
