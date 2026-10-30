import { Generation } from '../database/entities';

// Kept in step with src/data/catalog.ts in the frontend.
export const CATEGORIES = [
  { slug: 'engine', name: 'Engine' },
  { slug: 'transmission', name: 'Transmission' },
  { slug: 'brakes', name: 'Brakes' },
  { slug: 'suspension', name: 'Suspension' },
  { slug: 'electrical', name: 'Electrical' },
  { slug: 'body', name: 'Body Parts' },
  { slug: 'bumpers', name: 'Bumpers' },
  { slug: 'glass', name: 'Glass & Mirrors' },
  { slug: 'interior', name: 'Interior' },
  { slug: 'exterior', name: 'Exterior' },
  { slug: 'lighting', name: 'Lighting' },
  { slug: 'cooling', name: 'Cooling' },
  { slug: 'exhaust', name: 'Exhaust' },
  { slug: 'steering', name: 'Steering' },
  { slug: 'filters', name: 'Filters' },
  { slug: 'wheels', name: 'Wheels & Tyres' },
  { slug: 'accessories', name: 'Accessories' },
] as const;

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as string[];

export const GENERATIONS = [
  {
    code: Generation.WK,
    name: 'Grand Cherokee WK',
    years: [2005, 2010],
    engines: ['3.0L CRD Diesel', '3.7L V6', '4.7L V8', '5.7L V8 HEMI', '6.1L V8 SRT'],
  },
  {
    code: Generation.WK2,
    name: 'Grand Cherokee WK2',
    years: [2011, 2021],
    engines: ['3.0L EcoDiesel', '3.6L V6', '5.7L V8 HEMI', '6.4L V8 SRT', '6.2L Supercharged'],
  },
  {
    code: Generation.WL,
    name: 'Grand Cherokee WL',
    years: [2021, 2026],
    engines: ['3.6L V6', '5.7L V8 HEMI', '2.0L Turbo 4xe'],
  },
];

export const MIN_YEAR = 2005;
export const MAX_YEAR = 2030;

// Images bundled with the frontend; anything else must be an uploaded image or a URL.
export const BUNDLED_IMAGE_KEYS = [
  'brakes',
  'engine',
  'suspension',
  'lighting',
  'filters',
  'electrical',
  'body',
  'wheels',
  'interior',
];
