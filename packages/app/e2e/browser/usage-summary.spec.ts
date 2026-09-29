import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";
import { openSettingsHostSection } from "../support/helpers/settings";
import { leaveSettings, openSidebarNavSettings } from "../support/helpers/sidebar-nav-settings";
import { installUsageReportsFixture } from "../support/helpers/usage-reports";
import {
  claudeAndCodexReports,
  expectNoSummary,
  expectOnUsageScreen,
  expectSummary,
  leaveUsageScreen,
  openCompactSidebar,
  pinRow,
  showUsageAs,
  togglePin,
  usageRow,
  usageSheet,
  usageSummary,
} from "../support/helpers/usage-summary";

const WIDE = { width: 1440, height: 900 };
const COMPACT = { width: 390, height: 844 };

type ScreenshotArea = { kind: "page" } | { kind: "footer" } | { kind: "element"; locator: Locator };

/** Set PASEO_QA_SCREENSHOT_DIR to keep QA screenshots of each state. */
async function qaScreenshot(page: Page, name: string, area: ScreenshotArea = { kind: "page" }) {
  const directory = process.env.PASEO_QA_SCREENSHOT_DIR;
  if (!directory) return;
  // Let sheet and drawer animations settle so the image shows the final state.
  await page.waitForTimeout(600);
  // Expo's fast-refresh indicator sits over the footer's Hosts icon.
  await page.addStyleTag({ content: ".__expo_fast_refresh { display: none !important; }" });
  const file = path.join(directory, `phase4-${name}.png`);
  if (area.kind === "element") {
    await area.locator.screenshot({ path: file });
    return;
  }
  const clip = area.kind === "footer" ? await footerClip(page) : undefined;
  await page.screenshot({ path: file, clip });
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

    await test.step("a fresh device shows the plain Usage row, which opens the Usage screen", async () => {
      await expect(usageRow(page)).toBeVisible({ timeout: 30_000 });
      await expect(usageRow(page)).toHaveText("Usage");
      await expectNoSummary(page);
      await qaScreenshot(page, "desktop-footer-empty", { kind: "footer" });
      await usageRow(page).click();
      await expectOnUsageScreen(page);
    });

    await test.step("pinning Claude 5-hour and Codex weekly shows both in the summary", async () => {
      await expect(screen.getByText("Claude", { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("usage-host-switcher")).toHaveCount(0);
      await togglePin(screen, "Claude", "Session");
      await togglePin(screen, "Codex", "Weekly");
      await expectSummary(page, ["31%", "12%"]);
      await expect(usageRow(page)).toHaveCount(0);
      await qaScreenshot(page, "desktop-footer-pins", { kind: "footer" });
      await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeVisible();
      await qaScreenshot(page, "usage-screen-header", {
        kind: "element",
        locator: page.getByTestId("page-title").locator(".."),
      });
      await qaScreenshot(page, "usage-card-refresh", {
        kind: "element",
        locator: screen.getByTestId("usage-report-claude:default"),
      });
    });

    await test.step("remaining flips the summary and the Usage screen", async () => {
      await showUsageAs(page, "remaining");
      await expectSummary(page, ["69% left", "88% left"]);
      await expect(
        screen.getByTestId("usage-report-claude:default").getByText("69% left"),
      ).toBeVisible();
      await expect(
        screen.getByTestId("usage-report-codex:default").getByText("88% left"),
      ).toBeVisible();
    });

    await test.step("on desktop the summary opens the Usage screen", async () => {
      await gotoAppShell(page);
      await expect(page).not.toHaveURL(/\/usage$/);
      await usageSummary(page).click();
      await expectOnUsageScreen(page);
      await expect(page.getByTestId("usage-expanded")).toHaveCount(0);
    });

    await test.step("on a phone the summary opens a bottom sheet", async () => {
      await page.setViewportSize(COMPACT);
      await leaveUsageScreen(page);
      await openCompactSidebar(page);
      await expect(usageSummary(page)).toBeInViewport();
      await expectSummary(page, ["69% left", "88% left"]);
      await qaScreenshot(page, "compact-footer");
      await usageSummary(page).click();
      const sheet = usageSheet(page);
      await expect(sheet.getByText("Codex", { exact: true })).toBeInViewport();
      await expect(sheet.getByText("88% left")).toBeVisible();
      await expect(pinRow(sheet, "Claude", "Session")).toBeChecked();
      await expect(pinRow(sheet, "Claude", "Weekly")).not.toBeChecked();
      await expect(page).not.toHaveURL(/\/usage$/);
      const sheetBox = (await sheet.boundingBox())!;
      expect(sheetBox.y).toBeGreaterThan(COMPACT.height / 3);
      expect(sheetBox.width).toBeGreaterThan(COMPACT.width * 0.8);
      await qaScreenshot(page, "compact-sheet");
      // Tap the backdrop above the sheet.
      await page.mouse.click(COMPACT.width / 2, sheetBox.y / 2);
      await expect(sheet).toHaveCount(0);
      await page.setViewportSize(WIDE);
      await usageSummary(page).click();
      await expectOnUsageScreen(page);
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
      await page.goto(usageUrl);
      await expect(screen.getByText("Claude", { exact: true })).toBeVisible({ timeout: 10_000 });
    });

    await test.step("unpinning both brings back the Usage row, and that survives a reload", async () => {
      await togglePin(screen, "Claude", "Session");
      await togglePin(screen, "Codex", "Weekly");
      await expectNoSummary(page);
      await expect(usageRow(page)).toBeVisible();
      await page.reload();
      await expect(screen.getByText("88% left")).toBeVisible({ timeout: 10_000 });
      await expectNoSummary(page);
      await gotoAppShell(page);
      await usageRow(page).click();
      await expectOnUsageScreen(page);
    });

    await test.step("Settings > Sidebar lists the usage summary and no separate Usage button", async () => {
      await openSidebarNavSettings(page);
      const footer = page.getByTestId("sidebar-nav-section-footer");
      await expect(footer.getByTestId("sidebar-nav-item-usage-summary")).toBeVisible();
      await expect(footer.getByTestId("sidebar-nav-item-usage")).toHaveCount(0);
      await qaScreenshot(page, "settings-sidebar-footer", { kind: "element", locator: footer });
      await leaveSettings(page);
    });
  });
});
