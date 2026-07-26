import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaymentApprovalForm } from "@/components/checkout/payment-approval-form";
import { reservePravaBrowserAttempt } from "@/lib/checkout/prava-browser-lease";

const REVIEW_ID = "40000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "c0000000-0000-4000-8000-00000000000c";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PaymentApprovalForm", () => {
  it("requires a valid email and explicit order approval", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PaymentApprovalForm
        attemptId={ATTEMPT_ID}
        reviewId={REVIEW_ID}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Continue to payment" }));

    expect(screen.getByText("Enter a valid email address for the payment receipt.")).toBeInTheDocument();
    expect(
      screen.getByText("Confirm that you reviewed the order before continuing."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Email address" })).toHaveFocus();
  });

  it("posts the trimmed email bound to the displayed review and navigates to a schema-verified hosted page", async () => {
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
    render(
      <PaymentApprovalForm
        attemptId={ATTEMPT_ID}
        onNavigate={navigate}
        reviewId={REVIEW_ID}
      />,
    );

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
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      attemptId: ATTEMPT_ID,
      email: "shopper@example.com",
      reviewId: REVIEW_ID,
    });
    expect(String((fetchMock.mock.calls[0][1] as RequestInit).body)).not.toContain("approved");
  });

  it("locks a malformed successful response without navigating", async () => {
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
    render(
      <PaymentApprovalForm
        attemptId={ATTEMPT_ID}
        onNavigate={navigate}
        reviewId={REVIEW_ID}
      />,
    );

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
    expect(screen.getByRole("button", { name: "Session status uncertain" })).toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("locks an attempt when the server cannot determine whether Prava created it", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "PAYMENT_SESSION_UNCERTAIN",
            message:
              "The payment session status is uncertain. Do not retry this attempt.",
          },
        },
        503,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PaymentApprovalForm
        attemptId={ATTEMPT_ID}
        provider="prava"
        reviewId={REVIEW_ID}
      />,
    );

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
      "The payment session status is uncertain",
    );
    expect(screen.getByRole("button", { name: "Session status uncertain" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Email address" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("blocks a second Prava attempt while another browser tab owns the lease", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await reservePravaBrowserAttempt(
      "a0000000-0000-4000-8000-00000000000a",
      { storage: window.localStorage },
    );
    render(
      <PaymentApprovalForm
        attemptId={ATTEMPT_ID}
        provider="prava"
        reviewId={REVIEW_ID}
      />,
    );

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
      "Another Prava checkout is already active",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts an unfinished session request when removed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <PaymentApprovalForm
        attemptId={ATTEMPT_ID}
        reviewId={REVIEW_ID}
      />,
    );

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
