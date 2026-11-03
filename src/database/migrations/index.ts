import { InitialSchema1761600000000 } from './1761600000000-initial-schema';
import { BilingualProductsAndEnquiries1761700000000 } from './1761700000000-bilingual-products-and-enquiries';
import { ImageObjectStorage1761800000000 } from './1761800000000-image-object-storage';

// Listed explicitly so they load the same way from ts-node, tests and the built dist.
export const MIGRATIONS = [
  InitialSchema1761600000000,
  BilingualProductsAndEnquiries1761700000000,
  ImageObjectStorage1761800000000,
];
