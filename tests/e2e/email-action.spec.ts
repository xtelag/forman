import { expect, test } from "@playwright/test";

test("Email Action settings persist and remain usable across viewports", async ({
  page,
}, testInfo) => {
  const sourceName = `Email source ${testInfo.project.name}-${testInfo.retry}`;
  const pipelineName = `Email pipeline ${testInfo.project.name}-${testInfo.retry}`;

  await page.goto("/login");
  await page.locator('input[name="username"]').fill("forman");
  await page.locator('input[name="password"]').fill("forman-e2e-password-2026");
  await page.getByRole("button", { name: "Login" }).click();

  await page.goto("/app/sources");
  await page.getByRole("button", { name: "Create Source" }).click();
  await page.locator("#form-name").fill(sourceName);
  await page.getByRole("radio", { name: "One-shot", exact: true }).check();
  await page
    .getByRole("dialog", { name: "Create Source" })
    .getByRole("button", { name: "Create Source" })
    .click();
  await expect(page).toHaveURL(
    /\/app\/sources\/[abcdefghjkmnpqrstuvwxyz023456789]{10}$/,
  );


  await page.goto("/app/pipelines");
  await page.getByRole("button", { name: "Create Pipeline" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill(pipelineName);
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .fill(sourceName);
  await page.getByRole("option", { name: sourceName }).click();
  await page
    .getByRole("dialog", { name: "Create Pipeline" })
    .getByRole("button", { name: "Create Pipeline" })
    .click();
  await expect(page).toHaveURL(
    /\/app\/pipelines\/[abcdefghjkmnpqrstuvwxyz023456789]{16}$/,
  );


  await page.getByRole("button", { name: "Add Action" }).click();
  await page.getByLabel("Action 1 name").fill("Email enquiry");
  await page.getByLabel("Action 1 type").click();
  await page.getByRole("option", { name: "E-mail", exact: true }).click();
  const subject = page.getByRole("textbox", { name: /^Subject/ });
  await expect(subject).toHaveValue(sourceName);
  await expect(page.getByRole("combobox", { name: "Content format" })).toHaveValue("Formatted");
  await page.getByRole("textbox", { name: "Recipients", exact: true }).fill("recipient@example.test");
  await subject.fill("New contact enquiry");
  await page.getByRole("button", { name: "Save Action" }).click();
  await expect(page.getByRole("button", { name: "Save Action" })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: /1\. Email enquiry/ }).click();
  await expect(subject).toHaveValue("New contact enquiry");
  await expect(page.getByRole("combobox", { name: "Content format" })).toHaveValue("Formatted");
  await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.setAttribute("data-mantine-color-scheme", value), scheme);
      await subject.scrollIntoViewIfNeeded();
      await page.getByRole("combobox", { name: "Content format" }).focus();
      await page.keyboard.press("Tab");
      await expect(subject).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("email-" + width + "-" + scheme + ".png"), animations: "disabled" });
      await page.getByRole("button", { name: "Save Action" }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "Save Action" })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath("email-bottom-" + width + "-" + scheme + ".png") });
    }
  }
  const summary = page.getByRole("button", { name: /1\. Email enquiry/ });
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.setAttribute("data-mantine-color-scheme", value), scheme);
      for (const expanded of [false, true]) {
        if ((await summary.getAttribute("aria-expanded")) !== String(expanded)) await summary.click();
        await summary.scrollIntoViewIfNeeded();
        await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
        const menu = page.getByRole("button", { name: "Actions for Action 1", exact: true });
        await expect(menu).toBeInViewport();
        const name = summary.locator("[title='Email enquiry']");
        const nameBox = await name.boundingBox();
        const menuBox = await menu.boundingBox();
        const chevronBox = await summary.locator(".mantine-Accordion-chevron").boundingBox();
        expect(chevronBox).not.toBeNull();
        expect(chevronBox!.x + chevronBox!.width).toBeLessThanOrEqual(nameBox!.x);
        expect(Math.abs((chevronBox!.y + chevronBox!.height / 2) - (nameBox!.y + nameBox!.height / 2))).toBeLessThan(4);
        expect(nameBox).not.toBeNull();
        expect(menuBox).not.toBeNull();
        expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(menuBox!.x);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({path: testInfo.outputPath("summary-" + width + "-" + scheme + "-" + expanded + ".png"), animations: "disabled"});
      }
    }
  }
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({width, height: 900});
    const nameInput = page.locator("#pipeline-name");
    await nameInput.scrollIntoViewIfNeeded();
    const saveConfig = page.getByRole("button", {name: "Save changes", exact: true});
    const beforeSave = await saveConfig.boundingBox();
    await nameInput.fill(pipelineName + " edited");
    const afterSave = await saveConfig.boundingBox();
    expect(afterSave!.y).toBe(beforeSave!.y);
    expect(afterSave!.x).toBe(beforeSave!.x);
    await expect(page.getByRole("button", {name: "Save changes", exact: true})).toBeEnabled();
    await nameInput.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path: testInfo.outputPath("pipeline-config-dirty-" + width + ".png")});
    await nameInput.fill(pipelineName);
    await expect(page.getByRole("button", {name: "Save changes", exact: true})).toBeDisabled();
  }
  await subject.fill("  ");
  await page.getByRole("button", { name: "Save Action" }).click();
  await expect(page.getByText("Enter subject.", { exact: true })).toBeVisible();
  await subject.fill("Custom subject");
  await page.getByRole("combobox", { name: "Content format" }).click();
  await page.getByRole("option", { name: "JSON", exact: true }).click();
  await page.getByRole("button", { name: "Save Action" }).click();
  await expect(page.getByRole("button", { name: "Save Action" })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: /1\. Email enquiry/ }).click();
  await expect(subject).toHaveValue("Custom subject");
  await expect(page.getByRole("combobox", { name: "Content format" })).toHaveValue("JSON");
});
