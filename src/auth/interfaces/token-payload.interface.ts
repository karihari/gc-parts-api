export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  // Admin user id.
  sub: string;
  // Auth session id.
  sid: string;
  typ: TokenType;
  // Unique per issued token, so two refresh tokens of one session never hash the same.
  jti?: string;
  iat?: number;
  exp?: number;
}
