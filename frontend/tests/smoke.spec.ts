import { test, expect } from '@playwright/test';

/**
 * Frontend Smoke Test
 * This test verifies that the application is up and accessible.
 */
test.describe('Application Health Smoke Test', () => {

    /**
     * Test Case: Verify Login Page Access
     * Ensures that the user can reach the login page and sees the expected title.
     */
    test('should load the login page successfully', async ({ page }) => {
        // Navigate to the root (which should redirect to login if not authenticated)
        await page.goto('/');

        // Check if the page title or a key heading is present
        // Adjust selector as per your actual UI
        await expect(page).toHaveTitle(/HRMS/);

        // Example: Check for a login button or form field
        // const loginButton = page.locator('button:has-text("Login")');
        // await expect(loginButton).toBeVisible();
    });

});
