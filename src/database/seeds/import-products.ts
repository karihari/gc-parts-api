// npm run import:products -- <file.csv> [--apply]
// Replaces every product with the rows of a CSV export
// (sku,title_ru,title_en,category_ru,category_en,quantity,position,price,currency,…,vehicle,vin,…).
// An empty price is imported as 0 ("price on request") for the admin to fill in later.
// Without --apply it only prints what would be imported.
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import dataSource from '../data-source';
import { Fitment, Generation, ProductEntity } from '../entities';

const BODY = { slug: 'body', image: 'body' };
const ENGINE = { slug: 'engine', image: 'engine' };
const TRANSMISSION = { slug: 'transmission', image: 'engine' };
const SUSPENSION = { slug: 'suspension', image: 'suspension' };
const INTERIOR = { slug: 'interior', image: 'interior' };

const CATEGORY: Record<string, { slug: string; image: string }> = {
  'Body panels': BODY,
  'Front end structure': BODY,
  'Front bumper': { slug: 'bumpers', image: 'body' },
  'Rear bumper': { slug: 'bumpers', image: 'body' },
  Doors: BODY,
  'Liftgate (tailgate)': BODY,
  'Glass & mirrors': { slug: 'glass', image: 'body' },
  Lighting: { slug: 'lighting', image: 'lighting' },
  'Engine — 3.6L V6 Pentastar': ENGINE,
  'Ignition & engine sensors': ENGINE,
  'Fuel system': ENGINE,
  'Air intake': ENGINE,
  Exhaust: { slug: 'exhaust', image: 'engine' },
  'Cooling system': { slug: 'cooling', image: 'engine' },
  'Accessory drive': ENGINE,
  'Transmission — 8-speed automatic': TRANSMISSION,
  '4WD drivetrain': TRANSMISSION,
  'Front suspension': SUSPENSION,
  'Rear suspension': SUSPENSION,
  Steering: { slug: 'steering', image: 'suspension' },
  Brakes: { slug: 'brakes', image: 'brakes' },
  'Wheels & tires': { slug: 'wheels', image: 'wheels' },
  'Electrical & modules': { slug: 'electrical', image: 'electrical' },
  'Instrument panel & infotainment': INTERIOR,
  'HVAC (heating & A/C)': { slug: 'cooling', image: 'engine' },
  'Interior & seats': INTERIOR,
  'Safety / airbags': INTERIOR,
  'Underbody & frame': BODY,
};

// The position column, keyed by its English part ("L/R · Лев/Прав" → "L/R").
const POSITION: Record<string, { ru: string; en: string }> = {
  'L/R': { ru: 'Сторона: левая и правая.', en: 'Side: left and right.' },
  'F/R': { ru: 'Положение: спереди и сзади.', en: 'Position: front and rear.' },
  'FL/FR/RL/RR': {
    ru: 'Положение: спереди и сзади, слева и справа.',
    en: 'Position: front and rear, left and right.',
  },
  Set: { ru: 'Продаётся комплектом.', en: 'Sold as a set.' },
};

// Notes meant for the shop, and set-price notes that would contradict the per-piece price.
const DROP = [
  /\s*Цена за пару\.?/g,
  /\s*Цена за \d+ шт\.?/g,
  /\s*Цена с пометкой \(\?\) — подтвердите\.?/g,
  /\s*Уточнить английское название\.?/g,
  /\s*Price for the pair\.?/g,
  /\s*Price for \d+ pcs\.?/g,
  /\s*Price marked \(\?\) — please confirm\.?/g,
  /\s*English name to confirm\.?/g,
  /\s*\(to confirm\)/g,
];

function clean(text: string): string {
  return DROP.reduce((s, re) => s.replace(re, ''), text).trim();
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// "2023 Jeep Grand Cherokee L Laredo 3.6L 4WD" → WL, 2023, 3.6L V6.
function fitsOf(vehicle: string): Fitment[] {
  const year = Number(/\b(20\d\d)\b/.exec(vehicle)?.[1]);
  if (!year) throw new Error(`No model year in "${vehicle}"`);
  const gen = year >= 2022 ? Generation.WL : year >= 2011 ? Generation.WK2 : Generation.WK;
  const engines = /3\.6L/.test(vehicle)
    ? ['3.6L V6']
    : /5\.7L/.test(vehicle)
      ? ['5.7L V8 HEMI']
      : undefined;
  return [engines ? { gen, from: year, to: year, engines } : { gen, from: year, to: year }];
}

type ImportRow = Pick<
  ProductEntity,
  | 'id'
  | 'slug'
  | 'name'
  | 'nameEn'
  | 'category'
  | 'brand'
  | 'partNumber'
  | 'price'
  | 'stock'
  | 'image'
  | 'description'
  | 'descriptionEn'
  | 'fits'
>;

function toRows(csv: string): ImportRow[] {
  return parseCsv(csv).map((r) => {
    const sku = r['sku'];
    const category = CATEGORY[r['category_en']];
    if (!category) throw new Error(`${sku}: unknown category "${r['category_en']}"`);
    if (r['price'] && r['currency'] !== 'AMD') throw new Error(`${sku}: currency must be AMD`);
    const qty = Number(r['quantity']);
    const price = Number(r['price'] || 0);
    if (!Number.isInteger(qty) || qty < 1 || !Number.isInteger(price) || price < 0) {
      throw new Error(`${sku}: bad quantity or price`);
    }
    const positionKey = (r['position'] ?? '').split(' · ')[0];
    const position = POSITION[positionKey];
    if (positionKey && !position) throw new Error(`${sku}: unknown position "${r['position']}"`);
    const name = clean(r['title_ru']);
    const nameEn = clean(r['title_en']);
    const vehicle = r['vehicle'];
    const vin = r['vin'] ? ` VIN ${r['vin']}.` : '';
    return {
      id: sku,
      slug: `${slugify(nameEn)}-${sku.toLowerCase()}`,
      name,
      nameEn,
      category: category.slug,
      brand: 'Jeep',
      partNumber: sku,
      // The list gives the price of one piece.
      price,
      stock: qty,
      image: category.image,
      description: `${name} для ${vehicle}.${vin} ${position?.ru ?? ''}`.trim(),
      descriptionEn: `${nameEn} for ${vehicle}.${vin} ${position?.en ?? ''}`.trim(),
      fits: fitsOf(vehicle),
    };
  });
}

async function run(): Promise<void> {
  const [file, flag] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: npm run import:products -- <file.csv> [--apply]');
    process.exit(1);
  }
  const rows = toRows(readFileSync(file, 'utf8'));
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) throw new Error('Duplicate sku in the file');

  for (const p of rows) {
    console.log(
      `${p.id}  ${p.category.padEnd(10)} ${String(p.price).padStart(7)} ×${p.stock}  ${p.name} / ${p.nameEn}`,
    );
  }
  if (flag !== '--apply') {
    console.log(`\nDry run: ${rows.length} products. Add --apply to replace all products.`);
    return;
  }

  await dataSource.initialize();
  try {
    // One transaction: if the insert fails, the old products stay.
    await dataSource.transaction(async (manager) => {
      await manager.createQueryBuilder().delete().from(ProductEntity).execute();
      await manager.createQueryBuilder().insert().into(ProductEntity).values(rows).execute();
    });
    console.log(`\nReplaced all products with ${rows.length} from ${file}.`);
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
