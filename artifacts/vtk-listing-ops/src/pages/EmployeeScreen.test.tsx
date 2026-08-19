import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import EmployeeScreen from "./EmployeeScreen";

describe("approved employee workflow", () => {
  test("blank state is incomplete; selection and NONE are mutually exclusive", async () => {
    const user = userEvent.setup(); render(<EmployeeScreen />);
    expect(screen.getByTestId("btn-save-next")).toBeDisabled();
    await user.click(screen.getByText("NONE OF THESE ARE INCLUDED"));
    expect(screen.getByText("None included confirmed")).toBeInTheDocument();
    await user.click(screen.getByText("AC Power Adapter"));
    expect(screen.queryByText("None included confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "AC Power Adapter" })).toBeChecked();
  });

  test("condition radio keyboard navigation keeps one active condition", async () => {
    const user = userEvent.setup(); render(<EmployeeScreen />);
    const conditionA = screen.getByRole("radio", { name: "NEW" });
    conditionA.focus(); await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "NEW OPEN BOX" })).toBeChecked();
    expect(conditionA).not.toBeChecked();
  });

  test("F1 traps focus and shortcuts do not fire behind help", async () => {
    render(<EmployeeScreen />); fireEvent.keyDown(window, { key: "F1" });
    const dialog = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByTestId("btn-save-next")).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("shortcuts ignore inputs, textareas, contenteditable, modifiers, composition, and repeats", () => {
    const { container } = render(<EmployeeScreen />);
    const editable = document.createElement("div"); editable.setAttribute("contenteditable", "true"); container.append(editable);
    fireEvent.keyDown(editable, { key: "1" });
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    fireEvent.keyDown(window, { key: "1", isComposing: true });
    fireEvent.keyDown(window, { key: "1", repeat: true });
    expect(screen.getByText("NONE OF THESE ARE INCLUDED")).toBeInTheDocument();
  });

  test("input, textarea, and select each guard numeric workflow shortcuts", async () => {
    const user = userEvent.setup(); const { container } = render(<EmployeeScreen />);
    const input = screen.getByRole("checkbox", { name: "AC Power Adapter" }); fireEvent.keyDown(input, { key: "1" }); expect(input).not.toBeChecked();
    const textarea = document.createElement("textarea"); container.append(textarea); fireEvent.keyDown(textarea, { key: "1" }); expect(screen.queryByText("None included confirmed")).not.toBeInTheDocument();
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByTestId("btn-next-item"));
    const select = screen.getByRole("combobox"); await user.selectOptions(select, "FALSE"); fireEvent.keyDown(select, { key: "1" }); expect(select).toHaveValue("FALSE"); expect(screen.queryByText("None included confirmed")).not.toBeInTheDocument();
  });

  test("Check Count TRUE and FALSE selections are retained during navigation", async () => {
    const user = userEvent.setup(); render(<EmployeeScreen />); for (let index = 0; index < 4; index += 1) await user.click(screen.getByTestId("btn-next-item"));
    const select = screen.getByRole("combobox"); expect(select).toHaveValue("TRUE"); await user.selectOptions(select, "FALSE");
    await user.click(screen.getByTestId("btn-prev-item")); await user.click(screen.getByTestId("btn-next-item")); expect(screen.getByRole("combobox")).toHaveValue("FALSE");
  });

  test("navigation retains answers and does not leak them to the next item", async () => {
    const user = userEvent.setup(); render(<EmployeeScreen />);
    await user.click(screen.getByText("AC Power Adapter"));
    await user.click(screen.getByTestId("btn-next-item"));
    expect(screen.getByText("Power Cord")).toBeInTheDocument();
    expect(screen.getByText("NONE OF THESE ARE INCLUDED")).toBeInTheDocument();
    await user.click(screen.getByTestId("btn-prev-item"));
    expect(screen.getByRole("checkbox", { name: "AC Power Adapter" })).toBeChecked();
  });
});
