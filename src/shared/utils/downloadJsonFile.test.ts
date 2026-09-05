import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadJsonFile } from "./downloadJsonFile";

function captureDownload() {
  let capturedBlob: Blob | null = null;
  let capturedFileName = "";

  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    capturedBlob = blob as Blob;
    return "blob:mock";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      capturedFileName = this.download;
    },
  );

  return {
    getBlob: () => capturedBlob,
    getFileName: () => capturedFileName,
  };
}

describe("downloadJsonFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the downloaded file exactly as given", () => {
    const capture = captureDownload();
    downloadJsonFile({ hello: "world" }, "hodum-export-utente.json");
    expect(capture.getFileName()).toBe("hodum-export-utente.json");
  });

  it("serializes the data as JSON in a JSON-typed blob", async () => {
    const capture = captureDownload();
    const data = { profile: { id: "1" }, tasks: [] };
    downloadJsonFile(data, "hodum-export-utente.json");
    expect(capture.getBlob()?.type).toBe("application/json");
    const text = await capture.getBlob()!.text();
    expect(JSON.parse(text)).toEqual(data);
  });

  it("revokes the object URL after triggering the download", () => {
    captureDownload();
    downloadJsonFile({}, "file.json");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
