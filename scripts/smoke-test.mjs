import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
    'index.html',
    'styles.css',
    'chatbot.css',
    'script.js',
    'calendar.js',
    'chatbot.js',
    'js/portfolio.js',
    'js/reviews.js',
    'js/carousel.js',
    'sw.js',
    'manifest.json',
    'proxy/worker.js',
];

for (const file of requiredFiles) {
    await access(file);
}

const html = await readFile('index.html', 'utf8');
const requiredSnippets = [
    '<link rel="manifest" href="manifest.json"',
    'assets/hero-background',
    'chatbot.js',
    'js/portfolio.js',
    'js/reviews.js',
];

for (const snippet of requiredSnippets) {
    if (!html.includes(snippet)) {
        throw new Error(`index.html missing expected snippet: ${snippet}`);
    }
}

const sw = await readFile('sw.js', 'utf8');
if (!/renostter-v\$\{RELEASE_VERSION\}/.test(sw) || !/RELEASE_VERSION = '\d{4}\.\d{2}\.\d{2}'/.test(sw)) {
    throw new Error('sw.js CACHE_NAME must use a release-like version, for example renostter-v2026.05.27');
}

console.log('Smoke test passed.');
