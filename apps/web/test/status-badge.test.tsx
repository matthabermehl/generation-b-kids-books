import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "../src/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders normalized status labels", () => {
    render(<StatusBadge value="needs_review" />);

    expect(screen.getByText("needs review")).toBeInTheDocument();
  });

  it("applies the destructive tone to failed states", () => {
    render(<StatusBadge value="failed" />);

    expect(screen.getByText("failed")).toHaveClass("text-rose-700");
  });
});
