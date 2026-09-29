import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";
import { openSettingsHostSection } from "../support/helpers/settings";
import { installUsageReportsFixture } from "../support/helpers/usage-reports";
import {
  claudeAndCodexReports,
  expectNoSummary,
  expectSummary,
  leaveUsageScreen,
  openCompactSidebar,
  pinRow,
  showUsageAs,
  togglePin,
  usageIcon,
  usageExpanded,
  usageSummary,
} from "../support/helpers/usage-summary";

const WIDE = { width: 1440, height: 900 };
const COMPACT = { width: 390, height: 844 };

/** Set PASEO_QA_SCREENSHOT_DIR to keep QA screenshots of each state. */
async function qaScreenshot(page: Page, name: string, options: { footerOnly?: boolean } = {}) {
  const directory = process.env.PASEO_QA_SCREENSHOT_DIR;
  if (!directory) return;
  // Let popover, sheet and drawer animations settle so the image shows the final state.
  await page.waitForTimeout(600);
  // Expo's fast-refresh indicator sits over the footer's Hosts icon.
  await page.addStyleTag({ content: ".__expo_fast_refresh { display: none !important; }" });
  const clip = options.footerOnly ? await footerClip(page) : undefined;
  await page.screenshot({ path: path.join(directory, `phase3-${name}.png`), clip });
}

/** The sidebar footer, from Add project down to the icon row, with some margin. */
async function footerClip(page: Page) {
  const top = (await page.locator('[data-testid="sidebar-add-project"]:visible').boundingBox())!;
  const bottom = (await page.locator('[data-testid="sidebar-settings"]:visible').boundingBox())!;
  const margin = 16;
  const x = Math.max(0, top.x - margin);
  const y = Math.max(0, top.y - margin);
  return { x, y, width: 300, height: bottom.y + bottom.height + margin - y };
}

test.describe("usage summary", () => {
  test("pinned windows show in the sidebar, follow the used/remaining toggle and persist", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const serverId = getServerId();
    await installUsageReportsFixture(page, { lists: [() => claudeAndCodexReports()] });
    await page.setViewportSize(WIDE);
    await gotoAppShell(page);
    const screen = page.getByTestId(`usage-host-${serverId}`);

    await test.step("a fresh device shows no summary, and the Usage icon", async () => {
      await expect(usageIcon(page)).toBeVisible({ timeout: 30_000 });
      await expectNoSummary(page);
      await qaScreenshot(page, "desktop-empty");
    });

    await test.step("pinning Claude 5-hour and Codex weekly shows both in the summary", async () => {
      await usageIcon(page).click();
      await expect(page).toHaveURL(/\/usage$/);
      await expect(screen.getByText("Claude", { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("usage-host-switcher")).toHaveCount(0);
      await togglePin(screen, "Claude", "Session");
      await togglePin(screen, "Codex", "Weekly");
      await expectSummary(page, ["31%", "12%"]);
      await qaScreenshot(page, "desktop-usage-screen");
      await qaScreenshot(page, "desktop-footer-closeup", { footerOnly: true });
      await pinRow(screen, "Claude", "Weekly").hover();
      await qaScreenshot(page, "desktop-row-hover");
      await page.emulateMedia({ colorScheme: "dark" });
      await qaScreenshot(page, "desktop-row-hover-dark");
      await page.emulateMedia({ colorScheme: "light" });
    });

    await test.step("remaining flips the summary, the popover and the Usage screen", async () => {
      await showUsageAs(page, "remaining");
      await expectSummary(page, ["69% left", "88% left"]);
      await qaScreenshot(page, "desktop-summary");
      await expect(
        screen.getByTestId("usage-report-claude:default").getByText("69% left"),
      ).toBeVisible();
      await expect(
        screen.getByTestId("usage-report-codex:default").getByText("88% left"),
      ).toBeVisible();

      await usageSummary(page).click();
      const popover = usageExpanded(page);
      await expect(popover).toBeVisible();
      await expect(
        popover.getByTestId("usage-report-claude:default").getByText("69% left"),
      ).toBeVisible();
      await expect(pinRow(popover, "Claude", "Session")).toBeChecked();
      await expect(pinRow(popover, "Claude", "Weekly")).not.toBeChecked();
      const popoverBox = (await popover.boundingBox())!;
      const summaryBox = (await usageSummary(page).boundingBox())!;
      expect(popoverBox.y + popoverBox.height).toBeLessThanOrEqual(summaryBox.y);
      expect(Math.abs(popoverBox.x - summaryBox.x)).toBeLessThan(80);
      await qaScreenshot(page, "desktop-popover");
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
    });

    await test.step("on a phone the summary opens a bottom sheet", async () => {
      await page.setViewportSize(COMPACT);
      await qaScreenshot(page, "compact-usage-screen");
      await leaveUsageScreen(page);
      await openCompactSidebar(page);
      await expect(usageSummary(page)).toBeInViewport();
      await expectSummary(page, ["69% left", "88% left"]);
      await qaScreenshot(page, "compact-summary");
      await qaScreenshot(page, "compact-footer-closeup", { footerOnly: true });
      await usageSummary(page).click();
      const sheet = usageExpanded(page);
      await expect(sheet.getByText("Codex", { exact: true })).toBeInViewport();
      await expect(sheet.getByText("88% left")).toBeVisible();
      const sheetBox = (await sheet.boundingBox())!;
      expect(sheetBox.y).toBeGreaterThan(COMPACT.height / 3);
      expect(sheetBox.width).toBeGreaterThan(COMPACT.width * 0.8);
      await qaScreenshot(page, "compact-sheet");
      // Tap the backdrop above the sheet.
      await page.mouse.click(COMPACT.width / 2, sheetBox.y / 2);
      await expect(sheet).toHaveCount(0);
      await page.setViewportSize(WIDE);
      await usageIcon(page).click();
      await expect(page).toHaveURL(/\/usage$/);
    });

    await test.step("a reload keeps the pins and the toggle", async () => {
      await page.reload();
      await expectSummary(page, ["69% left", "88% left"]);
      await expect(
        page.locator('[data-testid="usage-display-remaining"]:visible').first(),
      ).toHaveAttribute("aria-selected", "true");
    });

    await test.step("the Settings usage section shares the pins and the toggle", async () => {
      const usageUrl = page.url();
      await openSettings(page);
      await openSettingsHostSection(page, serverId, "usage");
      const section = page.getByTestId("usage-card");
      await expect(section.getByText("69% left")).toBeVisible({ timeout: 10_000 });
      await expect(pinRow(section, "Codex", "Weekly")).toBeChecked();
      await qaScreenshot(page, "desktop-settings-usage");
      await page.goto(usageUrl);
      await expect(screen.getByText("Claude", { exact: true })).toBeVisible({ timeout: 10_000 });
    });

    await test.step("unpinning both hides the summary, and that also survives a reload", async () => {
      await togglePin(screen, "Claude", "Session");
      await togglePin(screen, "Codex", "Weekly");
      await expectNoSummary(page);
      await page.reload();
      await expect(screen.getByText("88% left")).toBeVisible({ timeout: 10_000 });
      await expectNoSummary(page);
      await expect(usageIcon(page)).toBeVisible();
      await page.setViewportSize(COMPACT);
      await leaveUsageScreen(page);
      await openCompactSidebar(page);
      await expect(usageIcon(page)).toBeInViewport();
      await qaScreenshot(page, "compact-empty");
    });
  });
});
