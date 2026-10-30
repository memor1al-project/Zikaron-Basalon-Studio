import { createPortal } from "react-dom";
import {
  UNPACK_CMD,
  UNPACK_CMD_FILENAME,
  UNPACK_SH,
  UNPACK_SH_FILENAME,
} from "./unpackScripts";

/**
 * Explains unpacking a large archive before handing over the tool to do it.
 *
 * A file that arrives without explanation gets left in a downloads folder. The steps are
 * few but they matter — the script has to sit beside the archive, and the folder it makes
 * is what gets connected afterwards — so they're stated before the download rather than
 * left to a README nobody opens.
 */
export function UnpackDialog({ onClose }: { onClose: () => void }) {
  function download(filename: string, contents: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(20% 0.02 50 / 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 24,
        overflowY: "auto",
        zIndex: 70,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-enter"
        style={{
          width: "min(620px, 100%)",
          background: "var(--bg-cream)",
          borderRadius: 16,
          marginBlock: "auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <h2 style={{ fontSize: 17 }}>Unpacking a large archive</h2>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12.5 }}>
            Close
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6, marginBottom: 16 }}>
            Importing in the browser reads the whole archive into memory at once, which a large family archive
            won't fit into. This small script unpacks it straight to disk instead, however big it is.
          </p>

          <ol
            style={{
              margin: "0 0 20px",
              paddingInlineStart: 20,
              display: "flex",
              flexDirection: "column",
              gap: 9,
              fontSize: 13.5,
              lineHeight: 1.55,
            }}
          >
            <li>Download the script for your computer, below.</li>
            <li>
              Move it into the <strong>same folder as the archive</strong> — the one ending in{" "}
              <code>.zikaron.zip</code>.
            </li>
            <li>
              <strong>On a Mac or Linux:</strong> open Terminal in that folder and run{" "}
              <code>bash {UNPACK_SH_FILENAME}</code>.
              <br />
              <strong>On Windows:</strong> double-click <code>{UNPACK_CMD_FILENAME}</code>.
            </li>
            <li>It prints what the archive holds, then unpacks it into a new folder beside the archive.</li>
            <li>
              Come back here, choose <strong>Storage</strong>, and connect that folder. The story reopens with its
              tags, notes and faces.
            </li>
          </ol>

          <div
            style={{
              background: "var(--bg-cream-2)",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 20,
              fontSize: 12.5,
              color: "var(--ink-soft)",
              lineHeight: 1.6,
            }}
          >
            The script only reads the archive and writes the files out. It never replaces a file that is already
            there, and it never deletes anything — running it twice is safe. It needs nothing installed: it uses
            the unzip tool your computer already has.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => download(UNPACK_SH_FILENAME, UNPACK_SH)}
              style={{ fontSize: 13.5 }}
            >
              Download for Mac or Linux
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => download(UNPACK_CMD_FILENAME, UNPACK_CMD)}
              style={{ fontSize: 13.5 }}
            >
              Download for Windows
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
