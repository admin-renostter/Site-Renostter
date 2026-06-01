module.exports = {
    ci: {
        collect: {
            staticDistDir: '.',
            url: ['http://localhost:4173/index.html'],
            startServerCommand: 'npm run dev',
            startServerReadyPattern: 'Available on',
            numberOfRuns: 1,
            settings: {
                preset: 'desktop',
                chromeFlags: '--no-sandbox',
            },
        },
        assert: {
            assertions: {
                'categories:performance': ['warn', { minScore: 0.65 }],
                'categories:accessibility': ['warn', { minScore: 0.85 }],
                'categories:best-practices': ['warn', { minScore: 0.85 }],
                'categories:seo': ['warn', { minScore: 0.85 }],
            },
        },
        upload: {
            target: 'temporary-public-storage',
        },
    },
};
