import { randomUUID } from 'node:crypto';

function randomHex(length: number): string {
  return randomUUID().replace(/-/g, '').slice(0, length).toUpperCase();
}

// Same formats the shop already uses, so old and new rows look alike.
export const newProductId = () => `GC-${randomHex(8)}`;
export const newOrderId = () => `ORD-${randomHex(10)}`;
export const newEnquiryId = () => `MSG-${randomHex(10)}`;
export const newImageId = () => randomUUID().replace(/-/g, '');

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'product'
  );
}
