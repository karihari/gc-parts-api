import { HttpException, HttpStatus } from '@nestjs/common';

// A request that is valid but cannot be carried out in the current state
// (out of stock, order already cancelled, ...). Mirrors LPMS ProcessingException.
export class ProcessingException extends HttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      { statusCode: HttpStatus.CONFLICT, error: 'ProcessingError', message, ...details },
      HttpStatus.CONFLICT,
    );
  }
}
