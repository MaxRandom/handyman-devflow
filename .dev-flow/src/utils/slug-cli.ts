import { slugify } from './slug.js';
const input = process.argv.slice(2).join(' ');
console.log(slugify(input));
