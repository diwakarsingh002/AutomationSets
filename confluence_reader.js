#!/usr/bin/env node
/**
 * Confluence Unit Test Counter - JavaScript Version
 * Reads Confluence pages and counts Unit Tests across pages in a specified section/space.
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ConfluenceTestCounter {
    constructor(url, username, password) {
        this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        this.url = `${this.baseUrl}/wiki/rest/api`; // Confluence Cloud needs /wiki/ prefix
        this.username = username;
        this.password = password;
        this.auth = Buffer.from(`${username}:${password}`).toString('base64');
        this.headers = {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Parse tables and extract counts for different types
     * Returns an object with counts for Unit and WDIO
     */
    searchForUnitTests(content) {
        let unitCount = 0;
        let wdioCount = 0;
        
        // Find all tables in the content
        const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;
        const tables = content.match(tableRegex);
        
        if (!tables) {
            return { unitCount: 0, wdioCount: 0 };
        }

        tables.forEach(table => {
            // Find all table rows
            const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
            const rows = table.match(rowRegex);
            
            if (!rows) return;
            
            rows.forEach(row => {
                // Extract all cells from the row
                const cellRegex = /<(?:td|th)[^>]*>(.*?)<\/(?:td|th)>/gis;
                const cells = [];
                let match;
                
                while ((match = cellRegex.exec(row)) !== null) {
                    // Clean HTML tags and decode entities
                    const cellContent = match[1]
                        .replace(/<[^>]+>/g, '') // Remove HTML tags
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .trim();
                    cells.push(cellContent);
                }
                
                // If we have at least 2 cells (Type and Count columns)
                if (cells.length >= 2) {
                    const typeCell = cells[0].toLowerCase().trim();
                    const countCell = cells[1].trim();
                    
                    // Parse the count value
                    const countValue = parseFloat(countCell);
                    if (!isNaN(countValue)) {
                        // Check for Unit
                        if (typeCell === 'unit' || typeCell.includes('unit')) {
                            unitCount += countValue;
                        }
                        // Check for WDIO
                        if (typeCell === 'wdio' || typeCell.includes('wdio')) {
                            wdioCount += countValue;
                        }
                    }
                }
            });
        });

        return { unitCount, wdioCount };
    }

    /**
     * Get all pages from a specific Confluence space
     */
    async getAllPages(spaceKey) {
        try {
            const pages = [];
            let start = 0;
            const limit = 100;

            while (true) {
                const response = await axios.get(
                    `${this.url}/content?spaceKey=${spaceKey}&limit=${limit}&start=${start}`,
                    { headers: this.headers }
                );

                const pageList = response.data.results || [];
                pages.push(...pageList);

                if (pageList.length < limit) {
                    break;
                }
                start += limit;
            }

            return pages;
        } catch (error) {
            console.error(`Error fetching pages from space '${spaceKey}':`, error.message);
            return [];
        }
    }

    /**
     * Get the content of a specific page
     */
    async getPageContent(pageId) {
        try {
            const response = await axios.get(
                `${this.url}/content/${pageId}?expand=body.storage,version`,
                { headers: this.headers }
            );

            if (response.data && response.data.body && response.data.body.storage) {
                return response.data.body.storage.value || '';
            }
            return '';
        } catch (error) {
            console.error(`Error fetching page content for page_id '${pageId}':`, error.message);
            return '';
        }
    }

    /**
     * Analyze a space for unit tests
     */
    async analyzeSpace(spaceKey) {
        console.log(`Analyzing space: ${spaceKey}`);
        const pages = await this.getAllPages(spaceKey);

        if (!pages || pages.length === 0) {
            console.log(`No pages found in space '${spaceKey}'`);
            return { totalPages: 0, totalUnitTests: 0, totalWdioTests: 0, pageDetails: [] };
        }

        let totalUnitTests = 0;
        let totalWdioTests = 0;
        const pageDetails = [];

        console.log(`Found ${pages.length} pages. Scanning...`);

        for (let idx = 0; idx < pages.length; idx++) {
            const page = pages[idx];
            const pageId = page.id;
            const pageTitle = page.title;

            const content = await this.getPageContent(pageId);
            const counts = this.searchForUnitTests(content);
            totalUnitTests += counts.unitCount;
            totalWdioTests += counts.wdioCount;

            if (counts.unitCount > 0 || counts.wdioCount > 0) {
                pageDetails.push({
                    pageId: pageId,
                    title: pageTitle,
                    unitCount: counts.unitCount,
                    wdioCount: counts.wdioCount
                });
            }

            if ((idx + 1) % 10 === 0) {
                console.log(`Processed ${idx + 1}/${pages.length} pages...`);
            }
        }

        return {
            totalPages: pages.length,
            totalUnitTests,
            totalWdioTests,
            pageDetails
        };
    }

    /**
     * Analyze specific pages by their IDs
     */
    async analyzeSpecificPages(pageIds) {
        if (!pageIds || pageIds.length === 0) {
            return { totalPages: 0, totalUnitTests: 0, totalWdioTests: 0, pageDetails: [] };
        }

        let totalUnitTests = 0;
        let totalWdioTests = 0;
        const pageDetails = [];

        for (let idx = 0; idx < pageIds.length; idx++) {
            const pageId = pageIds[idx];
            try {
                const response = await axios.get(
                    `${this.url}/content/${pageId}?expand=version`,
                    { headers: this.headers }
                );
                const page = response.data;
                const pageTitle = page.title || 'Unknown';

                const content = await this.getPageContent(pageId);
                const counts = this.searchForUnitTests(content);
                totalUnitTests += counts.unitCount;
                totalWdioTests += counts.wdioCount;

                pageDetails.push({
                    pageId: pageId,
                    title: pageTitle,
                    unitCount: counts.unitCount,
                    wdioCount: counts.wdioCount
                });

            } catch (error) {
                console.error(`Error processing page ${pageId}:`, error.message);
            }
        }

        return {
            totalPages: pageIds.length,
            totalUnitTests,
            totalWdioTests,
            pageDetails
        };
    }

    /**
     * Print the results in a formatted table
     */
    printResults(totalPages, totalUnitTests, totalWdioTests, pageDetails) {
        console.log('\nResults Summary:');
        console.table([
            { Type: 'Unit', Count: totalUnitTests.toString() },
            { Type: 'WDIO', Count: totalWdioTests.toString() }
        ]);

        if (pageDetails && pageDetails.length > 0) {
            console.log('\nPer Page Details:');
            const detailsTable = pageDetails.map(detail => ({
                'Page Title': detail.title,
                'Unit': detail.unitCount || 0,
                'WDIO': detail.wdioCount || 0
            }));
            console.table(detailsTable);
        }
    }
}

/**
 * Extract page IDs from Confluence URLs
 */
export function extractPageIdsFromUrls(urls) {
    const pageIds = [];
    const pageIdPattern = /\/pages\/(\d+)\//;

    urls.forEach(url => {
        const match = url.match(pageIdPattern);
        if (match) {
            pageIds.push(match[1]);
        }
    });

    return pageIds;
}

export { ConfluenceTestCounter };

/**
 * Load environment variables from .env file
 */
function loadEnvVars() {
    const envPath = path.join(__dirname, '.env');
    const env = {};

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

/**
 * Main entry point
 */
async function main() {
    // Load environment variables
    const env = loadEnvVars();
    const { execSync } = await import('child_process');

    const confluenceUrl = process.env.CONFLUENCE_URL || env.CONFLUENCE_URL;
    const username = process.env.CONFLUENCE_USERNAME || env.CONFLUENCE_USERNAME;
    const apiToken = process.env.CONFLUENCE_API_TOKEN || env.CONFLUENCE_API_TOKEN;
    const spaceKey = process.env.CONFLUENCE_SPACE_KEY || env.CONFLUENCE_SPACE_KEY;
    const pageUrls = process.env.CONFLUENCE_PAGE_URLS || env.CONFLUENCE_PAGE_URLS || '';

    // Validate required environment variables
    if (!confluenceUrl || !username || !apiToken) {
        console.error('Error: Missing required environment variables.');
        console.log('\nPlease set the following environment variables:');
        console.log('  - CONFLUENCE_URL');
        console.log('  - CONFLUENCE_USERNAME');
        console.log('  - CONFLUENCE_API_TOKEN');
        console.log('\nOptional:');
        console.log('  - CONFLUENCE_SPACE_KEY (to analyze entire space)');
        console.log('  - CONFLUENCE_PAGE_URLS (comma-separated URLs of specific pages)');
        console.log('\nOr create a .env file in the current directory.');
        process.exit(1);
    }

    try {
        // Initialize the counter
        const counter = new ConfluenceTestCounter(confluenceUrl, username, apiToken);

        let result;

        // Check if specific pages are provided
        if (pageUrls) {
            // Parse page URLs
            const urlsList = pageUrls.split(',').map(url => url.trim()).filter(url => url);
            const pageIds = extractPageIdsFromUrls(urlsList);

            if (pageIds.length > 0) {
                result = await counter.analyzeSpecificPages(pageIds);
            } else {
                console.log('No valid page URLs found.');
                process.exit(1);
            }
        } else if (spaceKey) {
            // Analyze entire space
            result = await counter.analyzeSpace(spaceKey);
        } else {
            console.error('Error: Either CONFLUENCE_SPACE_KEY or CONFLUENCE_PAGE_URLS must be provided.');
            process.exit(1);
        }

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

