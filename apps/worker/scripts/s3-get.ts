// Отладка: скачать объекты из S3 в папку — npx tsx --env-file=../../.env scripts/s3-get.ts <папка> <ключ>...
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadEnv } from '../src/env';
import { Storage } from '../src/storage';
const [out, ...keys] = process.argv.slice(2);
const storage = new Storage(loadEnv());
for (const key of keys) writeFileSync(`${out}/${basename(key)}`, await storage.get(key));
