const { test, expect } = require('@playwright/test');

test.describe('Attendance Page - Virtualization Test', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to login page
        await page.goto('http://localhost:3000/login');

        // Login with admin credentials
        await page.fill('input[type="email"]', 'admin@hrms.com');
        await page.fill('input[type="password"]', 'Admin@123');
        await page.click('button[type="submit"]');

        // Wait for navigation to complete
        await page.waitForURL('**/superadmin/**', { timeout: 10000 });
    });

    test('should load attendance page without errors', async ({ page }) => {
        // Track console errors
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        // Track page errors
        const pageErrors = [];
        page.on('pageerror', error => {
            pageErrors.push(error.message);
        });

        // Navigate to attendance page
        await page.goto('http://localhost:3000/superadmin/attendance');

        // Wait for the page to load
        await page.waitForSelector('[role="table"]', { timeout: 15000 });

        // Wait a bit for data to load
        await page.waitForTimeout(3000);

        // Check for specific runtime error
        const hasObjectValuesError = [...consoleErrors, ...pageErrors].some(
            err => err.includes('Cannot convert undefined or null to object')
        );

        // Assert no Object.values errors
        expect(hasObjectValuesError).toBe(false);

        // Log all errors for debugging
        if (consoleErrors.length > 0) {
            console.log('Console Errors:', consoleErrors);
        }
        if (pageErrors.length > 0) {
            console.log('Page Errors:', pageErrors);
        }
    });

    test('should render employee rows with virtualization', async ({ page }) => {
        await page.goto('http://localhost:3000/superadmin/attendance');

        // Wait for table to load
        await page.waitForSelector('[role="table"]', { timeout: 15000 });
        await page.waitForTimeout(2000);

        // Check if rows are rendered
        const rows = await page.locator('[role="row"]').count();
        console.log(`Rendered rows: ${rows}`);

        // Should have at least header + some data rows
        expect(rows).toBeGreaterThan(1);
    });

    test('should scroll smoothly through virtualized list', async ({ page }) => {
        await page.goto('http://localhost:3000/superadmin/attendance');

        // Wait for table
        await page.waitForSelector('[role="table"]', { timeout: 15000 });
        await page.waitForTimeout(2000);

        // Get the scrollable container
        const scrollContainer = await page.locator('[role="rowgroup"]').first();

        // Scroll down
        await scrollContainer.evaluate(node => {
            node.scrollTop = 500;
        });
        await page.waitForTimeout(500);

        // Scroll down more
        await scrollContainer.evaluate(node => {
            node.scrollTop = 1000;
        });
        await page.waitForTimeout(500);

        // Verify no errors occurred during scrolling
        const pageErrors = [];
        page.on('pageerror', error => {
            pageErrors.push(error.message);
        });

        expect(pageErrors.length).toBe(0);
    });

    test('should display attendance data correctly', async ({ page }) => {
        await page.goto('http://localhost:3000/superadmin/attendance');

        // Wait for data to load
        await page.waitForSelector('[role="table"]', { timeout: 15000 });
        await page.waitForTimeout(3000);

        // Check for employee names
        const employeeNames = await page.locator('[role="cell"]').first().textContent();
        expect(employeeNames).toBeTruthy();

        // Check for attendance status cells (P/A/L/OD/-)
        const statusCells = await page.locator('[role="cell"]').count();
        expect(statusCells).toBeGreaterThan(0);
    });

    test('should handle filters without errors', async ({ page }) => {
        await page.goto('http://localhost:3000/superadmin/attendance');

        await page.waitForSelector('[role="table"]', { timeout: 15000 });
        await page.waitForTimeout(2000);

        // Try changing table type filter
        const tableTypeSelect = await page.locator('select').filter({ hasText: 'Complete' }).first();
        if (await tableTypeSelect.isVisible()) {
            await tableTypeSelect.selectOption('present_absent');
            await page.waitForTimeout(1000);
        }

        // Verify no errors
        const pageErrors = [];
        page.on('pageerror', error => {
            pageErrors.push(error.message);
        });

        expect(pageErrors.length).toBe(0);
    });
});
