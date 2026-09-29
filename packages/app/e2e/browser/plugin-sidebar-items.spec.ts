import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import {
  COMPACT,
  LEGACY_PLUGIN_ID,
  SHOWCASE_PLUGIN_ID,
  WIDE,
  closeScreen,
  expectRowActive,
  footerItem,
  headerRow,
  installSidebarPlugins,
  popoverBox,
  runCommand,
  visibleTestId,
} from "../support/helpers/plugin-sidebar-items";
import { openSidebarNavSettings } from "../support/helpers/sidebar-nav-settings";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";

const APP_SETTINGS_KEY = "@paseo:app-settings";

/** Set PASEO_QA_SCREENSHOT_DIR to keep QA screenshots of each state. */
async function qaScreenshot(page: Page, name: string, area?: Locator) {
  const directory = process.env.PASEO_QA_SCREENSHOT_DIR;
  if (!directory) return;
  // Let popover, sheet and drawer animations settle so the image shows the final state.
  await page.waitForTimeout(600);
  // Expo's fast-refresh indicator sits over the footer's Hosts icon.
  await page.addStyleTag({ content: ".__expo_fast_refresh { display: none !important; }" });
  const file = path.join(directory, `${name}.png`);
  if (area) await area.screenshot({ path: file });
  else await page.screenshot({ path: file });
}

/** Footer rows sit between the fixed Add project row and the fixed icon row, full width. */
async function expectFooterRow(page: Page, row: Locator) {
  // Polled: on compact the drawer is still sliding in when the row first shows.
  await expect
    .poll(async () => {
      const addProject = (await visibleTestId(page, "sidebar-add-project").boundingBox())!;
      const hosts = (await visibleTestId(page, "sidebar-hosts-trigger").boundingBox())!;
      const box = (await row.boundingBox())!;
      return {
        belowAddProject: box.y >= addProject.y + addProject.height,
        aboveIconRow: box.y + box.height <= hosts.y,
        alignedLeft: Math.abs(box.x - addProject.x) < 1,
        fullWidth: Math.abs(box.width - addProject.width) < 1,
      };
    })
    .toEqual({ belowAddProject: true, aboveIconRow: true, alignedLeft: true, fullWidth: true });
}

function sidebarFooter(page: Page): Locator {
  return visibleTestId(page, "sidebar-add-project").locator("xpath=..");
}

test.describe("Plugin sidebar items", () => {
  let workspaceId: string;
  let cleanup: () => Promise<void>;

  test.beforeEach(async () => {
    const workspace = await seedWorkspace({ repoPrefix: "plugin-sidebar-items-" });
    const plugins = await installSidebarPlugins();
    workspaceId = workspace.workspaceId;
    cleanup = async () => {
      await plugins.cleanup();
      await workspace.cleanup();
    };
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("a plugin's screen, header row, footer popover and command work together", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(WIDE);
    await gotoWorkspace(page, workspaceId);
    const row = headerRow(page, SHOWCASE_PLUGIN_ID, "deploys");
    const sync = footerItem(page, SHOWCASE_PLUGIN_ID, "sync");
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(sync).toBeVisible();

    await test.step("a throwing item renders nothing and leaves the sidebar working", async () => {
      await expect(visibleTestId(page, `plugin-sidebar-${SHOWCASE_PLUGIN_ID}-broken`)).toHaveCount(
        0,
      );
      await expect(footerItem(page, SHOWCASE_PLUGIN_ID, "broken")).toHaveCount(0);
      await expect(page.getByText("Plugin failed", { exact: false })).toHaveCount(0);
      await expect(visibleTestId(page, "sidebar-settings")).toBeVisible();
    });

    await test.step("the header row highlights while its screen is open", async () => {
      await expectRowActive(row, false);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/plugin/${SHOWCASE_PLUGIN_ID}/surface/deploys`));
      await expect(page.getByText("Deploys screen body", { exact: true })).toBeVisible();
      await expectRowActive(row, true);
      await qaScreenshot(page, "phase2-desktop-sidebar-screen");
      await closeScreen(page);
      await expectRowActive(row, false);
    });

    await test.step("the trailing button presses on its own", async () => {
      await page.getByRole("button", { name: "Refresh deploys", exact: true }).click();
      await expect(row).toHaveAccessibleName("Deploys (refreshed 1)");
      await expect(page).not.toHaveURL(/\/plugin\//);
      await expect(page.getByText("Deploys screen body", { exact: true })).toHaveCount(0);
    });

    await test.step("the footer row renders as a row between Add project and the icon row", async () => {
      await expect(sync).toHaveAccessibleName("Sync");
      await expectFooterRow(page, sync);
      await expect(visibleTestId(page, "sidebar-usage")).toBeVisible();
      await qaScreenshot(page, "phase5-desktop-footer", sidebarFooter(page));
    });

    await test.step("the footer row opens a popover anchored to it", async () => {
      await sync.click();
      const popover = await popoverBox(page);
      const button = (await sync.boundingBox())!;
      await expect(page.getByText("Presentation: wide", { exact: true })).toBeVisible();
      expect(popover.y + popover.height).toBeLessThanOrEqual(button.y);
      expect(button.y - popover.y).toBeLessThan(300);
      expect(Math.abs(popover.x - button.x)).toBeLessThan(80);
      await qaScreenshot(page, "phase2-desktop-popover");
      await page.getByRole("button", { name: "Open deploys from popover", exact: true }).click();
      await expect(page.getByText("Deploys screen body", { exact: true })).toBeVisible();
      await expect(page.getByText("Sync details", { exact: true })).toHaveCount(0);
      await closeScreen(page);
    });

    await test.step("the command center item opens the screen", async () => {
      await runCommand(page, "Open deploys");
      await expect(page.getByText("Deploys screen body", { exact: true })).toBeVisible();
      await expectRowActive(row, true);
      await closeScreen(page);
    });

    await test.step("on a compact layout the popover is a bottom sheet", async () => {
      await page.setViewportSize(COMPACT);
      await page.getByRole("button", { name: "Open menu", exact: true }).first().click();
      const compactSync = footerItem(page, SHOWCASE_PLUGIN_ID, "sync");
      await expect(compactSync).toBeInViewport();
      await expectFooterRow(page, compactSync);
      await expect(headerRow(page, SHOWCASE_PLUGIN_ID, "deploys")).toBeInViewport();
      await qaScreenshot(page, "phase2-compact-sidebar");
      await qaScreenshot(page, "phase5-compact-footer", sidebarFooter(page));
      await compactSync.click();
      await expect(page.getByText("Presentation: compact", { exact: true })).toBeVisible();
      const sheet = await popoverBox(page);
      expect(sheet.y).toBeGreaterThan(COMPACT.height / 2);
      await qaScreenshot(page, "phase2-compact-sheet");
      await page.getByRole("button", { name: "Close sync details", exact: true }).click();
      await expect(page.getByText("Sync details", { exact: true })).toHaveCount(0);
    });
  });

  test("a legacy plugin keeps its row, icon, order and visibility", async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(
      ({ key, sidebarNavItems }) => localStorage.setItem(key, JSON.stringify({ sidebarNavItems })),
      {
        key: APP_SETTINGS_KEY,
        sidebarNavItems: [
          { key: `plugin:${LEGACY_PLUGIN_ID}:entry`, visible: true },
          { key: "new-workspace", visible: true },
          { key: `plugin:${LEGACY_PLUGIN_ID}:hidden`, visible: false },
        ],
      },
    );
    await page.setViewportSize(WIDE);
    await gotoWorkspace(page, workspaceId);
    const entry = headerRow(page, LEGACY_PLUGIN_ID, "entry");
    await expect(entry).toBeVisible({ timeout: 30_000 });

    await test.step("the saved order and visibility still apply", async () => {
      await expect(entry).toHaveAccessibleName("Legacy entry");
      await expect(entry.locator("svg")).toHaveCount(1);
      await expect(headerRow(page, LEGACY_PLUGIN_ID, "hidden")).toHaveCount(0);
      const entryBox = (await entry.boundingBox())!;
      const newWorkspaceBox = (await visibleTestId(
        page,
        "sidebar-global-new-workspace",
      ).boundingBox())!;
      expect(entryBox.y).toBeLessThan(newWorkspaceBox.y);
    });

    await test.step("the row opens its surface and highlights", async () => {
      await entry.click();
      await expect(page.getByText("Legacy screen body", { exact: true })).toBeVisible();
      await expect(page.getByTestId("plugin-surface-close")).toBeVisible();
      await expect(page.getByText("Legacy entry", { exact: true }).last()).toBeVisible();
      await expectRowActive(entry, true);
      await closeScreen(page);
    });

    await test.step("remembered sidebar routes keep resolving", async () => {
      await page.goto(
        `/h/${encodeURIComponent(getServerId())}/plugin/${LEGACY_PLUGIN_ID}/sidebar/entry`,
      );
      await expect(page.getByText("Legacy screen body", { exact: true })).toBeVisible();
      await expectRowActive(headerRow(page, LEGACY_PLUGIN_ID, "entry"), true);
    });

    await test.step("settings lists plugin rows with one generic icon", async () => {
      await openSidebarNavSettings(page);
      const legacyIcon = page
        .getByTestId(`sidebar-nav-item-plugin:${LEGACY_PLUGIN_ID}:entry`)
        .locator("svg")
        .first();
      const showcaseIcon = page
        .getByTestId(`sidebar-nav-item-plugin:${SHOWCASE_PLUGIN_ID}:deploys`)
        .locator("svg")
        .first();
      const footerIcon = page
        .getByTestId("sidebar-nav-section-footer")
        .getByTestId(`sidebar-nav-item-plugin:${SHOWCASE_PLUGIN_ID}:sync`)
        .locator("svg")
        .first();
      const markup = await legacyIcon.innerHTML();
      expect(await showcaseIcon.innerHTML()).toBe(markup);
      expect(await footerIcon.innerHTML()).toBe(markup);
      await qaScreenshot(page, "phase2-desktop-settings-sidebar");
      await qaScreenshot(
        page,
        "phase5-settings-sidebar-footer",
        page.getByTestId("sidebar-nav-section-footer"),
      );
      await page.setViewportSize(COMPACT);
      await expect(page.getByTestId("sidebar-nav-section-footer").first()).toBeAttached();
      await qaScreenshot(page, "phase2-compact-settings-sidebar");
    });
  });
});
