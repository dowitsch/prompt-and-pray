import { getDb } from '../src/lib/db/db.ts';
import { seed } from '../src/lib/db/seed.ts';

seed(getDb());
console.log('[homeward] seeded palettes and the built-in stories');
