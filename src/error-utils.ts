import { getSystemErrorMessage, getSystemErrorName, inspect } from 'node:util';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const toErrnoInfo = (error: NodeJS.ErrnoException): string | undefined => {
  if (typeof error.code === 'string' && error.code.length > 0) {
    return `${error.code}: ${error.message}`;
  }

  if (typeof error.errno === 'number') {
    try {
      const name = getSystemErrorName(error.errno);
      const message = getSystemErrorMessage(error.errno);
      return `${name}: ${message}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

const inspectValue = (value: unknown): string =>
  inspect(value, { breakLength: 120, colors: false, compact: 3, depth: 2 });

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    const errnoInfo = toErrnoInfo(error as NodeJS.ErrnoException);
    return errnoInfo ?? error.message;
  }

  if (isNonEmptyString(error)) return error;
  return inspectValue(error);
};
