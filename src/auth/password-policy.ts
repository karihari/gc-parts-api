// Length is what makes a password strong; composition rules mostly make people
// write them down (NIST SP 800-63B). 128 caps the work given to the hash function.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
