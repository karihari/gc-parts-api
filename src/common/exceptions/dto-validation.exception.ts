import { HttpException, HttpStatus, ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;
  errors: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, errors: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

// Shape: { statusCode: 400, error: 'DtoValidationError', message: [{ field, errors }] }.
// Rejected values are never echoed back, so passwords cannot leak into responses or logs.
export class DtoValidationException extends HttpException {
  constructor(errors: ValidationError[]) {
    super(
      { statusCode: HttpStatus.BAD_REQUEST, error: 'DtoValidationError', message: flatten(errors) },
      HttpStatus.BAD_REQUEST,
    );
  }
}
