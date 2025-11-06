#!/usr/bin/env node
/**
 * Example script demonstrating how to use the Confluence Test Counter
 * with your specific pages.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Your specific page URLs
const PAGE_URLS = [
    "https://diwakar0ashu.atlassian.net/wiki/spaces/~602a00e81bf1ce006b97ffc9/pages/229378/Test+Table+01",
    "https://diwakar0ashu.atlassian.net/wiki/spaces/~602a00e81bf1ce006b97ffc9/pages/458763/Test+Table+02",
    "https://diwakar0ashu.atlassian.net/wiki/spaces/~602a00e81bf1ce006b97ffc9/pages/491523/Test+Table+03",
    "https://diwakar0ashu.atlassian.net/wiki/spaces/~602a00e81bf1ce006b97ffc9/pages/393233/Test+Table+04",
];

/**
 * Simple environment variable loader
 */
function loadEnv() {
    const env = {};
    const envPath = path.join(__dirname, '.env');
    
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    env[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
    }
    
    return env;
}

async function main() {
    // Dynamic import to avoid top-level await issues
    const { ConfluenceTestCounter, extractPageIdsFromUrls } = await import('./confluence_reader.js');
    
    // Load configuration from environment
    const env = loadEnv();
    const confluenceUrl = process.env.CONFLUENCE_URL || env.CONFLUENCE_URL || 'https://diwakar0ashu.atlassian.net';
    const username = process.env.CONFLUENCE_USERNAME || env.CONFLUENCE_USERNAME;
    const apiToken = process.env.CONFLUENCE_API_TOKEN || env.CONFLUENCE_API_TOKEN;

    if (!username || !apiToken) {
        console.error('Error: Please set CONFLUENCE_USERNAME and CONFLUENCE_API_TOKEN');
        console.log('\nExample:');
        console.log('  export CONFLUENCE_USERNAME="your-email@example.com"');
        console.log('  export CONFLUENCE_API_TOKEN="your-token"');
        console.log('\nOr create a .env file.');
        process.exit(1);
    }

    try {
        // Initialize the counter
        const counter = new ConfluenceTestCounter(confluenceUrl, username, apiToken);

        // Extract page IDs from URLs
        const pageIds = extractPageIdsFromUrls(PAGE_URLS);

        // Analyze the specific pages
        const result = await counter.analyzeSpecificPages(pageIds);

        // Print results
        counter.printResults(
            result.totalPages,
            result.totalUnitTests,
            result.totalWdioTests,
            result.pageDetails
        );

    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (error.response) {
            console.error(`Response status: ${error.response.status}`);
            console.error(`Response data:`, error.response.data);
        }
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
