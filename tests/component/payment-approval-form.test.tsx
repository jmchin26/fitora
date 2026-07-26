import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaymentApprovalForm } from "@/components/checkout/payment-approval-form";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PaymentApprovalForm", () => {
  it("requires a valid email and explicit order approval", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PaymentApprovalForm />);

    await user.click(screen.getByRole("button", { name: "Continue to payment" }));

    expect(screen.getByText("Enter a valid email address for the payment receipt.")).toBeInTheDocument();
    expect(
      screen.getByText("Confirm that you reviewed the order before continuing."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveFocus();
  });

  it("posts only the trimmed email and navigates to a schema-verified hosted page", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        provider: "mock",
        hostedUrl: "/checkout/mock",
        expiresAt: "2026-07-26T12:15:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PaymentApprovalForm onNavigate={navigate} />);

    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "  shopper@example.com  ",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the three products/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/checkout/mock"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/checkout/create-session",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "shopper@example.com" }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).not.toContain("approved");
  });

  it("rejects a malformed hosted URL without navigating", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          provider: "prava",
          hostedUrl: "http://attacker.example/checkout",
          expiresAt: "2026-07-26T12:15:00.000Z",
        }),
      ),
    );
    render(<PaymentApprovalForm onNavigate={navigate} />);

    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "shopper@example.com",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the three products/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "unexpected payment response",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("aborts an unfinished session request when removed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<PaymentApprovalForm />);

    await user.type(
      screen.getByRole("textbox", { name: "Email address" }),
      "shopper@example.com",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /I reviewed the three products/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
