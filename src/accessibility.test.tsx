// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("public page accessibility", () => {
  it.each([
    ["/", "Join a scavenger hunt"],
    ["/privacy", "Privacy"],
    ["/terms", "Terms"],
    ["/support", "Support"],
    ["/templates/classroom", "Classroom Starter"],
  ])("has no automated accessibility violations at %s", async (path, heading) => {
    window.history.replaceState({}, "", path);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
    });
    if (path === "/privacy" || path === "/terms" || path === "/support") {
      expect(document.title).toBe(`${heading} | Scavenger Blackout`);
    }

    const result = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(
      result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });

  it("publishes the configured monitored support contact", async () => {
    window.history.replaceState({}, "", "/support");
    render(<App />);

    const contact = await screen.findByRole("link", {
      name: "support@example.org",
    });
    expect(contact.getAttribute("href")).toBe("mailto:support@example.org");
  });

  it("explains the Google Drive export on the privacy page", async () => {
    window.history.replaceState({}, "", "/privacy");
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Google Drive access" }),
    ).toBeTruthy();
    expect(screen.getByText(/short-lived Google access token/i)).toBeTruthy();
    expect(screen.getByText(/separate copy/i)).toBeTruthy();
  });

  it("presents the game as something anyone can host", async () => {
    render(<App />);

    expect(await screen.findByText(/anyone can host/i)).toBeTruthy();
    expect(screen.getByText(/friends, family, a class, or any other group/i)).toBeTruthy();
  });
});
