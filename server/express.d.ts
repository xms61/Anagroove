// Fields this server adds to Express requests
declare global {
  namespace Express {
    interface Request {
      /** Anonymous user id from the X-User-Id header, set by the user routes' middleware. */
      userId?: string;
    }
  }
}

export {};
