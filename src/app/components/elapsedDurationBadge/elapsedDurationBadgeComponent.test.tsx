import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import ElapsedDurationBadgeComponent from "./elapsedDurationBadgeComponent";

// Stesso pattern di taskWorkTimerComponent.test.tsx: isola i soli segmenti
// numerici a due cifre dai separatori ":" (aria-hidden).
function getSegments(container: HTMLElement) {
  return within(container).getAllByText(/^\d{2}$/);
}

describe("ElapsedDurationBadgeComponent", () => {
  it("mostra i 4 segmenti a due cifre, con i segmenti a zero attenuati", () => {
    const { container } = render(<ElapsedDurationBadgeComponent totalSeconds={3600} />);

    const [days, hours, minutes, seconds] = getSegments(container);
    expect(days).toHaveTextContent("00");
    expect(hours).toHaveTextContent("01");
    expect(minutes).toHaveTextContent("00");
    expect(seconds).toHaveTextContent("00");
    expect(days.className).toContain("segmentMuted");
    expect(hours.className).not.toContain("segmentMuted");
    expect(minutes.className).toContain("segmentMuted");
    expect(seconds.className).toContain("segmentMuted");
  });

  it("espone un tooltip con ogni unità di tempo separata su una riga", () => {
    // getByTitle normalizza gli spazi bianchi (i "\n" diventerebbero " "):
    // qui serve leggere l'attributo title grezzo per verificare gli a-capo.
    const { container } = render(
      <ElapsedDurationBadgeComponent totalSeconds={86400 + 3600 + 55 * 60 + 34} />,
    );

    expect(container.querySelector("[title]")).toHaveAttribute(
      "title",
      "giorni: 1\nore: 1\nminuti: 55\nsecondi: 34",
    );
  });

  it("tronca i secondi frazionari e riporta a zero i valori negativi", () => {
    const { container: positive } = render(<ElapsedDurationBadgeComponent totalSeconds={12.9} />);
    const [, , , seconds] = getSegments(positive);
    expect(seconds).toHaveTextContent("12");

    const { container: negative } = render(<ElapsedDurationBadgeComponent totalSeconds={-5} />);
    const [, , , negativeSeconds] = getSegments(negative);
    expect(negativeSeconds).toHaveTextContent("00");
  });
});
